import { requireUserId } from '@/lib/server/chat-core'
import { matchContactToUser, getLink } from '@/lib/server/links'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { z } from 'zod'

export const maxDuration = 10

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
})

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
  const blocked = await protectExpensiveRequest(req, 'chat-match', {
    limit: 30,
    windowMs: 10 * 60_000,
    identity: userId,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid email' }, { status: 400 })
  }

  try {
    const match = await matchContactToUser(userId, parsed.data.email)
    if (!match) return Response.json({ matched: false })
    const link = await getLink(userId, match.userId)
    return Response.json({
      matched: true,
      // The other user's internal id is only exposed after both people have
      // accepted a link, when the live thread actually needs it.
      otherUserId: link?.status === 'accepted' ? match.userId : undefined,
      otherName: link?.status === 'accepted' ? match.name : undefined,
      link: link
        ? { id: link.id, status: link.status, direction: link.direction }
        : null,
    })
  } catch (error) {
    console.error('[v0] chat/match failed:', error)
    return Response.json({ matched: false, reason: 'error' }, { status: 500 })
  }
}
