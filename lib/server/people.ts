import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, pool } from '@/lib/db'
import { circleTags, profiles, userContacts } from '@/lib/db/schema'
import type { Contact, Profile } from '@/lib/types'
import {
  daysForLastContactedAt,
  normalizeLastContactedAt,
  toDateInputValue,
} from '@/lib/contact-dates'
import type { ContactUpdateInput } from '@/lib/contacts-store'

/**
 * Server-only persistence for the user's profile, added contacts, and circle
 * assignments. Everything is scoped by `deviceId` (anonymous, no auth) exactly
 * like the memory layer — a device only ever sees its own rows.
 */

const DEFAULT_NAME = 'You'
const TEXT_LIMITS = {
  id: 160,
  name: 120,
  relationship: 180,
  title: 180,
  phone: 80,
  email: 254,
  avatarHue: 24,
  context: 2_000,
  interest: 80,
}

// ---- Profile ----

export async function getProfile(deviceId: string): Promise<Profile> {
  const [row] = await db
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

export async function saveProfile(deviceId: string, profile: Profile): Promise<void> {
  await db
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

function ensureContactSchema(): Promise<void> {
  contactSchemaReady ??= pool
    .query(
      'ALTER TABLE user_contacts ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz',
    )
    .then(() => undefined)
  return contactSchemaReady
}

function cap(value: string | null | undefined, max: number): string | undefined {
  const cleaned = value?.trim()
  if (!cleaned) return undefined
  return cleaned.slice(0, max)
}

function safeDays(days: number | undefined): number {
  if (!Number.isFinite(days)) return 0
  return Math.min(3650, Math.max(0, Math.floor(days ?? 0)))
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
      .slice(0, 20),
    messages: [],
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
    ? toDateInputValue(new Date(row.lastContactedAt))
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
    // Messages aren't persisted; relationship freshness is.
    daysSinceContact: daysForLastContactedAt(lastContactedAt, tier, 0),
    lastContactedAt,
    context: row.context ?? '',
    interests,
    messages: [],
  }
}

export async function getUserContacts(deviceId: string): Promise<Contact[]> {
  await ensureContactSchema()
  const rows = await db
    .select()
    .from(userContacts)
    .where(eq(userContacts.deviceId, deviceId))
    .orderBy(userContacts.createdAt)
  return rows.map(rowToContact)
}

export async function addUserContact(deviceId: string, contact: Contact): Promise<void> {
  await ensureContactSchema()
  const safe = sanitizeContact(contact)
  await db.insert(userContacts).values({
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
    lastContactedAt: safe.lastContactedAt
      ? new Date(`${safe.lastContactedAt}T12:00:00`)
      : null,
  })
}

/** Batch-insert imported contacts in one statement. Returns the count saved. */
export async function addUserContacts(
  deviceId: string,
  contacts: Contact[],
): Promise<number> {
  if (contacts.length === 0) return 0
  await ensureContactSchema()
  const values = contacts.map(sanitizeContact).map((contact) => ({
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
    lastContactedAt: contact.lastContactedAt
      ? new Date(`${contact.lastContactedAt}T12:00:00`)
      : null,
  }))
  await db.insert(userContacts).values(values)
  return values.length
}

export async function updateUserContact(
  deviceId: string,
  contactId: string,
  updates: ContactUpdateInput,
): Promise<void> {
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
        .slice(0, 20),
    )
  }
  if (updates.lastContactedAt !== undefined) {
    const normalized = normalizeLastContactedAt(updates.lastContactedAt)
    set.lastContactedAt = normalized ? new Date(`${normalized}T12:00:00`) : null
  }

  if (Object.keys(set).length === 0) return
  await db
    .update(userContacts)
    .set(set)
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
}

export async function touchUserContact(
  deviceId: string,
  contactId: string,
): Promise<void> {
  await ensureContactSchema()
  await db
    .update(userContacts)
    .set({ lastContactedAt: new Date() })
    .where(and(eq(userContacts.deviceId, deviceId), eq(userContacts.id, contactId)))
}

// ---- Circle (group) tags ----

export type CircleMap = Record<string, string[]>

export async function getCircleTags(deviceId: string): Promise<CircleMap> {
  const rows = await db
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
): Promise<void> {
  if (!circle) {
    await db
      .delete(circleTags)
      .where(and(eq(circleTags.deviceId, deviceId), eq(circleTags.contactId, contactId)))
    return
  }
  await db
    .insert(circleTags)
    .values({ deviceId, contactId, circle })
    .onConflictDoUpdate({
      target: [circleTags.deviceId, circleTags.contactId],
      set: { circle },
    })
}
