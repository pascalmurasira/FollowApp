import 'server-only'
import { and, eq, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { contactLinks, user } from '@/lib/db/schema'
import { pairKeyFor } from '@/lib/server/chat-core'

/**
 * Server-only logic for FollowApp-to-FollowApp links: matching a contact to a
 * real user (by email or phone), sending a chat request, and responding to it.
 * Every function takes the caller's authenticated `userId` and scopes by it —
 * there is no RLS, so the userId checks are the security boundary.
 */

export type LinkStatus = 'pending' | 'accepted' | 'declined'

export interface MatchedUser {
  userId: string
  name: string
}

/**
 * Find a real, OTHER user matching a contact's verified account email. Phone
 * matching stays disabled until FollowApp has a phone-verification flow.
 */
export async function matchContactToUser(
  callerUserId: string,
  email?: string | null,
): Promise<MatchedUser | null> {
  const normEmail = email?.trim().toLowerCase() || null
  if (!normEmail) return null

  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(ne(user.id, callerUserId), eq(user.email, normEmail)))
    .limit(1)

  if (rows.length === 0) return null
  return { userId: rows[0].id, name: rows[0].name }
}

/** A link row plus the other person's display name, from the caller's view. */
export interface LinkView {
  id: string
  otherUserId: string
  otherName: string
  status: LinkStatus
  direction: 'incoming' | 'outgoing'
  intro: string | null
  createdAt: Date
}

/** The single link between the caller and another user, if any. */
export async function getLink(
  callerUserId: string,
  otherUserId: string,
): Promise<LinkView | null> {
  const key = pairKeyFor(callerUserId, otherUserId)
  const [row] = await db
    .select()
    .from(contactLinks)
    .where(eq(contactLinks.pairKey, key))
    .limit(1)
  if (!row) return null
  const [other] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, otherUserId))
    .limit(1)
  return {
    id: row.id,
    otherUserId,
    otherName: other?.name ?? 'Someone',
    status: row.status as LinkStatus,
    direction: row.requesterUserId === callerUserId ? 'outgoing' : 'incoming',
    intro: row.intro,
    createdAt: row.createdAt,
  }
}

/**
 * Create a chat request from caller → recipient. Idempotent: if a link already
 * exists (any status) it is returned unchanged rather than duplicated. Returns
 * the resulting link as seen by the caller.
 */
export async function requestLink(
  callerUserId: string,
  recipientUserId: string,
  intro?: string,
): Promise<LinkView> {
  if (callerUserId === recipientUserId) {
    throw new Error('Cannot link to yourself')
  }
  const key = pairKeyFor(callerUserId, recipientUserId)
  const existing = await getLink(callerUserId, recipientUserId)
  if (existing) return existing

  await db.insert(contactLinks).values({
    id: crypto.randomUUID(),
    pairKey: key,
    requesterUserId: callerUserId,
    recipientUserId,
    status: 'pending',
    intro: intro?.trim() || null,
  })
  const created = await getLink(callerUserId, recipientUserId)
  if (!created) throw new Error('Failed to create link')
  return created
}

/**
 * Recipient responds to a pending request. Only the recipient (never the
 * requester) may accept/decline, enforced by matching recipientUserId.
 */
export async function respondToLink(
  callerUserId: string,
  linkId: string,
  accept: boolean,
): Promise<void> {
  await db
    .update(contactLinks)
    .set({
      status: accept ? 'accepted' : 'declined',
      respondedAt: new Date(),
    })
    .where(
      and(
        eq(contactLinks.id, linkId),
        eq(contactLinks.recipientUserId, callerUserId),
        eq(contactLinks.status, 'pending'),
      ),
    )
}

/** All links involving the caller (both directions), newest first. */
export async function listLinks(callerUserId: string): Promise<LinkView[]> {
  const rows = await db
    .select()
    .from(contactLinks)
    .where(
      or(
        eq(contactLinks.requesterUserId, callerUserId),
        eq(contactLinks.recipientUserId, callerUserId),
      ),
    )
  // Resolve the "other" user's name for each link.
  const views: LinkView[] = []
  for (const row of rows) {
    const outgoing = row.requesterUserId === callerUserId
    const otherUserId = outgoing ? row.recipientUserId : row.requesterUserId
    const [other] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, otherUserId))
      .limit(1)
    views.push({
      id: row.id,
      otherUserId,
      otherName: other?.name ?? 'Someone',
      status: row.status as LinkStatus,
      direction: outgoing ? 'outgoing' : 'incoming',
      intro: row.intro,
      createdAt: row.createdAt,
    })
  }
  return views.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}
