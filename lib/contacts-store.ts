import type { Contact, ContactEncounter, Message, Tier } from '@/lib/types'
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
import {
  serializeContactWrite,
  serializeContactWrites,
} from '@/lib/contact-write-queue'
import { appendMessageOnce } from '@/lib/contact-outreach'
import {
  mergeReimportedContact,
  reconcilePeopleSnapshot,
} from '@/lib/contact-reconciliation'
import {
  clearContactAccessFailure,
  contactSyncRevision,
  pendingContactOperations,
  queuePendingContactOperation,
  recordContactAccessFailure,
  resolvePendingContactOperation,
  type PendingContactOperation,
} from '@/lib/contact-sync-recovery'
import { CONTACT_LIMITS } from '@/lib/persistence-limits'
import { normalizeEncounters } from '@/lib/encounters'

export { ContactImportError } from '@/lib/contact-import-utils'

export class ContactPersistenceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ContactPersistenceError'
  }
}

async function contactPersistenceError(
  response: Response,
  label: string,
): Promise<ContactPersistenceError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
  }
  return new ContactPersistenceError(
    body.error || `${label} failed`,
    response.status,
    body.code,
  )
}

function markContactWritePending(
  operation: PendingContactOperation,
  error: unknown,
): void {
  const pending = pendingContactOperations()
  const deletedAfterThisWrite =
    operation.kind !== 'delete' &&
    pending.some(
      (candidate) =>
        candidate.kind === 'delete' &&
        candidate.contactId === operation.contactId,
    )
  const newerIntent = pending.some(
    (candidate) =>
      candidate.kind === operation.kind &&
      candidate.contactId === operation.contactId &&
      candidate.intentId &&
      candidate.intentId !== operation.intentId,
  )
  const recreatedAfterDelete =
    operation.kind === 'delete' &&
    readLocalPeople().contacts.some(
      (contact) => contact.id === operation.contactId,
    )
  if (deletedAfterThisWrite || newerIntent || recreatedAfterDelete) {
    if (error instanceof ContactPersistenceError && error.status) {
      recordContactAccessFailure(error.status)
    }
    return
  }
  queuePendingContactOperation(
    operation,
    error instanceof ContactPersistenceError ? error.status : undefined,
  )
}

function contactIntent(
  kind: PendingContactOperation['kind'],
  contactId: string,
): PendingContactOperation {
  return {
    kind,
    contactId,
    intentId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
  }
}

const HUES: Contact['avatarHue'][] = ['coral', 'teal', 'amber', 'rose', 'sage']

function cappedText(value: string | undefined, max: number): string {
  return value?.trim().slice(0, max) ?? ''
}

export function normalizeCircleName(value: string | null | undefined): string | null {
  return cappedText(value ?? undefined, CONTACT_LIMITS.group) || null
}

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
  encounters?: ContactEncounter[]
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
  const name =
    normalizeName(input.name).slice(0, CONTACT_LIMITS.name) || 'New contact'
  const tier = input.tier ?? 'network'
  const lastContactedAt = normalizeLastContactedAt(input.lastContactedAt) ?? null
  const relationship = cappedText(
    input.relationship,
    CONTACT_LIMITS.relationship,
  )
  const title = cappedText(input.title, CONTACT_LIMITS.title)
  const phone = cappedText(input.phone, CONTACT_LIMITS.phone)
  const email = cappedText(input.email, CONTACT_LIMITS.email).toLowerCase()
  const suppliedContext = cappedText(input.context, CONTACT_LIMITS.context)
  const group = normalizeCircleName(input.group)
  return {
    id,
    name,
    relationship: relationship || 'A connection worth keeping',
    title: title || undefined,
    tier,
    phone: phone || undefined,
    email: email || undefined,
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
      suppliedContext ||
      `You added ${name.split(' ')[0]} to FollowApp to stay in better touch.`,
    interests: (input.interests ?? [])
      .map((interest) => cappedText(interest, CONTACT_LIMITS.interest))
      .filter(Boolean)
      .slice(0, CONTACT_LIMITS.interests),
    encounters: normalizeEncounters(input.encounters),
    groups: group ? [group] : [],
    messages: [],
  }
}

export function touchLocalContact(
  contactId: string,
  contactedOn = todayDateInputValue(),
): void {
  const local = readLocalPeople()
  writeLocalPeople({
    ...local,
    contacts: local.contacts.map((contact) =>
      contact.id === contactId
        ? {
            ...contact,
            daysSinceContact: 0,
            lastContactedAt: contactedOn,
          }
        : contact,
    ),
  })
}

export function confirmLocalOutreach(contactId: string, message: Message): void {
  const local = readLocalPeople()
  const confirmedDate =
    normalizeLastContactedAt(message.sentOn ?? message.sentAt) ??
    todayDateInputValue()
  let inserted = false
  const contacts = local.contacts.map((contact) => {
    if (contact.id !== contactId) return contact
    const next = appendMessageOnce(contact.messages, message)
    if (!next.inserted) return contact
    inserted = true
    return {
      ...contact,
      daysSinceContact: 0,
      lastContactedAt: confirmedDate,
      messages: next.messages,
    }
  })
  if (!inserted) return
  writeLocalPeople({
    ...local,
    contacts,
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
const PEOPLE_FETCH_MAX_ATTEMPTS = 3

let localPeopleRevision = 0
let localPeopleStorageListenerInstalled = false

function currentLocalPeopleRevision(): number {
  if (
    !localPeopleStorageListenerInstalled &&
    typeof window !== 'undefined'
  ) {
    localPeopleStorageListenerInstalled = true
    window.addEventListener('storage', (event) => {
      if (event.key === LOCAL_PEOPLE_KEY) localPeopleRevision += 1
    })
  }
  return localPeopleRevision
}

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
  currentLocalPeopleRevision()
  localPeopleRevision += 1
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

export function refreshContactFreshness(contact: Contact): Contact {
  const normalizedLastContactedAt = normalizeLastContactedAt(
    contact.lastContactedAt,
  )
  return {
    ...contact,
    encounters: normalizeEncounters(contact.encounters),
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
  for (let attempt = 0; attempt < PEOPLE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const peopleRevisionAtStart = currentLocalPeopleRevision()
    const syncRevisionAtStart = contactSyncRevision()
    try {
      const res = await fetch('/api/contacts', {
        headers: { 'X-FollowApp-Device-Id': deviceId },
      })
      if (!res.ok) {
        recordContactAccessFailure(res.status)
        throw new ContactPersistenceError(
          `Contacts fetch failed: ${res.status}`,
          res.status,
        )
      }
      clearContactAccessFailure()
      const data = (await res.json()) as PeopleResponse

      // A local edit, a completed write, or another tab changed state while
      // this request was in flight. Its server snapshot may predate that work;
      // discard it and ask again instead of letting stale success win.
      if (
        peopleRevisionAtStart !== currentLocalPeopleRevision() ||
        syncRevisionAtStart !== contactSyncRevision()
      ) {
        continue
      }

      const local = readLocalPeople()
      const merged = reconcilePeopleSnapshot(
        {
          contacts: (data.contacts ?? []).map(refreshContactFreshness),
          circles: data.circles ?? {},
        },
        local,
        pendingContactOperations(),
      )
      writeLocalPeople(merged)
      return merged
    } catch (error) {
      console.error('[v0] Failed to load people:', error)
      return readLocalPeople()
    }
  }

  // Continuous local activity is safer to keep than any snapshot that could
  // have raced it. A later foreground/background sync will try again.
  return readLocalPeople()
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
  encounters?: ContactEncounter[] | null
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
    name:
      updates.name === undefined
        ? contact.name
        : normalizeName(updates.name).slice(0, CONTACT_LIMITS.name) ||
          'New contact',
    relationship:
      updates.relationship === undefined
        ? contact.relationship
        : cappedText(updates.relationship, CONTACT_LIMITS.relationship) ||
          'A connection worth keeping',
    title:
      updates.title === undefined
        ? contact.title
        : cappedText(updates.title, CONTACT_LIMITS.title) || undefined,
    tier: nextTier,
    phone:
      updates.phone === undefined
        ? contact.phone
        : cappedText(updates.phone, CONTACT_LIMITS.phone) || undefined,
    email:
      updates.email === undefined
        ? contact.email
        : cappedText(updates.email, CONTACT_LIMITS.email).toLowerCase() ||
          undefined,
    context:
      updates.context === undefined
        ? contact.context
        : cappedText(updates.context, CONTACT_LIMITS.context) || contact.context,
    interests:
      updates.interests === undefined
        ? contact.interests
        : updates.interests
            .map((interest) =>
              cappedText(interest, CONTACT_LIMITS.interest),
            )
            .filter(Boolean)
            .slice(0, CONTACT_LIMITS.interests),
    encounters:
      updates.encounters === undefined
        ? contact.encounters
        : updates.encounters === null
          ? undefined
          : normalizeEncounters(updates.encounters),
    lastContactedAt: nextLastContactedAt,
    daysSinceContact: daysForLastContactedAt(
      nextLastContactedAt,
      nextTier,
      contact.daysSinceContact,
    ),
  }
}

function normalizedUpdatePayload(
  requested: ContactUpdateInput,
  next: Contact,
): ContactUpdateInput {
  const result: ContactUpdateInput = {}
  if (requested.name !== undefined) result.name = next.name
  if (requested.relationship !== undefined) {
    result.relationship = next.relationship
  }
  if (requested.title !== undefined) result.title = next.title ?? ''
  if (requested.tier !== undefined) result.tier = next.tier
  if (requested.phone !== undefined) result.phone = next.phone ?? ''
  if (requested.email !== undefined) result.email = next.email ?? ''
  if (requested.context !== undefined) result.context = next.context
  if (requested.interests !== undefined) result.interests = next.interests
  if (requested.encounters !== undefined) {
    result.encounters = next.encounters ?? null
  }
  if (requested.lastContactedAt !== undefined) {
    result.lastContactedAt = next.lastContactedAt ?? null
  }
  return result
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
  const persistedUpdates = nextContact
    ? normalizedUpdatePayload(updates, nextContact)
    : updates
  if (nextContact) {
    writeLocalPeople({
      ...local,
      contacts: upsertContacts(local.contacts, [nextContact]),
    })
  }
  const operation = contactIntent('update', contactId)
  queuePendingContactOperation(operation)

  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      await requirePatchWithContactRecovery(
        deviceId,
        contactId,
        {
          deviceId,
          contactId,
          action: 'update',
          updates: persistedUpdates,
        },
        'Contact update',
      )
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
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
  const contactedOn = todayDateInputValue()
  touchLocalContact(contactId, contactedOn)
  const operation = contactIntent('touch', contactId)
  queuePendingContactOperation(operation)
  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      await requirePatchWithContactRecovery(
        deviceId,
        contactId,
        { deviceId, contactId, action: 'touch', contactedOn },
        'Contact touch',
      )
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
      console.error('[v0] Failed to update last contact date:', error)
    }
  })
}

/** Persist a user-confirmed outreach; opening a composer never calls this. */
export async function apiConfirmOutreach(
  deviceId: string,
  contactId: string,
  message: Message,
  _syncRemote = false,
): Promise<void> {
  void _syncRemote
  const confirmedMessage: Message = {
    ...message,
    sentOn:
      message.sentOn ??
      normalizeLastContactedAt(message.sentAt) ??
      todayDateInputValue(),
  }
  confirmLocalOutreach(contactId, confirmedMessage)
  const operation = contactIntent('outreach', contactId)
  queuePendingContactOperation(operation)
  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      await requirePatchWithContactRecovery(
        deviceId,
        contactId,
        {
          deviceId,
          contactId,
          action: 'outreach',
          message: confirmedMessage,
        },
        'Outreach confirmation',
      )
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
      console.error('[v0] Failed to confirm outreach:', error)
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
  const operation = contactIntent('upsert', contact.id)
  // Record local intent before network I/O. This also supersedes a pending
  // delete if a stable imported id is intentionally recreated.
  queuePendingContactOperation(operation)
  await serializeContactWrite(contactWriteKey(deviceId, contact.id), async () => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contact }),
      })
      if (!res.ok) throw await contactPersistenceError(res, 'Contact save')
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
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
      const confirmed = await serializeContactWrites(
        batch.map((contact) => contactWriteKey(deviceId, contact.id)),
        async () => {
          const res = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, contacts: batch }),
          })
          if (!res.ok) throw new Error(`Import failed: ${res.status}`)
          return confirmedImportCount(await res.json(), batch.length)
        },
      )
      savedCount += confirmed

      // A successfully imported stable id is an explicit recreation and must
      // cancel any older offline delete for that same person.
      for (const contact of batch.slice(0, confirmed)) {
        const operation = contactIntent('upsert', contact.id)
        queuePendingContactOperation(operation)
        resolvePendingContactOperation(operation)
      }

      // Commit local state only after the server confirmed this exact batch.
      // Reading afresh avoids overwriting another contact edit made in flight.
      const local = readLocalPeople()
      const localById = new Map(
        local.contacts.map((contact) => [contact.id, contact]),
      )
      writeLocalPeople({
        ...local,
        contacts: upsertContacts(
          local.contacts,
          batch.map((contact) =>
            mergeReimportedContact(localById.get(contact.id), contact),
          ),
        ),
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
  const normalizedCircle = normalizeCircleName(circle)
  const local = readLocalPeople()
  const circles = { ...local.circles }
  if (normalizedCircle) circles[contactId] = [normalizedCircle]
  else delete circles[contactId]
  writeLocalPeople({ ...local, circles })
  const operation = contactIntent('circle', contactId)
  queuePendingContactOperation(operation)
  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      await requirePatchWithContactRecovery(
        deviceId,
        contactId,
        { deviceId, contactId, circle: normalizedCircle },
        'Circle save',
      )
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
      console.error('[v0] Failed to set circle:', error)
    }
  })
}

export function removeLocalContact(contactId: string): void {
  const local = readLocalPeople()
  const circles = { ...local.circles }
  delete circles[contactId]
  writeLocalPeople({
    contacts: local.contacts.filter((contact) => contact.id !== contactId),
    circles,
  })
}

/**
 * Remove a person locally immediately, then delete their server copy. If the
 * network or authorization fails, the desired delete is retained for retry.
 */
export async function apiDeleteContact(
  deviceId: string,
  contactId: string,
): Promise<void> {
  removeLocalContact(contactId)
  const operation = contactIntent('delete', contactId)
  queuePendingContactOperation(operation)

  await serializeContactWrite(contactWriteKey(deviceId, contactId), async () => {
    try {
      const response = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contactId }),
      })
      if (!response.ok) {
        throw await contactPersistenceError(response, 'Contact removal')
      }
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
      console.error('[v0] Failed to remove contact:', error)
      throw error
    }
  })
}

function fullContactUpdate(contact: Contact): ContactUpdateInput {
  return {
    name: contact.name,
    relationship: contact.relationship,
    title: contact.title ?? '',
    tier: contact.tier,
    phone: contact.phone ?? '',
    email: contact.email ?? '',
    context: contact.context,
    interests: contact.interests,
    encounters: contact.encounters ?? null,
    lastContactedAt: contact.lastContactedAt ?? null,
  }
}

async function requireContactWrite(
  input: RequestInfo | URL,
  init: RequestInit,
  label: string,
): Promise<void> {
  const response = await fetch(input, init)
  if (!response.ok) throw await contactPersistenceError(response, label)
}

async function requirePatchWithContactRecovery(
  deviceId: string,
  contactId: string,
  body: Record<string, unknown>,
  label: string,
): Promise<void> {
  const request = () =>
    fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  let response = await request()
  if (response.status === 404) {
    const contact = readLocalPeople().contacts.find(
      (candidate) => candidate.id === contactId,
    )
    if (!contact) throw await contactPersistenceError(response, label)
    await requireContactWrite(
      '/api/contacts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, contact }),
      },
      'Contact recovery',
    )
    response = await request()
  }
  if (!response.ok) throw await contactPersistenceError(response, label)
}

async function replayPendingContactOperation(
  deviceId: string,
  operation: PendingContactOperation,
): Promise<void> {
  const local = readLocalPeople()
  const contact = local.contacts.find(
    (candidate) => candidate.id === operation.contactId,
  )
  const jsonHeaders = { 'Content-Type': 'application/json' }

  if (operation.kind === 'delete' || !contact) {
    await requireContactWrite(
      '/api/contacts',
      {
        method: 'DELETE',
        headers: jsonHeaders,
        body: JSON.stringify({ deviceId, contactId: operation.contactId }),
      },
      'Contact removal',
    )
    return
  }

  if (operation.kind === 'upsert' || operation.kind === 'update') {
    // POST makes a missing row available; PATCH reconciles an existing row to
    // the complete local desired state. Both endpoints are idempotent here.
    await requireContactWrite(
      '/api/contacts',
      {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ deviceId, contact }),
      },
      'Contact save',
    )
    await requireContactWrite(
      '/api/contacts',
      {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({
          deviceId,
          contactId: operation.contactId,
          action: 'update',
          updates: fullContactUpdate(contact),
        }),
      },
      'Contact update',
    )
    return
  }

  if (operation.kind === 'touch') {
    await requirePatchWithContactRecovery(
      deviceId,
      operation.contactId,
      {
        deviceId,
        contactId: operation.contactId,
        action: 'touch',
        contactedOn:
          normalizeLastContactedAt(contact.lastContactedAt) ??
          todayDateInputValue(),
      },
      'Contact touch',
    )
    return
  }

  if (operation.kind === 'circle') {
    await requirePatchWithContactRecovery(
      deviceId,
      operation.contactId,
      {
          deviceId,
          contactId: operation.contactId,
          circle: local.circles[operation.contactId]?.[0] ?? null,
      },
      'Circle save',
    )
    return
  }

  try {
    // Confirmed messages are replayed by id; the server de-duplicates them.
    for (const message of contact.messages) {
      if (
        message.sender !== 'me' ||
        !message.sentAt ||
        (message.channel !== 'whatsapp' && message.channel !== 'email')
      ) {
        continue
      }
      await requirePatchWithContactRecovery(
        deviceId,
        operation.contactId,
        {
            deviceId,
            contactId: operation.contactId,
            action: 'outreach',
            message,
        },
        'Outreach confirmation',
      )
    }
  } catch (error) {
    if (!(error instanceof ContactPersistenceError) || error.status !== 404) {
      throw error
    }
    throw error
  }
}

/** Retry every locally retained contact write and keep only failures queued. */
export async function retryPendingContactWrites(deviceId: string): Promise<void> {
  let firstError: unknown

  for (const operation of pendingContactOperations()) {
    try {
      await serializeContactWrite(
        contactWriteKey(deviceId, operation.contactId),
        () => replayPendingContactOperation(deviceId, operation),
      )
      resolvePendingContactOperation(operation)
    } catch (error) {
      markContactWritePending(operation, error)
      firstError ??= error
    }
  }

  if (firstError) throw firstError
}
