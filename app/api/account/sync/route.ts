import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { normalizeDeviceId } from '@/lib/server/device-id'
import {
  DeviceAlreadyClaimedError,
  DeviceAliasLimitError,
  mergeAndRetireDeviceData,
} from '@/lib/server/account-sync'
import {
  assertDeviceAvailableToUser,
  ensureDeviceOwnershipSchema,
  lockDeviceIds,
} from '@/lib/server/device-ownership'
import type { PoolClient } from 'pg'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { logServerError } from '@/lib/server/error-metadata'

async function repairEmptyAccountName(
  client: PoolClient,
  userId: string,
  deviceId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE "user" AS account
      SET name = profile.name, "updatedAt" = $3
      FROM profiles AS profile
      WHERE account.id = $1
        AND profile.device_id = $2
        AND btrim(account.name) = ''
        AND btrim(profile.name) <> ''
        AND lower(btrim(profile.name)) <> 'you'
    `,
    [userId, deviceId, new Date()],
  )
}

/**
 * Reconciles an authenticated account with the anonymous capability currently
 * held by this browser. A capability already claimed by a different account
 * can never be adopted or merged.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blocked = await protectExpensiveRequest(req, 'account-sync', {
    limit: 60,
    windowMs: 24 * 60 * 60_000,
    identity: session.user.id,
  })
  if (blocked) return blocked

  let rawDeviceId: unknown
  try {
    rawDeviceId = ((await req.json()) as { deviceId?: unknown }).deviceId
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const currentDeviceId = normalizeDeviceId(rawDeviceId)
  if (rawDeviceId !== undefined && !currentDeviceId) {
    return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 })
  }

  let client: PoolClient
  try {
    client = await pool.connect()
  } catch (error) {
    logServerError('[v0] account/sync database unavailable', error)
    return NextResponse.json({ error: 'Sync unavailable' }, { status: 503 })
  }
  try {
    await ensureDeviceOwnershipSchema(client)
    await client.query('BEGIN')
    const account = await client.query<{ dataDeviceId: string | null }>(
      'SELECT "dataDeviceId" FROM "user" WHERE id = $1 FOR UPDATE',
      [session.user.id],
    )
    if (account.rowCount !== 1) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const existing = account.rows[0].dataDeviceId?.trim() || null
    if (existing) {
      if (currentDeviceId && currentDeviceId !== existing) {
        await mergeAndRetireDeviceData(
          client,
          currentDeviceId,
          existing,
          session.user.id,
        )
      }
      await repairEmptyAccountName(client, session.user.id, existing)
      await client.query('COMMIT')
      return NextResponse.json({ deviceId: existing, adopted: false })
    }

    if (!currentDeviceId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 })
    }

    await lockDeviceIds(client, [currentDeviceId])
    const ownership = await assertDeviceAvailableToUser(
      client,
      currentDeviceId,
      session.user.id,
    )
    if (ownership) {
      await client.query(
        'UPDATE "user" SET "dataDeviceId" = $1, "updatedAt" = $2 WHERE id = $3',
        [ownership.canonicalDeviceId, new Date(), session.user.id],
      )
      await repairEmptyAccountName(
        client,
        session.user.id,
        ownership.canonicalDeviceId,
      )
      await client.query('COMMIT')
      return NextResponse.json({
        deviceId: ownership.canonicalDeviceId,
        adopted: false,
      })
    }
    await client.query(
      'UPDATE "user" SET "dataDeviceId" = $1, "updatedAt" = $2 WHERE id = $3',
      [currentDeviceId, new Date(), session.user.id],
    )
    await repairEmptyAccountName(client, session.user.id, currentDeviceId)
    await client.query('COMMIT')
    return NextResponse.json({ deviceId: currentDeviceId, adopted: true })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error instanceof DeviceAlreadyClaimedError) {
      return NextResponse.json(
        {
          error: 'This device data is already secured by another account.',
          code: 'DEVICE_ACCOUNT_MISMATCH',
        },
        { status: 409 },
      )
    }
    if (error instanceof DeviceAliasLimitError) {
      return NextResponse.json(
        {
          error: 'This account has reached its device safety limit.',
          code: 'DEVICE_LIMIT_REACHED',
        },
        { status: 429 },
      )
    }
    logServerError('[v0] account/sync failed', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
