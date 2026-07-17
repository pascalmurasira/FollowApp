import { requireUserId } from '@/lib/server/chat-core'
import {
  requestLink,
  respondToLink,
  listLinks,
  matchContactToUser,
} from '@/lib/server/links'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { z } from 'zod'

export const maxDuration = 10

const requestSchema = z.object({
  email: z.string().trim().email().max(320),
  intro: z.string().trim().max(1_000).optional(),
})

const responseSchema = z.object({
  linkId: z.string().trim().min(1).max(200),
  accept: z.boolean(),
})

function linkForApi(link: Awaited<ReturnType<typeof requestLink>>) {
  const accepted = link.status === 'accepted'
  const introducedThemself =
    link.status === 'pending' && link.direction === 'incoming'
  return {
    id: link.id,
    otherUserId: accepted ? link.otherUserId : undefined,
    otherName:
      accepted || introducedThemself ? link.otherName : 'FollowApp contact',
    status: link.status,
    direction: link.direction,
    intro: link.intro,
    createdAt: link.createdAt,
  }
}

/** List all of the caller's links (both directions) for the inbox. */
export async function GET() {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ links: [] }, { status: 401 })
  }
  try {
    const links = await listLinks(userId)
    return Response.json({ links: links.map(linkForApi) })
  } catch (error) {
    console.error('[v0] chat/link GET failed:', error)
    return Response.json({ links: [] }, { status: 500 })
  }
}

/** Send a chat request to another user. */
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const blocked = await protectExpensiveRequest(req, 'chat-link', {
    limit: 10,
    windowMs: 60 * 60_000,
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
    return Response.json({ error: 'Invalid email or intro' }, { status: 400 })
  }
  try {
    const recipient = await matchContactToUser(userId, parsed.data.email)
    if (!recipient) {
      return Response.json({ error: 'Contact is unavailable' }, { status: 404 })
    }
    const link = await requestLink(userId, recipient.userId, parsed.data.intro)
    return Response.json({ link: linkForApi(link) })
  } catch (error) {
    console.error('[v0] chat/link POST failed:', error)
    return Response.json({ error: 'Failed to send request' }, { status: 500 })
  }
}

/** Accept or decline a pending request (recipient only). */
export async function PATCH(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const parsed = responseSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json({ error: 'Missing linkId or accept' }, { status: 400 })
  }
  try {
    await respondToLink(userId, parsed.data.linkId, parsed.data.accept)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] chat/link PATCH failed:', error)
    return Response.json({ error: 'Failed to respond' }, { status: 500 })
  }
}
