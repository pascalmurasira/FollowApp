import { requireUserId } from '@/lib/server/chat-core'
import { matchContactToUser, getLink } from '@/lib/server/links'

export const maxDuration = 10

/**
 * Given a contact's email/phone, report whether they're a real FollowApp user
 * the caller can chat with, plus any existing link state. Drives the
 * "Chat on FollowApp" affordance in the conversation view.
 */
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ matched: false, reason: 'unauthenticated' }, { status: 401 })
  }

  let body: { email?: string; phone?: string }
  try {
    body = (await req.json()) as { email?: string; phone?: string }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    const match = await matchContactToUser(userId, body.email, body.phone)
    if (!match) return Response.json({ matched: false })
    const link = await getLink(userId, match.userId)
    return Response.json({
      matched: true,
      otherUserId: match.userId,
      otherName: match.name,
      link: link
        ? { id: link.id, status: link.status, direction: link.direction }
        : null,
    })
  } catch (error) {
    console.error('[v0] chat/match failed:', error)
    return Response.json({ matched: false, reason: 'error' }, { status: 500 })
  }
}
