import { requireUserId } from '@/lib/server/chat-core'
import { requestLink, respondToLink, listLinks } from '@/lib/server/links'

export const maxDuration = 10

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
    return Response.json({ links })
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
  let body: { recipientUserId?: string; intro?: string }
  try {
    body = (await req.json()) as { recipientUserId?: string; intro?: string }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.recipientUserId) {
    return Response.json({ error: 'Missing recipientUserId' }, { status: 400 })
  }
  try {
    const link = await requestLink(userId, body.recipientUserId, body.intro)
    return Response.json({ link })
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
  let body: { linkId?: string; accept?: boolean }
  try {
    body = (await req.json()) as { linkId?: string; accept?: boolean }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.linkId || typeof body.accept !== 'boolean') {
    return Response.json({ error: 'Missing linkId or accept' }, { status: 400 })
  }
  try {
    await respondToLink(userId, body.linkId, body.accept)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] chat/link PATCH failed:', error)
    return Response.json({ error: 'Failed to respond' }, { status: 500 })
  }
}
