import { requireUserId } from '@/lib/server/chat-core'

/**
 * Phone discovery is intentionally disabled until numbers can be verified.
 * Accepting self-asserted numbers would let one account impersonate another
 * person's phone identity in chat matching.
 */
export async function POST() {
  try {
    await requireUserId()
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return Response.json(
    { error: 'Phone discovery requires verification and is not available yet.' },
    { status: 501 },
  )
}
