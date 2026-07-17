import { addUserContacts, ensureContactSchema } from '@/lib/server/people'
import { normalizeDeviceId } from '@/lib/server/device-id'
import { withDeviceAccess } from '@/lib/server/device-access'
import { contactInputSchema } from '@/lib/server/input-schemas'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import type { Contact } from '@/lib/types'
import { z } from 'zod'

export const maxDuration = 15

const importSchema = z.object({
  deviceId: z.unknown(),
  contacts: z.array(z.unknown()).min(1).max(500),
})

/** Batch-import contacts for a device. Body: { deviceId, contacts: Contact[] }. */
export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'contacts-import', {
    // Imports arrive in batches of 500. Leave room for large address books and
    // safe retries while retaining a bounded per-client write quota.
    limit: 50,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = importSchema.safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success || !deviceId) {
    return Response.json(
      { error: 'Missing or invalid deviceId/contacts' },
      { status: 400 },
    )
  }

  const valid: Contact[] = []
  for (const contact of parsed.data.contacts) {
    const result = contactInputSchema.safeParse(contact)
    if (!result.success) {
      return Response.json(
        { error: 'One or more contacts are invalid' },
        { status: 400 },
      )
    }
    valid.push(result.data as Contact)
  }
  try {
    await ensureContactSchema()
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        addUserContacts(canonicalDeviceId, valid, executor),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true, saved: access.value })
  } catch (error) {
    console.error('[v0] Contacts import failed:', error)
    return Response.json({ error: 'Failed to import contacts' }, { status: 500 })
  }
}
