import 'server-only'
import { and, asc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contactLinks, directMessages } from '@/lib/db/schema'
import { pairKeyFor } from '@/lib/server/chat-core'

/**
 * Server-only message persistence between two linked users. A message can only
 * be sent or read when an ACCEPTED link exists between the pair — this is the
 * gate that turns "matched on FollowApp" into "allowed to chat".
 */

export interface ChatMessage {
  id: number
  senderUserId: string
  body: string
  createdAt: string
  mine: boolean
}

/** True when caller and other have an accepted link (either direction). */
async function isAccepted(callerUserId: string, otherUserId: string): Promise<boolean> {
  const key = pairKeyFor(callerUserId, otherUserId)
  const [row] = await db
    .select({ status: contactLinks.status })
    .from(contactLinks)
    .where(eq(contactLinks.pairKey, key))
    .limit(1)
  return row?.status === 'accepted'
}

/**
 * Send a message from caller → recipient. Rejects if the pair isn't accepted,
 * so a declined/pending/absent link can never carry messages. Returns the new
 * message id (the polling cursor).
 */
export async function sendMessage(
  callerUserId: string,
  recipientUserId: string,
  body: string,
): Promise<number> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Empty message')
  if (!(await isAccepted(callerUserId, recipientUserId))) {
    throw new Error('No accepted link with this user')
  }
  const [row] = await db
    .insert(directMessages)
    .values({
      pairKey: pairKeyFor(callerUserId, recipientUserId),
      senderUserId: callerUserId,
      recipientUserId,
      body: trimmed,
    })
    .returning({ id: directMessages.id })
  return row.id
}

/**
 * Read the thread between caller and other. `sinceId` (the last id the client
 * has) enables cheap polling: only rows with a greater id come back. Marks
 * messages addressed to the caller as read as a side effect.
 */
export async function getThread(
  callerUserId: string,
  otherUserId: string,
  sinceId = 0,
): Promise<ChatMessage[]> {
  if (!(await isAccepted(callerUserId, otherUserId))) return []
  const key = pairKeyFor(callerUserId, otherUserId)

  const rows = await db
    .select()
    .from(directMessages)
    .where(and(eq(directMessages.pairKey, key), gt(directMessages.id, sinceId)))
    .orderBy(asc(directMessages.id))

  // Mark inbound messages as read (best-effort; doesn't block the response).
  void db
    .update(directMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(directMessages.pairKey, key),
        eq(directMessages.recipientUserId, callerUserId),
      ),
    )

  return rows.map((r) => ({
    id: r.id,
    senderUserId: r.senderUserId,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    mine: r.senderUserId === callerUserId,
  }))
}
