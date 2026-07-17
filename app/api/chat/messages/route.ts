import { requireUserId } from '@/lib/server/chat-core'
import {
  CHAT_THREAD_PAGE_SIZE,
  getThread,
  NoAcceptedLinkError,
  sendMessage,
} from '@/lib/server/messages'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { logServerError } from '@/lib/server/error-metadata'
import { z } from 'zod'

export const maxDuration = 10

const sendSchema = z.object({
  recipientUserId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4_000),
})

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
  const cursor = Number.isFinite(since) ? Math.max(0, Math.floor(since)) : 0
  if (!otherUserId) {
    return Response.json({ error: 'Missing with' }, { status: 400 })
  }

  try {
    const messages = await getThread(
      userId,
      otherUserId,
      cursor,
    )
    return Response.json({
      messages,
      hasMore: cursor > 0 && messages.length === CHAT_THREAD_PAGE_SIZE,
    })
  } catch (error) {
    logServerError('[v0] chat/thread GET failed', error)
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
  const blocked = await protectExpensiveRequest(req, 'chat-message', {
    limit: 120,
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
  const parsed = sendSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json({ error: 'Missing recipientUserId or body' }, { status: 400 })
  }

  try {
    const id = await sendMessage(
      userId,
      parsed.data.recipientUserId,
      parsed.data.body,
    )
    return Response.json({ id })
  } catch (error) {
    logServerError('[v0] chat/thread POST failed', error)
    if (error instanceof NoAcceptedLinkError) {
      return Response.json(
        { error: 'This conversation is not available.' },
        { status: 403 },
      )
    }
    return Response.json(
      { error: 'The message could not be sent.' },
      { status: 500 },
    )
  }
}
