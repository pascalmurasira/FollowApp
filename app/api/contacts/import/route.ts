import { addUserContacts } from '@/lib/server/people'
import type { Contact } from '@/lib/types'

export const maxDuration = 15

/** Batch-import contacts for a device. Body: { deviceId, contacts: Contact[] }. */
export async function POST(req: Request) {
  let body: { deviceId?: string; contacts?: Contact[] }
  try {
    body = (await req.json()) as { deviceId?: string; contacts?: Contact[] }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { deviceId, contacts } = body
  if (!deviceId || !Array.isArray(contacts) || contacts.length === 0) {
    return Response.json({ error: 'Missing deviceId or contacts' }, { status: 400 })
  }

  // Guard against oversized imports.
  const valid = contacts.filter((c) => c?.id && c?.name).slice(0, 500)
  if (valid.length === 0) {
    return Response.json({ error: 'No valid contacts' }, { status: 400 })
  }

  try {
    const saved = await addUserContacts(deviceId, valid)
    return Response.json({ ok: true, saved })
  } catch (error) {
    console.error('[v0] Contacts import failed:', error)
    return Response.json({ error: 'Failed to import contacts' }, { status: 500 })
  }
}
