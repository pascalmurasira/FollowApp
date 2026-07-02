import 'server-only'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Shared primitives for the in-app chat layer. There is no RLS on Neon, so
 * every chat query is scoped to the authenticated user id returned here.
 */

/** Returns the signed-in user id, or null if there is no session. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

/** Like getSessionUserId but throws — use in routes that require auth. */
export async function requireUserId(): Promise<string> {
  const id = await getSessionUserId()
  if (!id) throw new Error('Unauthorized')
  return id
}

/**
 * Canonical key for a pair of users: the two ids sorted and joined, so a pair
 * maps to exactly one key no matter who initiated the link or message.
 */
export function pairKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':')
}

/**
 * Normalize a phone number to a comparable digits-only form (leading '+'
 * preserved). Strips spaces, dashes, parens. Good enough to match two users
 * who saved the same number with different formatting; not a full E.164 parse.
 */
export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const plus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7) return null
  return plus ? `+${digits}` : digits
}
