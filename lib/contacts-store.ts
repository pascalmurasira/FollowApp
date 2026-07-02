import type { Contact, Tier } from '@/lib/types'

const HUES: Contact['avatarHue'][] = ['coral', 'teal', 'amber', 'rose', 'sage']

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
  return {
    id,
    name,
    relationship: input.relationship.trim() || 'A connection worth keeping',
    title: input.title?.trim() || undefined,
    tier: input.tier ?? 'network',
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim().toLowerCase() || undefined,
    avatarHue: pickHue(seed),
    // Start as gently overdue so they surface in the feed with a cold-open.
    daysSinceContact: 7,
    context:
      input.context?.trim() ||
      `You added ${name.split(' ')[0]} to FollowApp to stay in better touch.`,
    interests: (input.interests ?? []).map((i) => i.trim()).filter(Boolean),
    groups: input.group ? [input.group] : [],
    messages: [],
  }
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

/** Fetch this device's added contacts and circle assignments from Neon. */
export async function fetchPeople(deviceId: string): Promise<PeopleResponse> {
  try {
    const res = await fetch(`/api/contacts?deviceId=${encodeURIComponent(deviceId)}`)
    if (!res.ok) throw new Error(`Contacts fetch failed: ${res.status}`)
    const data = (await res.json()) as PeopleResponse
    return { contacts: data.contacts ?? [], circles: data.circles ?? {} }
  } catch (error) {
    console.error('[v0] Failed to load people:', error)
    return { contacts: [], circles: {} }
  }
}

/** Persist a newly added contact for this device. */
export async function apiAddContact(deviceId: string, contact: Contact): Promise<void> {
  try {
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, contact }),
    })
  } catch (error) {
    console.error('[v0] Failed to add contact:', error)
  }
}

/** Persist a batch of imported contacts for this device. Returns count saved. */
export async function apiImportContacts(
  deviceId: string,
  contacts: Contact[],
): Promise<number> {
  try {
    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, contacts }),
    })
    if (!res.ok) throw new Error(`Import failed: ${res.status}`)
    const data = (await res.json()) as { saved?: number }
    return data.saved ?? 0
  } catch (error) {
    console.error('[v0] Failed to import contacts:', error)
    return 0
  }
}

/** Assign or clear a contact's circle for this device. */
export async function apiSetCircle(
  deviceId: string,
  contactId: string,
  circle: string | null,
): Promise<void> {
  try {
    await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, contactId, circle }),
    })
  } catch (error) {
    console.error('[v0] Failed to set circle:', error)
  }
}
