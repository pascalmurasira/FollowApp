import {
  addUserContact,
  getCircleTags,
  getUserContacts,
  setCircleTag,
  touchUserContact,
  updateUserContact,
} from '@/lib/server/people'
import { requestedDeviceId } from '@/lib/server/request-device'
import type { Contact } from '@/lib/types'
import type { ContactUpdateInput } from '@/lib/contacts-store'

export const maxDuration = 10

export async function GET(req: Request) {
  const deviceId = requestedDeviceId(req)
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    const [contacts, circles] = await Promise.all([
      getUserContacts(deviceId),
      getCircleTags(deviceId),
    ])
    return Response.json({ contacts, circles })
  } catch (error) {
    console.error('[v0] Contacts GET failed:', error)
    return Response.json({ contacts: [], circles: {} })
  }
}

export async function POST(req: Request) {
  let body: { deviceId?: string; contact?: Contact }
  try {
    body = (await req.json()) as { deviceId?: string; contact?: Contact }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { deviceId, contact } = body
  if (!deviceId || !contact?.id || !contact?.name) {
    return Response.json({ error: 'Missing deviceId or contact' }, { status: 400 })
  }

  try {
    await addUserContact(deviceId, contact)
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Contacts POST failed:', error)
    return Response.json({ error: 'Failed to add contact' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  let body: {
    deviceId?: string
    contactId?: string
    circle?: string | null
    updates?: ContactUpdateInput
    action?: 'circle' | 'touch' | 'update'
  }
  try {
    body = (await req.json()) as {
      deviceId?: string
      contactId?: string
      circle?: string | null
      updates?: ContactUpdateInput
      action?: 'circle' | 'touch' | 'update'
    }
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { deviceId, contactId, circle } = body
  if (!deviceId || !contactId) {
    return Response.json({ error: 'Missing deviceId or contactId' }, { status: 400 })
  }

  try {
    if (body.action === 'touch') {
      await touchUserContact(deviceId, contactId)
    } else if (body.action === 'update') {
      await updateUserContact(deviceId, contactId, body.updates ?? {})
    } else {
      await setCircleTag(deviceId, contactId, circle ?? null)
    }
    return Response.json({ ok: true })
  } catch (error) {
    console.error('[v0] Contacts PATCH (circle) failed:', error)
    return Response.json({ error: 'Failed to set circle' }, { status: 500 })
  }
}
