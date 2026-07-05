import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, pool } from '@/lib/db'
import { circleTags, profiles, userContacts } from '@/lib/db/schema'
import type { Contact, Profile } from '@/lib/types'

/**
 * Server-only persistence for the user's profile, added contacts, and circle
 * assignments. Everything is scoped by `deviceId` (anonymous, no auth) exactly
 * like the memory layer — a device only ever sees its own rows.
 */

const DEFAULT_NAME = 'You'

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

function daysSince(date: Date | string | null | undefined): number {
  if (!date) return 7
  const ms = Date.now() - new Date(date).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.max(0, Math.floor(ms / 86_400_000))
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
    daysSinceContact: daysSince(row.lastContactedAt ?? row.createdAt),
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
  await db.insert(userContacts).values({
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
    lastContactedAt: new Date(Date.now() - contact.daysSinceContact * 86_400_000),
  })
}

/** Batch-insert imported contacts in one statement. Returns the count saved. */
export async function addUserContacts(
  deviceId: string,
  contacts: Contact[],
): Promise<number> {
  if (contacts.length === 0) return 0
  await ensureContactSchema()
  const values = contacts.map((contact) => ({
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
    lastContactedAt: new Date(Date.now() - contact.daysSinceContact * 86_400_000),
  }))
  await db.insert(userContacts).values(values)
  return values.length
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
