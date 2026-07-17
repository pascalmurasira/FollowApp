import type { Contact, Tier } from '@/lib/types'
import { cadenceForTier } from '@/lib/format'
import {
  daysForLastContactedAt,
  normalizeLastContactedAt,
  todayDateInputValue,
} from '@/lib/contact-dates'
import {
  ContactImportError,
  confirmedImportCount,
  contactImportBatches,
} from '@/lib/contact-import-utils'
import { serializeContactWrite } from '@/lib/contact-write-queue'

export { ContactImportError } from '@/lib/contact-import-utils'

const HUES: Contact['avatarHue'][] = ['coral', 'teal', 'amber', 'rose', 'sage']

function contactWriteKey(deviceId: string, contactId: string): string {
  return `${deviceId}:${contactId}`
}

/** Pick a stable-ish avatar hue so new contacts get varied colors. */
function pickHue(seed: number): Contact['avatarHue'] {
  return HUES[seed % HUES.length]
}

export interface NewContactInput {
  name: string
  relationship: string
  title?: string
  tier?: Tier
  phone?: string
  email?: string
  context?: string
  interests?: string[]
  group?: string
  /** YYYY-MM-DD. Null/blank means "never contacted". */
  lastContactedAt?: string | null
}

// Free/consumer email hosts that say nothing about where someone works.
const PERSONAL_EMAIL_HOSTS = new Set([
  'gmail',
  'googlemail',
  'outlook',
  'hotmail',
  'live',
  'yahoo',
  'ymail',
  'icloud',
  'me',
  'mac',
  'proton',
  'protonmail',
  'pm',
  'aol',
  'gmx',
  'zoho',
  'fastmail',
])

/**
 * Best-effort company name from a work email's domain. Returns undefined for
 * personal/free hosts. e.g. "maya@linear.app" → "Linear", ignores gmail etc.
 */
export function inferCompanyFromEmail(email?: string): string | undefined {
  if (!email || !email.includes('@')) return undefined
  const domain = email.split('@')[1]?.trim().toLowerCase()
  if (!domain) return undefined
  // Drop the TLD(s), keep the most significant label (handles co.uk, com.au).
  const labels = domain.split('.').filter(Boolean)
  if (labels.length < 2) return undefined
  const tlds = new Set(['com', 'co', 'org', 'net', 'io', 'app', 'ai', 'dev', 'uk', 'au', 'us'])
  let idx = labels.length - 1
  while (idx > 0 && tlds.has(labels[idx])) idx--
  const main = labels[idx]
  if (!main || PERSONAL_EMAIL_HOSTS.has(main)) return undefined
  return main.charAt(0).toUpperCase() + main.slice(1)
}

/** Tidy a typed name: trim, collapse spaces, and title-case shouty/quiet input. */
export function normalizeName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  // Only re-case when the user typed all-lower or ALL-CAPS; leave MixedCase be.
  const isAllLower = cleaned === cleaned.toLowerCase()
  const isAllUpper = cleaned === cleaned.toUpperCase()
  if (!isAllLower && !isAllUpper) return cleaned
  return cleaned.replace(/\b[\p{L}]/gu, (c) => c.toUpperCase())
}

/** Build a full Contact from minimal user input. */
export function createContact(input: NewContactInput, seed = Date.now()): Contact {
  const id = `user-${seed.toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const name = normalizeName(input.name)
  const tier = input.tier ?? 'network'
  const lastContactedAt = normalizeLastContactedAt(input.lastContactedAt) ?? null
  return {
    id,
    name,
    relationship: input.relationship.trim() || 'A connection worth keeping',
    title: input.title?.trim() || undefined,
    tier,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim().toLowerCase() || undefined,
    avatarHue: pickHue(seed),
    // Blank date means "never contacted": show the contact as due now instead
    // of hiding them as on-track.
    daysSinceContact: daysForLastContactedAt(
      lastContactedAt,
      tier,
      cadenceForTier(tier),
    ),
    lastContactedAt,
    context:
      input.context?.trim() ||
      `You added ${name.split(' ')[0]} to FollowApp to stay in better touch.`,
    interests: (input.interests ?? []).map((i) => i.trim()).filter(Boolean),
    groups: input.group ? [input.group] : [],
    messages: [],
  }
}

export function touchLocalContact(contactId: string): void {
  const local = readLocalPeople()
  writeLocalPeople({
    ...local,
    contacts: local.contacts.map((contact) =>
      contact.id === contactId
        ? {
            ...contact,
            daysSinceContact: 0,
            lastContactedAt: todayDateInputValue(),
          }
        : contact,
    ),
  })
}

// ---- Circle (group) tags ----

/** Map of contactId -> circle names. Applies to seed + custom contacts alike. */
export type GroupTags = Record<string, string[]>

/**
 * Merge seed + custom contacts and overlay saved circle tags onto each. Tags
 * live in their own map so users can sort the built-in demo contacts too.
 */
export function mergeContacts(seed: Contact[], custom: Contact[], tags: GroupTags): Contact[] {
  return [...seed, ...custom].map((c) => ({
    ...c,
    groups: tags[c.id] ?? c.groups ?? [],
  }))
}

/** Sorted, de-duplicated list of every circle name currently in use. */
export function allGroupNames(tags: GroupTags): string[] {
  const set = new Set<string>()
  for (const list of Object.values(tags)) {
    for (const g of list) set.add(g)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

// ---- Neon-backed persistence (scoped by device id) ----

interface PeopleResponse {
  contacts: Contact[]
  circles: GroupTags
}

const LOCAL_PEOPLE_KEY = 'followapp.people.v1'

function readLocalPeople(): PeopleResponse {
  if (typeof window === 'undefined') return { contacts: [], circles: {} }
  try {
    const raw = window.localStorage.getItem(LOCAL_PEOPLE_KEY)
    if (!raw) return { contacts: [], circles: {} }
    const parsed = JSON.parse(raw) as Partial<PeopleResponse>
    return {
      contacts: Array.isArray(parsed.contacts)
        ? parsed.contacts
            .filter((c) => c?.id && c?.name)
            .map(refreshContactFreshness)
        : [],
      circles:
        parsed.circles && typeof parsed.circles === 'object'
          ? parsed.circles
          : {},
    }
  } catch (error) {
    console.error('[v0] Failed to load local people:', error)
    return { contacts: [], circles: {} }
  }
}

/** Synchronous first-paint data; remote reconciliation happens in background. */
export function loadLocalPeople(): PeopleResponse {
  return readLocalPeople()
}

function writeLocalPeople(people: PeopleResponse): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LOCAL_PEOPLE_KEY, JSON.stringify(people))
  } catch (error) {
    console.error('[v0] Failed to save local people:', error)
  }
}

export function upsertContacts(existing: Contact[], incoming: Contact[]): Contact[] {
  const byId = new Map(existing.map((contact) => [contact.id, contact]))
  for (const contact of incoming) byId.set(contact.id, contact)
  return [...byId.values()]
}

function refreshContactFreshness(contact: Contact): Contact {
  const normalizedLastContactedAt = normalizeLastContactedAt(
    contact.lastContactedAt,
  )
  return {
    ...contact,
    lastContactedAt:
      normalizedLastContactedAt === undefined
        ? contact.lastContactedAt
        : normalizedLastContactedAt,
    daysSinceContact: daysForLastContactedAt(
      contact.lastContactedAt,
      contact.tier,
      contact.daysSinceContact,
    ),
  }
}

/**
 * Load contacts from this browser first, then merge in the device-scoped server
 * copy. No account is required: the server copy is keyed by this browser's
 * anonymous device id so contacts survive reloads and browser storage hiccups.
 */
export async function fetchPeople(
  deviceId: string,
  _syncRemote = false,
): Promise<PeopleResponse> {
  void _syncRemote
  try {
    const res = await fetch('/api/contacts', {
      headers: { 'X-FollowApp-Device-Id': deviceId },
    })
    if (!res.ok) throw new Error(`Contacts fetch failed: ${res.status}`)
    const data = (await res.json()) as PeopleResponse
    // Re-read after the request so a contact added while sync was in flight is
    // merged rather than overwritten by the older snapshot.
    const local = readLocalPeople()
    const merged = {
      contacts: upsertContacts(
        (data.contacts ?? []).map(refreshContactFreshness),
        local.contacts,
      ),
      circles: { ...(data.circles ?? {}), ...local.circles },
    }
    writeLocalPeople(merged)
    return merged
  } catch (error) {
    console.error('[v0] Failed to load people:', error)
    return readLocalPeople()
  }
}

export interface ContactUpdateInput {
  name?: string
  relationship?: string
  title?: string
  tier?: Tier
  phone?: string
  email?: string
  context?: string
  interests?: string[]
  lastContactedAt?: string | null
}

export function applyContactUpdate(
  contact: Contact,
  updates: ContactUpdateInput,
): Contact {
  const nextTier = updates.tier ?? contact.tier ?? 'network'
  const normalizedCurrentLast = normalizeLastContactedAt(contact.lastContactedAt)
  const nextLastContactedAt =
    updates.lastContactedAt === undefined
      ? normalizedCurrentLast === undefined
        ? contact.lastContactedAt
        : normalizedCurrentLast
      : normalizeLastContactedAt(updates.lastContactedAt) ?? null

  return {
    ...contact,
    name: updates.name === undefined ? contact.name : normalizeName(updates.name),
    relationship:
      updates.relationship === undefined
        ? contact.relationship
        : updates.relationship.trim() || 'A connection worth keeping',
    title:
      updates.title === undefined
        ? contact.title
        : updates.title.trim() || undefined,
    tier: nextTier,
    phone:
      updates.phone === undefined ? contact.phone : updates.phone.trim() || undefined,
    email:
      updates.email === undefined
        ? contact.email
        : updates.email.trim().toLowerCase() || undefined,
    context:
      updates.context === undefined
        ? contact.context
        : updates.context.trim() || contact.context,
    interests:
      updates.interests === undefined
        ? contact.interests
        : updates.interests.map((i) => i.trim()).filter(Boolean),
    lastContactedAt: nextLastContactedAt,
    daysSinceContact: daysForLastContactedAt(
      nextLastContactedAt,
      nextTier,
      contact.daysSinceContact,
    ),
  }
}

export async function apiUpdateContact(
  deviceId: string,
  contactId: string,
  updates: ContactUpdateInput,
  _syncRemote = false,
): Promise<void> {
  void _syncRemote
  const local = readLocalPeople()
  const current = local.contacts.find((contact) => contact.id === contactId)
  const nextContact = current
    ? applyContactUpdate(current, updates)
    : undefined
  if (nextContact) {
    writeLocalPeople({
      ...local,
      contacts: upsertContacts(local.contacts, [nextContact]),
    })
  }

  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          contactId,
          action: 'update',
          updates,
        }),
      })
      if (!res.ok) throw new Error(`Contact update failed: ${res.status}`)
    } catch (error) {
      console.error('[v0] Failed to update contact:', error)
    }
  })
}

export async function apiTouchContact(
  deviceId: string,
  contactId: string,
  _syncRemote = false,
): Promise<void> {
  void _syncRemote
  touchLocalContact(contactId)
  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contactId, action: 'touch' }),
      })
      if (!res.ok) throw new Error(`Contact touch failed: ${res.status}`)
    } catch (error) {
      console.error('[v0] Failed to update last contact date:', error)
    }
  })
}

/** Persist a contact locally and to the anonymous device-scoped server copy. */
export async function apiAddContact(
  deviceId: string,
  contact: Contact,
  _syncRemote = false,
): Promise<void> {
  void _syncRemote
  const local = readLocalPeople()
  writeLocalPeople({
    ...local,
    contacts: upsertContacts(local.contacts, [contact]),
  })
  await serializeContactWrite(contactWriteKey(deviceId, contact.id), async () => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contact }),
      })
      if (!res.ok) throw new Error(`Contact save failed: ${res.status}`)
    } catch (error) {
      console.error('[v0] Failed to add contact:', error)
    }
  })
}

/** Persist a batch of imported contacts for this device. Returns count saved. */
export async function apiImportContacts(
  deviceId: string,
  contacts: Contact[],
  _syncRemote = false,
): Promise<number> {
  void _syncRemote
  let savedCount = 0

  for (const batch of contactImportBatches(contacts)) {
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contacts: batch }),
      })
      if (!res.ok) throw new Error(`Import failed: ${res.status}`)

      const confirmed = confirmedImportCount(await res.json(), batch.length)
      savedCount += confirmed

      // Commit local state only after the server confirmed this exact batch.
      // Reading afresh avoids overwriting another contact edit made in flight.
      const local = readLocalPeople()
      writeLocalPeople({
        ...local,
        contacts: upsertContacts(local.contacts, batch),
      })
    } catch (error) {
      console.error('[v0] Failed to import contacts:', error)
      throw new ContactImportError(
        'The contact import could not be completed. Please try again.',
        savedCount,
      )
    }
  }

  return savedCount
}

/** Assign or clear a contact's circle for this device. */
export async function apiSetCircle(
  deviceId: string,
  contactId: string,
  circle: string | null,
  _syncRemote = false,
): Promise<void> {
  void _syncRemote
  const local = readLocalPeople()
  const circles = { ...local.circles }
  if (circle) circles[contactId] = [circle]
  else delete circles[contactId]
  writeLocalPeople({ ...local, circles })
  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contactId, circle }),
      })
      if (!res.ok) throw new Error(`Circle save failed: ${res.status}`)
    } catch (error) {
      console.error('[v0] Failed to set circle:', error)
    }
  })
}
