import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, pool, type DbExecutor } from '@/lib/db'
import { circleTags, memorySignals, profiles, userContacts } from '@/lib/db/schema'
import type { Contact, Message, Profile } from '@/lib/types'
import {
  dateInputToUtcNoon,
  daysForLastContactedAt,
  normalizeLastContactedAt,
  utcDateToDateInputValue,
} from '@/lib/contact-dates'
import type { ContactUpdateInput } from '@/lib/contacts-store'
import {
  appendMessageOnce,
  confirmedOutreachDate,
} from '@/lib/contact-outreach'
import {
  sameDeviceContactConflict,
  sameDeviceImportedContactConflict,
} from '@/lib/server/contact-upsert'
import { CONTACT_LIMITS } from '@/lib/persistence-limits'

/**
 * Server-only persistence for the user's profile, added contacts, and circle
 * assignments. Everything is scoped by `deviceId` (anonymous, no auth) exactly
 * like the memory layer — a device only ever sees its own rows.
 */

const DEFAULT_NAME = 'You'
const TEXT_LIMITS = {
  ...CONTACT_LIMITS,
  avatarHue: 24,
}

export class ContactOwnershipConflictError extends Error {
  readonly code = 'CONTACT_ID_CONFLICT'

  constructor(readonly contactId: string) {
    super('This contact id already belongs to another data owner.')
    this.name = 'ContactOwnershipConflictError'
  }
}

// ---- Profile ----

export async function getProfile(
  deviceId: string,
  executor: DbExecutor = db,
): Promise<Profile> {
  const [row] = await executor
    .select()
    .from(profiles)
    .where(eq(profiles.deviceId, deviceId))
    .limit(1)
  if (!row) return { name: DEFAULT_NAME }
  return {
    name: row.name,
    photoUrl: row.photoUrl ?? undefined,
    title: row.title ?? undefined,
    company: row.company ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
  }
}

export async function saveProfile(
  deviceId: string,
  profile: Profile,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .insert(profiles)
    .values({
      deviceId,
      name: profile.name || DEFAULT_NAME,
      photoUrl: profile.photoUrl ?? null,
      title: profile.title ?? null,
      company: profile.company ?? null,
      phone: profile.phone ?? null,
      email: profile.email ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: profiles.deviceId,
      set: {
        name: profile.name || DEFAULT_NAME,
        photoUrl: profile.photoUrl ?? null,
        title: profile.title ?? null,
        company: profile.company ?? null,
        phone: profile.phone ?? null,
        email: profile.email ?? null,
        updatedAt: new Date(),
      },
    })
}

// ---- User-added contacts ----

const HUES: Contact['avatarHue'][] = ['coral', 'teal', 'amber', 'rose', 'sage']

let contactSchemaReady: Promise<void> | null = null

export function ensureContactSchema(): Promise<void> {
  contactSchemaReady ??= (async () => {
    try {
      await pool.query(
        'ALTER TABLE user_contacts ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz',
      )
      await pool.query(
        "ALTER TABLE user_contacts ADD COLUMN IF NOT EXISTS messages text NOT NULL DEFAULT '[]'",
      )
    } catch (error) {
      // A cold-start database interruption must not poison this instance for
      // its entire lifetime. Let a later request retry the additive migration.
      contactSchemaReady = null
      throw error
    }
  })()
  return contactSchemaReady
}

function cap(value: string | null | undefined, max: number): string | undefined {
  const cleaned = value?.trim()
  if (!cleaned) return undefined
  return cleaned.slice(0, max)
}

function safeDays(days: number | undefined): number {
  if (!Number.isFinite(days)) return 0
  return Math.min(
    CONTACT_LIMITS.daysSinceContact,
    Math.max(0, Math.floor(days ?? 0)),
  )
}

function safeMinutes(minutes: number | undefined): number {
  if (!Number.isFinite(minutes)) return 0
  return Math.min(10_000_000, Math.max(0, Math.floor(minutes ?? 0)))
}

function safeMessage(value: unknown): Message | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<Message>
  if (
    typeof message.id !== 'string' ||
    !message.id.trim() ||
    (message.sender !== 'me' && message.sender !== 'them') ||
    typeof message.text !== 'string' ||
    !message.text.trim()
  ) {
    return null
  }
  const channel =
    message.channel === 'whatsapp' || message.channel === 'email'
      ? message.channel
      : undefined
  const sentAt =
    typeof message.sentAt === 'string' && Number.isFinite(new Date(message.sentAt).getTime())
      ? new Date(message.sentAt).toISOString()
      : undefined
  const sentOn =
    typeof message.sentOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(message.sentOn) &&
    normalizeLastContactedAt(message.sentOn) === message.sentOn
      ? message.sentOn
      : undefined
  return {
    id: message.id.trim().slice(0, 200),
    sender: message.sender,
    text: message.text.trim().slice(0, 4_000),
    minutesAgo: safeMinutes(message.minutesAgo),
    sentAt,
    sentOn,
    channel,
    system: message.system === true || undefined,
  }
}

function parseMessages(value: string | null | undefined): Message[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(safeMessage)
      .filter((message): message is Message => Boolean(message))
      .slice(-100)
  } catch {
    return []
  }
}

function sanitizeContact(contact: Contact): Contact {
  const tier = (['key', 'network', 'casual'] as const).includes(
    contact.tier as 'key' | 'network' | 'casual',
  )
    ? contact.tier
    : 'network'
  const avatarHue = HUES.includes(contact.avatarHue) ? contact.avatarHue : 'coral'
  const lastContactedAt =
    normalizeLastContactedAt(contact.lastContactedAt) ?? null
  return {
    ...contact,
    id: cap(contact.id, TEXT_LIMITS.id) ?? `contact-${Date.now()}`,
    name: cap(contact.name, TEXT_LIMITS.name) ?? 'New contact',
    relationship:
      cap(contact.relationship, TEXT_LIMITS.relationship) ??
      'A connection worth keeping',
    title: cap(contact.title, TEXT_LIMITS.title),
    tier,
    phone: cap(contact.phone, TEXT_LIMITS.phone),
    email: cap(contact.email, TEXT_LIMITS.email)?.toLowerCase(),
    avatarHue,
    daysSinceContact: daysForLastContactedAt(
      lastContactedAt,
      tier,
      safeDays(contact.daysSinceContact),
    ),
    lastContactedAt,
    context: cap(contact.context, TEXT_LIMITS.context) ?? '',
    interests: (contact.interests ?? [])
      .map((interest) => cap(interest, TEXT_LIMITS.interest))
      .filter((interest): interest is string => Boolean(interest))
      .slice(0, CONTACT_LIMITS.interests),
    messages: (contact.messages ?? [])
      .map(safeMessage)
      .filter((message): message is Message => Boolean(message))
      .slice(-100),
  }
}

function rowToContact(row: typeof userContacts.$inferSelect): Contact {
  let interests: string[] = []
  if (row.interests) {
    try {
      interests = JSON.parse(row.interests) as string[]
    } catch {
      interests = []
    }
  }
  const tier = (['key', 'network', 'casual'] as const).includes(
    row.tier as Contact['tier'] as 'key' | 'network' | 'casual',
  )
    ? (row.tier as Contact['tier'])
    : 'network'
  const lastContactedAt = row.lastContactedAt
    ? utcDateToDateInputValue(new Date(row.lastContactedAt))
    : null
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship ?? 'A connection worth keeping',
    title: row.title ?? undefined,
    tier,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    avatarHue: (HUES.includes(row.avatarHue as Contact['avatarHue'])
      ? row.avatarHue
      : 'coral') as Contact['avatarHue'],
    daysSinceContact: daysForLastContactedAt(lastContactedAt, tier, 0),
    lastContactedAt,
    context: row.context ?? '',
    interests,
    messages: parseMessages(row.messages),
  }
}

export async function getUserContacts(
  deviceId: string,
  executor: DbExecutor = db,
): Promise<Contact[]> {
  await ensureContactSchema()
  const rows = await executor
    .select()
    .from(userContacts)
    .where(eq(userContacts.deviceId, deviceId))
    .orderBy(userContacts.createdAt)
  return rows.map(rowToContact)
}

export async function addUserContact(
  deviceId: string,
  contact: Contact,
  executor: DbExecutor = db,
): Promise<void> {
  await ensureContactSchema()
  const safe = sanitizeContact(contact)
  const values = {
    id: safe.id,
    deviceId,
    name: safe.name,
    relationship: safe.relationship,
    title: safe.title ?? null,
    tier: safe.tier ?? 'network',
    phone: safe.phone ?? null,
    email: safe.email ?? null,
    avatarHue: safe.avatarHue,
    context: safe.context,
    interests: JSON.stringify(safe.interests ?? []),
    messages: JSON.stringify(safe.messages ?? []),
    lastContactedAt: safe.lastContactedAt
      ? dateInputToUtcNoon(safe.lastContactedAt)
      : null,
  }
  const [persisted] = await executor
    .insert(userContacts)
    .values(values)
    .onConflictDoUpdate({
      // A retry from the same device performs a harmless ownership-preserving
      // update so RETURNING can confirm success. Do not overwrite the row here:
      // the retry path follows with a field PATCH, while confirmed messages
      // remain append-only. A collision owned by another device performs no
      // update and returns no row, so callers can reject it without leaking
      // the other owner.
      ...sameDeviceContactConflict(deviceId),
    })
    .returning({ id: userContacts.id })

  if (!persisted) throw new ContactOwnershipConflictError(safe.id)
}

/**
 * Idempotently persist an import batch and return how many requested ids now
 * belong to this device. This makes a retry safe after a lost HTTP response.
 */
export async function addUserContacts(
  deviceId: string,
  contacts: Contact[],
  executor: DbExecutor = db,
): Promise<number> {
  if (contacts.length === 0) return 0
  await ensureContactSchema()
  const unique = new Map<string, Contact>()
  for (const contact of contacts.map(sanitizeContact)) {
    if (!unique.has(contact.id)) unique.set(contact.id, contact)
  }
  const values = [...unique.values()].map((contact) => ({
    id: contact.id,
    deviceId,
    name: contact.name,
    relationship: contact.relationship,
    title: contact.title ?? null,
    tier: contact.tier ?? 'network',
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    avatarHue: contact.avatarHue,
    context: contact.context,
    interests: JSON.stringify(contact.interests ?? []),
    messages: JSON.stringify(contact.messages ?? []),
    lastContactedAt: contact.lastContactedAt
      ? dateInputToUtcNoon(contact.lastContactedAt)
      : null,
  }))
  await executor
    .insert(userContacts)
    .values(values)
    .onConflictDoUpdate(sameDeviceImportedContactConflict(deviceId))
  const persisted = await executor
    .select({ id: userContacts.id })
    .from(userContacts)
    .where(
      and(
        eq(userContacts.deviceId, deviceId),
        inArray(
          userContacts.id,
          values.map((contact) => contact.id),
        ),
      ),
    )
  return persisted.length
}

export async function updateUserContact(
  deviceId: string,
  contactId: string,
  updates: ContactUpdateInput,
  executor: DbExecutor = db,
): Promise<boolean> {
  await ensureContactSchema()
  const set: Partial<typeof userContacts.$inferInsert> = {}

  if (updates.name !== undefined) {
    set.name = cap(updates.name, TEXT_LIMITS.name) ?? 'New contact'
  }
  if (updates.relationship !== undefined) {
    set.relationship =
      cap(updates.relationship, TEXT_LIMITS.relationship) ??
      'A connection worth keeping'
  }
  if (updates.title !== undefined) set.title = cap(updates.title, TEXT_LIMITS.title) ?? null
  if (updates.tier !== undefined) {
    set.tier = (['key', 'network', 'casual'] as const).includes(updates.tier)
      ? updates.tier
      : 'network'
  }
  if (updates.phone !== undefined) set.phone = cap(updates.phone, TEXT_LIMITS.phone) ?? null
  if (updates.email !== undefined) {
    set.email = cap(updates.email, TEXT_LIMITS.email)?.toLowerCase() ?? null
  }
  if (updates.context !== undefined) {
    set.context = cap(updates.context, TEXT_LIMITS.context) ?? ''
  }
  if (updates.interests !== undefined) {
    set.interests = JSON.stringify(
      updates.interests
        .map((interest) => cap(interest, TEXT_LIMITS.interest))
        .filter((interest): interest is string => Boolean(interest))
        .slice(0, CONTACT_LIMITS.interests),
    )
  }
  if (updates.lastContactedAt !== undefined) {
    const normalized = normalizeLastContactedAt(updates.lastContactedAt)
    set.lastContactedAt = normalized ? dateInputToUtcNoon(normalized) : null
  }

  if (Object.keys(set).length === 0) {
    const [existing] = await executor
      .select({ id: userContacts.id })
      .from(userContacts)
      .where(
        and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)),
      )
      .limit(1)
    return Boolean(existing)
  }
  const updated = await executor
    .update(userContacts)
    .set(set)
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
    .returning({ id: userContacts.id })
  return updated.length > 0
}

export async function touchUserContact(
  deviceId: string,
  contactId: string,
  contactedOn?: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  await ensureContactSchema()
  const normalized = normalizeLastContactedAt(contactedOn)
  const updated = await executor
    .update(userContacts)
    .set({
      lastContactedAt:
        (normalized && dateInputToUtcNoon(normalized)) || new Date(),
    })
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
    .returning({ id: userContacts.id })
  return updated.length > 0
}

/** Persist one user-confirmed external outreach and advance its cadence once. */
export type OutreachConfirmationResult =
  | 'confirmed'
  | 'duplicate'
  | 'missing'
  | 'invalid'

export async function confirmUserOutreach(
  deviceId: string,
  contactId: string,
  message: Message,
  executor: DbExecutor = db,
): Promise<OutreachConfirmationResult> {
  await ensureContactSchema()
  const [row] = await executor
    .select({ messages: userContacts.messages })
    .from(userContacts)
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
    .limit(1)
  if (!row) return 'missing'

  const safe = safeMessage(message)
  if (!safe || safe.sender !== 'me' || !safe.sentAt || !safe.channel) {
    return 'invalid'
  }
  const previous = parseMessages(row.messages)
  const next = appendMessageOnce(previous, safe)
  if (!next.inserted) return 'duplicate'

  const confirmedOn = confirmedOutreachDate(safe)
  if (!confirmedOn) return 'invalid'

  const updated = await executor
    .update(userContacts)
    .set({
      messages: JSON.stringify(next.messages),
      lastContactedAt: dateInputToUtcNoon(confirmedOn),
    })
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
    .returning({ id: userContacts.id })
  return updated.length > 0 ? 'confirmed' : 'missing'
}

/** Delete a person and every device-scoped trace tied to that contact id. */
export async function deleteUserContact(
  deviceId: string,
  contactId: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .delete(circleTags)
    .where(and(eq(circleTags.deviceId, deviceId), eq(circleTags.contactId, contactId)))
  await executor
    .delete(memorySignals)
    .where(
      and(
        eq(memorySignals.deviceId, deviceId),
        eq(memorySignals.contactId, contactId),
      ),
    )
  await executor
    .delete(userContacts)
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
}

// ---- Circle (group) tags ----

export type CircleMap = Record<string, string[]>

export async function getCircleTags(
  deviceId: string,
  executor: DbExecutor = db,
): Promise<CircleMap> {
  const rows = await executor
    .select()
    .from(circleTags)
    .where(eq(circleTags.deviceId, deviceId))
  const map: CircleMap = {}
  for (const row of rows) map[row.contactId] = [row.circle]
  return map
}

export async function setCircleTag(
  deviceId: string,
  contactId: string,
  circle: string | null,
  executor: DbExecutor = db,
): Promise<void> {
  if (!circle) {
    await executor
      .delete(circleTags)
      .where(and(eq(circleTags.deviceId, deviceId), eq(circleTags.contactId, contactId)))
    return
  }
  await executor
    .insert(circleTags)
    .values({ deviceId, contactId, circle })
    .onConflictDoUpdate({
      target: [circleTags.deviceId, circleTags.contactId],
      set: { circle },
    })
}
