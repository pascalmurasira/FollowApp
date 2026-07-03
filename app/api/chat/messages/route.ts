import { requireUserId } from '@/lib/server/chat-core'
import { getThread, sendMessage } from '@/lib/server/messages'

export const maxDuration = 10

/**
 * Poll the thread with another user. `?with=<userId>&since=<lastId>` returns
 * only messages newer than `since`, so the client can poll cheaply. Returns an
 * empty list (not an error) when there's no accepted link, so the UI degrades
 * quietly.
 */
export async function GET(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ messages: [] }, { status: 401 })
  }

  const url = new URL(req.url)
  const otherUserId = url.searchParams.get('with')
  const since = Number(url.searchParams.get('since') ?? '0')
  if (!otherUserId) {
    return Response.json({ error: 'Missing with' }, { status: 400 })
  }

  try {
    const messages = await getThread(userId, otherUserId, Number.isFinite(since) ? since : 0)
    return Response.json({ messages })
  } catch (error) {
    console.error('[v0] chat/thread GET failed:', error)
    return Response.json({ messages: [] }, { status: 500 })
  }
}

/** Send a message to another user. Body: { recipientUserId, body }. */
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { recipientUserId?: string; body?: string }
  try {
    payload = (await req.json()) as { recipientUserId?: string; body?: string }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!payload.recipientUserId || !payload.body?.trim()) {
    return Response.json({ error: 'Missing recipientUserId or body' }, { status: 400 })
  }

  try {
    const id = await sendMessage(userId, payload.recipientUserId, payload.body)
    return Response.json({ id })
  } catch (error) {
    console.error('[v0] chat/thread POST failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to send'
    // A blocked send (no accepted link) is a 403, not a server error.
    const status = message.includes('accepted link') ? 403 : 500
    return Response.json({ error: message }, { status })
  }
}
