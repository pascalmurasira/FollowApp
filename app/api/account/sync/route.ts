import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
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
