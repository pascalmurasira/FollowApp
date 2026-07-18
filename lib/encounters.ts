import type {
  Contact,
  ContactEncounter,
  EncounterCaptureMethod,
  EncounterEvent,
  EncounterNextStep,
  FollowUpDisposition,
  NextStepKind,
} from './types.ts'
import { ENCOUNTER_LIMITS } from './persistence-limits.ts'
import { isDeliverableEmail } from './contact-validation.ts'

export interface ConferenceSession extends EncounterEvent {
  startedAt: string
  active: boolean
  endedAt?: string
}

export const NEXT_STEP_OPTIONS: ReadonlyArray<{
  kind: NextStepKind
  label: string
  shortLabel: string
}> = [
  { kind: 'send-deck', label: 'Send the deck', shortLabel: 'Deck' },
  { kind: 'make-introduction', label: 'Make an introduction', shortLabel: 'Introduction' },
  { kind: 'book-meeting', label: 'Book a meeting', shortLabel: 'Meeting' },
  { kind: 'send-quote', label: 'Send a quote', shortLabel: 'Quote' },
  { kind: 'send-sample', label: 'Send a sample', shortLabel: 'Sample' },
  { kind: 'follow-up', label: 'Follow up', shortLabel: 'Follow up' },
]

const ACTIVE_EVENT_KEY = 'followapp.active-event.v1'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CAPTURE_METHODS = new Set<EncounterCaptureMethod>([
  'card-scan',
  'qr-scan',
  'manual',
  'contact-import',
])
const NEXT_STEP_KINDS = new Set<NextStepKind>([
  ...NEXT_STEP_OPTIONS.map((option) => option.kind),
  'application',
  'custom',
])
const DISPOSITIONS = new Set<FollowUpDisposition>([
  'important',
  'later',
  'none',
])

function capped(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, max) : undefined
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

export function validDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function normalizeEvent(value: unknown): EncounterEvent | undefined {
  if (!value || typeof value !== 'object') return undefined
  const event = value as Partial<EncounterEvent>
  const id = capped(event.id, ENCOUNTER_LIMITS.eventId)
  const name = capped(event.name, ENCOUNTER_LIMITS.eventName)
  if (!id || !name) return undefined
  return {
    id,
    name,
    date: validDateOnly(event.date) ? event.date : undefined,
    location: capped(event.location, ENCOUNTER_LIMITS.location),
  }
}

function normalizeNextStep(value: unknown): EncounterNextStep | undefined {
  if (!value || typeof value !== 'object') return undefined
  const step = value as Partial<EncounterNextStep>
  if (!step.kind || !NEXT_STEP_KINDS.has(step.kind)) return undefined
  const label = capped(step.label, ENCOUNTER_LIMITS.nextStepLabel)
  const createdAt = isoTimestamp(step.createdAt)
  if (!label || !createdAt) return undefined
  const owner = step.owner === 'them' || step.owner === 'shared' ? step.owner : 'me'
  const status =
    step.status === 'done' || step.status === 'dismissed' ? step.status : 'open'
  return {
    kind: step.kind,
    label,
    owner,
    dueOn: validDateOnly(step.dueOn) ? step.dueOn : undefined,
    status,
    createdAt,
    completedAt: isoTimestamp(step.completedAt),
  }
}

/** Sanitize local, API, and database JSON through one deterministic model. */
export function normalizeEncounter(value: unknown): ContactEncounter | undefined {
  if (!value || typeof value !== 'object') return undefined
  const encounter = value as Partial<ContactEncounter>
  if (
    encounter.version !== 1 ||
    !encounter.captureMethod ||
    !CAPTURE_METHODS.has(encounter.captureMethod)
  ) {
    return undefined
  }
  const capturedAt = isoTimestamp(encounter.capturedAt)
  if (!capturedAt) return undefined
  const disposition =
    encounter.disposition && DISPOSITIONS.has(encounter.disposition)
      ? encounter.disposition
      : undefined
  return {
    version: 1,
    captureMethod: encounter.captureMethod,
    capturedAt,
    event: normalizeEvent(encounter.event),
    memorySeed: capped(encounter.memorySeed, ENCOUNTER_LIMITS.memorySeed),
    nextStep: normalizeNextStep(encounter.nextStep),
    reviewState: encounter.reviewState === 'reviewed' ? 'reviewed' : 'pending',
    disposition,
    reviewedAt: isoTimestamp(encounter.reviewedAt),
  }
}

export function normalizeEncounters(value: unknown): ContactEncounter[] {
  // Accept the short-lived single-object development shape defensively so a
  // local build made during rollout cannot strand its event notes.
  const values = Array.isArray(value) ? value : value ? [value] : []
  const normalized = values
    .map(normalizeEncounter)
    .filter((item): item is ContactEncounter => Boolean(item))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))

  // One contact represents one person at an event. Older development builds
  // could append the same strong-identifier card more than once, which made
  // the event summary say two people while the inbox showed only one. Fold
  // those rows here as well as on write so existing local/server data repairs
  // itself deterministically.
  const coalesced: ContactEncounter[] = []
  for (const encounter of normalized) {
    const eventId = encounter.event?.id
    const existingIndex = eventId
      ? coalesced.findIndex((item) => item.event?.id === eventId)
      : -1
    if (existingIndex < 0) {
      coalesced.push(encounter)
      continue
    }
    coalesced[existingIndex] = mergeSameEventEncounter(
      coalesced[existingIndex],
      encounter,
    )
  }

  return coalesced
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .slice(-ENCOUNTER_LIMITS.encounters)
}

function mergeSameEventEncounter(
  existing: ContactEncounter,
  incoming: ContactEncounter,
): ContactEncounter {
  const reviewed =
    existing.reviewState === 'reviewed' || incoming.reviewState === 'reviewed'
  const reviewedAt = [existing.reviewedAt, incoming.reviewedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  return {
    ...existing,
    ...incoming,
    event: incoming.event ?? existing.event,
    memorySeed: incoming.memorySeed ?? existing.memorySeed,
    nextStep: incoming.nextStep ?? existing.nextStep,
    reviewState: reviewed ? 'reviewed' : 'pending',
    disposition: incoming.disposition ?? existing.disposition,
    reviewedAt: reviewedAt ?? (reviewed ? incoming.capturedAt : undefined),
  }
}

export function latestEncounter(contact: Contact): ContactEncounter | undefined {
  return normalizeEncounters(contact.encounters).at(-1)
}

export function appendEncounter(
  encounters: ContactEncounter[] | undefined,
  encounter: ContactEncounter,
): ContactEncounter[] {
  const current = normalizeEncounters(encounters)
  const duplicateIndex = current.findIndex(
    (item) => {
      if (encounter.event?.id) return item.event?.id === encounter.event.id
      return (
        !item.event &&
        item.captureMethod === encounter.captureMethod &&
        Math.abs(
          new Date(item.capturedAt).getTime() -
            new Date(encounter.capturedAt).getTime(),
        ) < 2_000
      )
    },
  )
  if (duplicateIndex >= 0) {
    const next = [...current]
    next[duplicateIndex] = encounter.event?.id
      ? mergeSameEventEncounter(next[duplicateIndex], encounter)
      : encounter
    return normalizeEncounters(next)
  }
  return normalizeEncounters([...current, encounter])
}

export function createEventId(now = Date.now()): string {
  return `event-${now.toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function localDateValue(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createConferenceSession(
  name = "Today's event",
  now = new Date(),
): ConferenceSession {
  const startedAt = now.toISOString()
  return {
    id: createEventId(now.getTime()),
    name: capped(name, ENCOUNTER_LIMITS.eventName) ?? "Today's event",
    date: localDateValue(now),
    startedAt,
    active: true,
  }
}

export function loadConferenceSession(): ConferenceSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_EVENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConferenceSession>
    const event = normalizeEvent(parsed)
    const startedAt = isoTimestamp(parsed.startedAt)
    if (!event || !startedAt) return null
    return {
      ...event,
      startedAt,
      active: parsed.active === true,
      endedAt: isoTimestamp(parsed.endedAt),
    }
  } catch {
    return null
  }
}

export function saveConferenceSession(session: ConferenceSession | null): void {
  if (typeof window === 'undefined') return
  try {
    if (!session) window.localStorage.removeItem(ACTIVE_EVENT_KEY)
    else window.localStorage.setItem(ACTIVE_EVENT_KEY, JSON.stringify(session))
  } catch {
    // The contact carries its own event snapshot, so a storage failure never
    // loses a captured person; it only ends the convenience session.
  }
}

export function createEncounterCapture({
  captureMethod,
  session,
  memorySeed,
  nextStepKind,
  nextStepLabel,
  dueOn,
  now = new Date(),
}: {
  captureMethod: EncounterCaptureMethod
  session?: ConferenceSession | null
  memorySeed?: string
  nextStepKind?: NextStepKind
  nextStepLabel?: string
  dueOn?: string
  now?: Date
}): ContactEncounter {
  const timestamp = now.toISOString()
  const option = NEXT_STEP_OPTIONS.find((item) => item.kind === nextStepKind)
  const label = capped(nextStepLabel, ENCOUNTER_LIMITS.nextStepLabel) ?? option?.label
  const nextStep = nextStepKind && label
    ? {
        kind: nextStepKind,
        label,
        owner: 'me' as const,
        dueOn: validDateOnly(dueOn) ? dueOn : undefined,
        status: 'open' as const,
        createdAt: timestamp,
      }
    : undefined
  const seed = capped(memorySeed, ENCOUNTER_LIMITS.memorySeed)
  const reviewState = seed || nextStep || !session?.active ? 'reviewed' : 'pending'
  return {
    version: 1,
    captureMethod,
    capturedAt: timestamp,
    event: session?.active
      ? {
          id: session.id,
          name: session.name,
          date: session.date,
          location: session.location,
        }
      : undefined,
    memorySeed: seed,
    nextStep,
    reviewState,
    disposition: nextStep ? 'important' : undefined,
    reviewedAt: reviewState === 'reviewed' ? timestamp : undefined,
  }
}

export function contactsForEvent(contacts: Contact[], eventId: string): Contact[] {
  return contacts.filter((contact) =>
    normalizeEncounters(contact.encounters).some(
      (encounter) => encounter.event?.id === eventId,
    ),
  )
}

export function pendingEventContacts(
  contacts: Contact[],
  eventId?: string,
): Contact[] {
  return contacts.filter(
    (contact) =>
      normalizeEncounters(contact.encounters).some(
        (encounter) =>
          encounter.reviewState === 'pending' &&
          (!eventId || encounter.event?.id === eventId),
      ),
  )
}

export interface EncounterEventSummary {
  event: EncounterEvent
  count: number
  pending: number
  clearNextSteps: number
  latestCaptureAt: string
}

export function eventGroupsFromContacts(
  contacts: Contact[],
): EncounterEventSummary[] {
  const groups = new Map<string, EncounterEventSummary>()
  for (const contact of contacts) {
    for (const encounter of normalizeEncounters(contact.encounters)) {
      const event = encounter.event
      if (!event) continue
      const existing = groups.get(event.id)
      const nextStep = encounter.nextStep?.status === 'open' ? 1 : 0
      if (!existing) {
        groups.set(event.id, {
          event,
          count: 1,
          pending: encounter.reviewState === 'pending' ? 1 : 0,
          clearNextSteps: nextStep,
          latestCaptureAt: encounter.capturedAt,
        })
        continue
      }
      existing.count += 1
      if (encounter.reviewState === 'pending') existing.pending += 1
      existing.clearNextSteps += nextStep
      if (encounter.capturedAt > existing.latestCaptureAt) {
        existing.latestCaptureAt = encounter.capturedAt
        // A rename affects new captures; the latest snapshot is the least stale.
        existing.event = event
      }
    }
  }
  return [...groups.values()].sort((a, b) =>
    b.latestCaptureAt.localeCompare(a.latestCaptureAt),
  )
}

export function reviewEncounter(
  encounter: ContactEncounter,
  updates: {
    memorySeed?: string
    nextStepKind?: NextStepKind
    nextStepLabel?: string
    dueOn?: string
    disposition: FollowUpDisposition
  },
  now = new Date(),
): ContactEncounter {
  const timestamp = now.toISOString()
  const option = NEXT_STEP_OPTIONS.find((item) => item.kind === updates.nextStepKind)
  const existing = encounter.nextStep
  const label =
    capped(updates.nextStepLabel, ENCOUNTER_LIMITS.nextStepLabel) ??
    (existing && existing.kind === updates.nextStepKind
      ? existing.label
      : option?.label)
  const dueOn = validDateOnly(updates.dueOn) ? updates.dueOn : undefined
  const preservesCompletedStep =
    existing?.status === 'done' &&
    existing.kind === updates.nextStepKind &&
    existing.label === label &&
    existing.dueOn === dueOn
  const nextStep = updates.disposition === 'none'
    ? existing
      ? existing.status === 'open'
        ? { ...existing, status: 'dismissed' as const }
        : existing
      : undefined
    : updates.nextStepKind && label
      ? preservesCompletedStep
        ? existing
        : {
          kind: updates.nextStepKind,
          label,
          owner: existing?.owner ?? ('me' as const),
          dueOn,
          status: 'open' as const,
          createdAt:
            existing?.kind === updates.nextStepKind
              ? existing.createdAt
              : timestamp,
          }
      : undefined
  return {
    ...encounter,
    // Empty is an intentional edit: users must be able to forget a clue.
    memorySeed: capped(updates.memorySeed, ENCOUNTER_LIMITS.memorySeed),
    nextStep,
    reviewState: 'reviewed',
    disposition: updates.disposition,
    reviewedAt: timestamp,
  }
}

/** Complete only the exact, user-confirmed open loop the UI is showing. */
export function completeEncounterNextStep(
  encounters: ContactEncounter[] | undefined,
  target: { capturedAt: string; eventId?: string },
  now = new Date(),
): ContactEncounter[] {
  const normalized = normalizeEncounters(encounters)
  const index = normalized.findIndex(
    (encounter) =>
      encounter.capturedAt === target.capturedAt &&
      encounter.event?.id === target.eventId &&
      encounter.nextStep?.status === 'open',
  )
  if (index < 0) return normalized

  const timestamp = now.toISOString()
  const next = [...normalized]
  const encounter = next[index]
  next[index] = {
    ...encounter,
    nextStep: encounter.nextStep
      ? {
          ...encounter.nextStep,
          status: 'done',
          completedAt: timestamp,
        }
      : undefined,
    reviewState: 'reviewed',
    reviewedAt: timestamp,
  }
  return normalizeEncounters(next)
}

/** Keep every stored snapshot of a renamed event consistent across contacts. */
export function updateEncounterEventDetails(
  encounters: ContactEncounter[] | undefined,
  event: EncounterEvent,
): ContactEncounter[] {
  return normalizeEncounters(encounters).map((encounter) =>
    encounter.event?.id === event.id
      ? {
          ...encounter,
          event: {
            id: event.id,
            name: capped(event.name, ENCOUNTER_LIMITS.eventName) ?? encounter.event.name,
            date: validDateOnly(event.date) ? event.date : encounter.event.date,
            location: capped(event.location, ENCOUNTER_LIMITS.location),
          },
        }
      : encounter,
  )
}

export function normalizedPhone(value?: string): string {
  return value?.replace(/\D/g, '') ?? ''
}

/** Match only strong identifiers; never merge two people just because names match. */
export function findStrongContactMatch(
  contacts: Contact[],
  candidate: { email?: string; phone?: string },
): Contact | undefined {
  const email = isDeliverableEmail(candidate.email)
    ? candidate.email!.trim().toLowerCase()
    : undefined
  const phone = normalizedPhone(candidate.phone)
  const emailMatches = email
    ? contacts.filter(
        (contact) =>
          isDeliverableEmail(contact.email) &&
          contact.email!.trim().toLowerCase() === email,
      )
    : []
  const phoneMatches = phone.length >= 8
    ? contacts.filter((contact) => normalizedPhone(contact.phone) === phone)
    : []
  // Existing duplicate identifiers are ambiguous. Never pick whichever row
  // happens to appear first in a conference batch.
  if (emailMatches.length > 1 || phoneMatches.length > 1) return undefined
  const emailMatch = emailMatches[0]
  const phoneMatch = phoneMatches[0]
  // Conflicting strong identifiers are an ambiguity, never an auto-merge.
  if (emailMatch && phoneMatch && emailMatch.id !== phoneMatch.id) return undefined
  if (phoneMatch && email && !emailMatch && isDeliverableEmail(phoneMatch.email)) {
    const matchedEmail = phoneMatch.email!.trim().toLowerCase()
    if (matchedEmail !== email) return undefined
  }
  return emailMatch ?? phoneMatch
}

export function actionEncounter(
  contact: Contact,
  today = localDateValue(),
): ContactEncounter | undefined {
  return normalizeEncounters(contact.encounters)
    .map((encounter) => ({ encounter, score: encounterScore(encounter, today) }))
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.encounter.capturedAt.localeCompare(a.encounter.capturedAt),
    )[0]?.encounter
}

export function encounterWhyNow(contact: Contact, today = localDateValue()): string | null {
  const encounter = actionEncounter(contact, today)
  if (!encounter || encounterScore(encounter, today) <= 0) return null
  const step = encounter.nextStep
  if (step?.status === 'open') {
    if (step.dueOn && step.dueOn <= today) return `You planned to ${step.label.toLowerCase()} by today.`
    if (step.dueOn) return `${step.label} is planned for ${step.dueOn}.`
    return `You left ${encounter.event?.name ?? 'the meeting'} planning to ${step.label.toLowerCase()}.`
  }
  if (encounter.reviewState === 'pending') {
    return `Add one clue from ${encounter.event?.name ?? 'where you met'} before following up.`
  }
  return encounter.memorySeed
    ? `${encounter.event?.name ?? 'Your memory clue'}: ${encounter.memorySeed.slice(0, 140)}`
    : null
}

function encounterScore(
  encounter: ContactEncounter,
  today: string,
): number {
  if (encounter.disposition === 'later') return 0
  const step = encounter.nextStep
  if (step?.status === 'open') {
    if (step.dueOn && step.dueOn <= today) return 2_000
    if (!step.dueOn) return 1_000
    // A future promise remains visible in context but should not displace a
    // relationship that genuinely needs action today.
    return 0
  }
  if (encounter.disposition === 'important') return 400
  return 0
}

export function hasActionableCommitment(
  contact: Contact,
  today = localDateValue(),
): boolean {
  return normalizeEncounters(contact.encounters).some((encounter) => {
    const step = encounter.nextStep
    return (
      encounter.disposition !== 'later' &&
      step?.status === 'open' &&
      (!step.dueOn || step.dueOn <= today)
    )
  })
}

export function isPendingEncounterOnly(contact: Contact): boolean {
  const encounters = normalizeEncounters(contact.encounters)
  const latest = encounters.at(-1)
  return (
    latest?.reviewState === 'pending' &&
    !encounters.some((encounter) => encounter.nextStep?.status === 'open')
  )
}

export function isFollowUpSuppressed(contact: Contact): boolean {
  const encounters = normalizeEncounters(contact.encounters)
  const latest = encounters.at(-1)
  return (
    latest?.disposition === 'none' &&
    !encounters.some((encounter) => encounter.nextStep?.status === 'open')
  )
}

/** An explicit future promise or "Later" choice beats generic cadence debt. */
export function isFollowUpDeferred(
  contact: Contact,
  today = localDateValue(),
): boolean {
  const encounters = normalizeEncounters(contact.encounters)
  if (hasActionableCommitment(contact, today)) return false
  if (
    encounters.some(
      (encounter) =>
        encounter.nextStep?.status === 'open' &&
        Boolean(encounter.nextStep.dueOn) &&
        encounter.nextStep.dueOn! > today,
    )
  ) {
    return true
  }
  const latest = encounters.at(-1)
  return (
    latest?.reviewState === 'reviewed' && latest.disposition === 'later'
  )
}

/** Transparent promise-first score; fixed cadence remains a fallback only. */
export function conferencePriorityScore(
  contact: Contact,
  today = localDateValue(),
): number {
  const encounters = normalizeEncounters(contact.encounters)
  if (encounters.length === 0) return 0
  return encounters.reduce(
    (best, encounter) => Math.max(best, encounterScore(encounter, today)),
    0,
  )
}
