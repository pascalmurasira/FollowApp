import { auth } from '@/lib/auth'
import { pool } from '@/lib/db'
import { normalizeDeviceId } from '@/lib/server/device-id'
import {
  DeviceAlreadyClaimedError,
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
    console.error('[v0] account/sync database unavailable:', error)
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
    await client.query('COMMIT')
    return NextResponse.json({ deviceId: currentDeviceId, adopted: true })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error instanceof DeviceAlreadyClaimedError) {
      return NextResponse.json(
        { error: 'This device data is already secured by another account.' },
        { status: 409 },
      )
    }
    console.error('[v0] account/sync failed:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
