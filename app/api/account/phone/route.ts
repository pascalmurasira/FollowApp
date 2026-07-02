import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { requireUserId, normalizePhone } from '@/lib/server/chat-core'

export const maxDuration = 10

/**
 * Save the signed-in user's own phone number (normalized) so other users who
 * have them as a contact-by-phone can match and chat with them. This is how a
 * user becomes discoverable by phone for in-app chat.
 */
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { phone?: string }
  try {
    body = (await req.json()) as { phone?: string }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const normalized = normalizePhone(body.phone)
  try {
    await db
      .update(user)
      .set({ phone: normalized, updatedAt: new Date() })
      .where(eq(user.id, userId))
    return Response.json({ ok: true, phone: normalized })
  } catch (error) {
    console.error('[v0] account/phone failed:', error)
    return Response.json({ error: 'Failed to save phone' }, { status: 500 })
  }
}
