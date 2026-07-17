import 'server-only'
import { logServerError } from './error-metadata.ts'

import { auth } from '@/lib/auth'
import { dbForClient, pool, type DbExecutor } from '@/lib/db'
import {
  ensureDeviceOwnershipSchema,
  getAliasCanonicalDeviceId,
  getDeviceOwnership,
  lockDeviceIds,
} from '@/lib/server/device-ownership'
import type { PoolClient } from 'pg'

export interface DeviceAccessScope {
  /** Canonical id to use for every query inside this transaction. */
  deviceId: string
  executor: DbExecutor
}

export type DeviceAccessResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response }

const unavailable = () =>
  Response.json({ error: 'Data access unavailable' }, { status: 503 })

class DeviceOperationError {
  constructor(readonly cause: unknown) {}
}

/**
 * Anonymous device ids are bearer capabilities until an account claims them.
 * Once claimed, only that account's authenticated session may use the id.
 *
 * Ownership is checked only after taking the same transaction-level advisory
 * lock used by account sync, and the callback's reads/writes use that exact
 * transaction. This closes the ownership-check / operation TOCTOU window.
 */
export async function withDeviceAccess<T>(
  req: Request,
  deviceId: string,
  operation: (scope: DeviceAccessScope) => Promise<T>,
): Promise<DeviceAccessResult<T>> {
  // Resolve the session before reserving a pool connection. Better Auth may
  // need its own database connection, so doing this inside the transaction can
  // starve a small pool when several authenticated requests arrive together.
  let sessionUserId: string | null = null
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    sessionUserId = session?.user?.id ?? null
  } catch (error) {
    logServerError('[v0] device session check failed', error)
    return { ok: false, response: unavailable() }
  }

  let client: PoolClient | null = null
  try {
    client = await pool.connect()
    await ensureDeviceOwnershipSchema(client)
  } catch (error) {
    client?.release()
    logServerError('[v0] device access database unavailable', error)
    return { ok: false, response: unavailable() }
  }

  try {
    // This read is only a lock-order hint. Ownership is always re-read below,
    // after the requested id (and any known canonical id) is locked.
    let canonicalHint = await getAliasCanonicalDeviceId(client, deviceId)

    for (let attempt = 0; attempt < 3; attempt++) {
      await client.query('BEGIN')
      const locked = await lockDeviceIds(client, [deviceId, canonicalHint])
      const ownership = await getDeviceOwnership(client, deviceId)
      const canonicalDeviceId = ownership?.canonicalDeviceId ?? deviceId

      // An alias may have committed between the hint read and our first lock.
      // Restart so its canonical id is acquired in deterministic sorted order.
      if (!locked.includes(canonicalDeviceId)) {
        await client.query('ROLLBACK')
        canonicalHint = canonicalDeviceId
        continue
      }

      if (ownership) {
        if (sessionUserId !== ownership.ownerUserId) {
          await client.query('ROLLBACK')
          const signedOut = sessionUserId === null
          return {
            ok: false,
            response: Response.json(
              signedOut
                ? {
                    error: 'Sign in on this device to access its secured data.',
                    code: 'DEVICE_AUTH_REQUIRED',
                  }
                : {
                    error: 'This data is secured to another account.',
                    code: 'DEVICE_ACCOUNT_MISMATCH',
                  },
              { status: signedOut ? 401 : 403 },
            ),
          }
        }
      }

      let value: T
      try {
        value = await operation({
          deviceId: canonicalDeviceId,
          executor: dbForClient(client),
        })
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw new DeviceOperationError(error)
      }

      await client.query('COMMIT')
      return { ok: true, value }
    }

    throw new Error('Device ownership changed repeatedly while acquiring locks')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error instanceof DeviceOperationError) throw error.cause
    logServerError('[v0] device transaction failed', error)
    return { ok: false, response: unavailable() }
  } finally {
    client.release()
  }
}
