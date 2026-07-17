import {
  addUserContact,
  getCircleTags,
  getUserContacts,
  ensureContactSchema,
  confirmUserOutreach,
  deleteUserContact,
  setCircleTag,
  touchUserContact,
  updateUserContact,
  ContactOwnershipConflictError,
} from '@/lib/server/people'
import { normalizeDeviceId } from '@/lib/server/device-id'
import { withDeviceAccess } from '@/lib/server/device-access'
import {
  contactInputSchema,
  contactUpdateInputSchema,
  confirmedOutreachInputSchema,
  dateOnlyInputSchema,
} from '@/lib/server/input-schemas'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { requestedDeviceId } from '@/lib/server/request-device'
import { logServerError } from '@/lib/server/error-metadata'
import type { Contact } from '@/lib/types'
import type { ContactUpdateInput } from '@/lib/contacts-store'
import { z } from 'zod'

export const maxDuration = 10

const postSchema = z.object({
  deviceId: z.unknown(),
  contact: contactInputSchema,
})

const patchSchema = z
  .object({
    deviceId: z.unknown(),
    contactId: z.string().trim().min(1).max(200),
    circle: z.string().max(120).nullable().optional(),
    updates: contactUpdateInputSchema.optional(),
    message: confirmedOutreachInputSchema.optional(),
    contactedOn: dateOnlyInputSchema.optional(),
    action: z.enum(['circle', 'touch', 'update', 'outreach']).optional(),
  })
  .refine((value) => value.action !== 'outreach' || Boolean(value.message), {
    message: 'Confirmed outreach requires a message',
    path: ['message'],
  })

export async function GET(req: Request) {
  const deviceId = requestedDeviceId(req)
  if (!deviceId) {
    return Response.json({ error: 'Missing deviceId' }, { status: 400 })
  }
  try {
    // Finish the additive legacy-schema check before reserving the transaction
    // connection used by withDeviceAccess, avoiding pool starvation at cold start.
    await ensureContactSchema()
    const access = await withDeviceAccess(
      req,
      deviceId,
      async ({ deviceId: canonicalDeviceId, executor }) => ({
        contacts: await getUserContacts(canonicalDeviceId, executor),
        circles: await getCircleTags(canonicalDeviceId, executor),
      }),
    )
    if (!access.ok) return access.response
    return Response.json(access.value)
  } catch (error) {
    logServerError('[v0] Contacts GET failed', error)
    // An empty 200 is indistinguishable from a real server-side deletion. The
    // client treats non-success responses as transient and keeps its local
    // snapshot, so fail explicitly instead of wiping settled offline data.
    return Response.json(
      { error: 'Failed to load contacts' },
      { status: 503 },
    )
  }
}

export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'contacts-write', {
    limit: 120,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = postSchema.safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success || !deviceId) {
    return Response.json(
      { error: 'Missing or invalid deviceId/contact' },
      { status: 400 },
    )
  }
  const contact = parsed.data.contact as Contact

  try {
    await ensureContactSchema()
    const access = await withDeviceAccess(
      req,
      deviceId,
      async ({ deviceId: canonicalDeviceId, executor }) =>
        addUserContact(canonicalDeviceId, contact, executor),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof ContactOwnershipConflictError) {
      return Response.json(
        {
          error: 'This contact could not be saved with the supplied id.',
          code: error.code,
        },
        { status: 409 },
      )
    }
    logServerError('[v0] Contacts POST failed', error)
    return Response.json({ error: 'Failed to add contact' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'contacts-write', {
    limit: 120,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success || !deviceId) {
    return Response.json(
      { error: 'Missing or invalid deviceId/contactId' },
      { status: 400 },
    )
  }
  const { contactId, circle } = parsed.data

  try {
    await ensureContactSchema()
    const access = await withDeviceAccess(
      req,
      deviceId,
      async ({ deviceId: canonicalDeviceId, executor }) => {
        if (parsed.data.action === 'touch') {
          return (await touchUserContact(
            canonicalDeviceId,
            contactId,
            parsed.data.contactedOn,
            executor,
          ))
            ? 'ok'
            : 'missing'
        } else if (parsed.data.action === 'outreach' && parsed.data.message) {
          const result = await confirmUserOutreach(
            canonicalDeviceId,
            contactId,
            parsed.data.message,
            executor,
          )
          if (result === 'invalid') return 'invalid'
          return result === 'missing' ? 'missing' : 'ok'
        } else if (parsed.data.action === 'update') {
          return (await updateUserContact(
            canonicalDeviceId,
            contactId,
            (parsed.data.updates ?? {}) as ContactUpdateInput,
            executor,
          ))
            ? 'ok'
            : 'missing'
        } else {
          await setCircleTag(
            canonicalDeviceId,
            contactId,
            circle ?? null,
            executor,
          )
          return 'ok'
        }
      },
    )
    if (!access.ok) return access.response
    if (access.value === 'missing') {
      return Response.json(
        { error: 'Contact not found.', code: 'CONTACT_NOT_FOUND' },
        { status: 404 },
      )
    }
    if (access.value === 'invalid') {
      return Response.json(
        { error: 'Invalid outreach confirmation.' },
        { status: 400 },
      )
    }
    return Response.json({ ok: true })
  } catch (error) {
    logServerError('[v0] Contacts PATCH failed', error)
    return Response.json({ error: 'Failed to update contact' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'contacts-delete', {
    limit: 120,
    windowMs: 60 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const parsed = z
    .object({
      deviceId: z.unknown(),
      contactId: z.string().trim().min(1).max(200),
    })
    .safeParse(input)
  const deviceId = parsed.success
    ? normalizeDeviceId(parsed.data.deviceId)
    : null
  if (!parsed.success || !deviceId) {
    return Response.json(
      { error: 'Missing or invalid deviceId/contactId' },
      { status: 400 },
    )
  }

  try {
    await ensureContactSchema()
    const access = await withDeviceAccess(
      req,
      deviceId,
      ({ deviceId: canonicalDeviceId, executor }) =>
        deleteUserContact(
          canonicalDeviceId,
          parsed.data.contactId,
          executor,
        ),
    )
    if (!access.ok) return access.response
    return Response.json({ ok: true })
  } catch (error) {
    logServerError('[v0] Contacts DELETE failed', error)
    return Response.json({ error: 'Failed to delete contact' }, { status: 500 })
  }
}
