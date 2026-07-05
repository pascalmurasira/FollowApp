import { auth } from '@/lib/auth'
import { db, pool } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Resolves which deviceId an authenticated device should use, so data syncs
 * across all of a user's devices.
 *
 * - First ever sign-in (account has no canonical deviceId): the device's
 *   current anonymous deviceId is ADOPTED as the account's canonical id. All
 *   the anonymous data they already built (profile, contacts, circles, memory)
 *   instantly becomes the account's data — nothing to migrate, since every
 *   table is already keyed by that id.
 * - Later sign-in on another device: we return the account's canonical id and
 *   the client switches to it, immediately seeing the same data.
 *
 * The client sends its current deviceId; we return the canonical one to use.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { deviceId: currentDeviceId } = (await req.json().catch(() => ({}))) as {
    deviceId?: string
  }

  const rows = await db
    .select({ dataDeviceId: user.dataDeviceId })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1)

  const existing = rows[0]?.dataDeviceId

  if (existing) {
    if (currentDeviceId && currentDeviceId !== existing) {
      await mergeDeviceData(currentDeviceId, existing)
    }
    return NextResponse.json({ deviceId: existing, adopted: false })
  }

  // First sign-in: claim the current device's id as canonical.
  if (!currentDeviceId) {
    return NextResponse.json({ error: 'Missing deviceId' }, { status: 400 })
  }

  await db
    .update(user)
    .set({ dataDeviceId: currentDeviceId, updatedAt: new Date() })
    .where(eq(user.id, session.user.id))

  return NextResponse.json({ deviceId: currentDeviceId, adopted: true })
}

async function mergeDeviceData(sourceDeviceId: string, targetDeviceId: string) {
  await pool.query('BEGIN')
  try {
    await pool.query(
      'ALTER TABLE user_contacts ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz',
    )

    await pool.query(
      `
      INSERT INTO profiles (
        device_id, name, photo_url, title, company, phone, email, updated_at
      )
      SELECT $2, name, photo_url, title, company, phone, email, updated_at
      FROM profiles
      WHERE device_id = $1
      ON CONFLICT (device_id) DO NOTHING
      `,
      [sourceDeviceId, targetDeviceId],
    )

    await pool.query(
      `
      INSERT INTO user_contacts (
        id, device_id, name, relationship, title, tier, phone, email,
        avatar_hue, context, interests, created_at, last_contacted_at
      )
      SELECT
        id, $2, name, relationship, title, tier, phone, email,
        avatar_hue, context, interests, created_at, last_contacted_at
      FROM user_contacts
      WHERE device_id = $1
      ON CONFLICT (id) DO NOTHING
      `,
      [sourceDeviceId, targetDeviceId],
    )

    await pool.query(
      `
      INSERT INTO circle_tags (device_id, contact_id, circle)
      SELECT $2, contact_id, circle
      FROM circle_tags
      WHERE device_id = $1
      ON CONFLICT (device_id, contact_id) DO NOTHING
      `,
      [sourceDeviceId, targetDeviceId],
    )

    await pool.query(
      `
      UPDATE memory_signals
      SET device_id = $2
      WHERE device_id = $1
      `,
      [sourceDeviceId, targetDeviceId],
    )

    await pool.query('DELETE FROM circle_tags WHERE device_id = $1', [sourceDeviceId])
    await pool.query('DELETE FROM user_contacts WHERE device_id = $1', [sourceDeviceId])
    await pool.query('DELETE FROM profiles WHERE device_id = $1', [sourceDeviceId])

    await pool.query('COMMIT')
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}
