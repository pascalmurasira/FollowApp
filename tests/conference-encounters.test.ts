import assert from 'node:assert/strict'
import test from 'node:test'
import {
  actionEncounter,
  appendEncounter,
  completeEncounterNextStep,
  conferencePriorityScore,
  createConferenceSession,
  createEncounterCapture,
  eventActionStack,
  findStrongContactMatch,
  hasActionableCommitment,
  isFollowUpSuppressed,
  isFollowUpDeferred,
  isPendingEncounterOnly,
  peopleGroupsByLatestEvent,
  reviewEncounter,
  updateEncounterEventDetails,
} from '../lib/encounters.ts'
import { ENCOUNTER_LIMITS } from '../lib/persistence-limits.ts'
import {
  contactInputSchema,
  contactUpdateInputSchema,
  encounterInputSchema,
} from '../lib/server/input-schemas.ts'
import type { Contact, ContactEncounter } from '../lib/types.ts'

const EVENT_A = {
  id: 'event-a',
  name: 'Future of Food Expo',
  date: '2026-07-18',
  location: 'Amsterdam RAI',
}

const EVENT_B = {
  id: 'event-b',
  name: 'Climate Founders Summit',
  date: '2026-08-04',
}

function makeEncounter(
  overrides: Partial<ContactEncounter> = {},
): ContactEncounter {
  return {
    version: 1,
    captureMethod: 'card-scan',
    capturedAt: '2026-07-18T09:00:00.000Z',
    event: EVENT_A,
    reviewState: 'reviewed',
    reviewedAt: '2026-07-18T09:01:00.000Z',
    ...overrides,
  }
}

function makeContact(
  id: string,
  overrides: Partial<Contact> = {},
): Contact {
  return {
    id,
    name: `Contact ${id}`,
    relationship: '',
    avatarHue: 'coral',
    daysSinceContact: 0,
    context: '',
    interests: [],
    messages: [],
    ...overrides,
  }
}

test('repeated capture of one contact at one event coalesces to one encounter', () => {
  const first = makeEncounter({ memorySeed: 'Met beside the investor lounge.' })
  const repeated = makeEncounter({
    captureMethod: 'qr-scan',
    capturedAt: '2026-07-18T13:45:00.000Z',
    memorySeed: 'Discussed their Benelux retail launch.',
  })

  const encounters = appendEncounter([first], repeated)

  assert.equal(encounters.length, 1)
  assert.equal(encounters[0]?.event?.id, EVENT_A.id)
  assert.equal(encounters[0]?.capturedAt, repeated.capturedAt)
  assert.equal(encounters[0]?.memorySeed, repeated.memorySeed)
})

test('capturing the same contact at a later event preserves cross-event history', () => {
  const first = makeEncounter({ memorySeed: 'Talked about pilot partners.' })
  const later = makeEncounter({
    capturedAt: '2026-08-04T15:30:00.000Z',
    event: EVENT_B,
    memorySeed: 'Reconnected after their pilot launched.',
  })

  const encounters = appendEncounter([first], later)

  assert.deepEqual(
    encounters.map((encounter) => encounter.event?.id),
    [EVENT_A.id, EVENT_B.id],
  )
  assert.deepEqual(
    encounters.map((encounter) => encounter.memorySeed),
    [first.memorySeed, later.memorySeed],
  )
})

test('editing an event updates only matching encounter snapshots', () => {
  const updated = updateEncounterEventDetails(
    [
      makeEncounter(),
      makeEncounter({
        capturedAt: '2026-08-04T15:30:00.000Z',
        event: EVENT_B,
      }),
    ],
    {
      ...EVENT_A,
      name: 'Future Food Amsterdam',
      location: 'Beurs van Berlage',
    },
  )

  assert.equal(updated[0]?.event?.name, 'Future Food Amsterdam')
  assert.equal(updated[0]?.event?.location, 'Beurs van Berlage')
  assert.equal(updated[1]?.event?.name, EVENT_B.name)
})

test('strong duplicate matching uses email or phone and refuses ambiguity', () => {
  const byEmail = makeContact('email', {
    email: 'Ada@Example.com',
    phone: '+31 6 1111 1111',
  })
  const byPhone = makeContact('phone', {
    email: 'grace@example.com',
    phone: '+31 (0)6 2222 2222',
  })
  const contacts = [byEmail, byPhone]

  assert.equal(
    findStrongContactMatch(contacts, { email: '  ada@example.com ' })?.id,
    byEmail.id,
  )
  assert.equal(
    findStrongContactMatch(contacts, { phone: '+31 06 22 22 22 22' })?.id,
    byPhone.id,
  )
  assert.equal(
    findStrongContactMatch(contacts, {
      email: byEmail.email,
      phone: byPhone.phone,
    }),
    undefined,
  )
  assert.equal(
    findStrongContactMatch(contacts, { phone: '2222' }),
    undefined,
  )

  const sharedOffice = makeContact('shared-office', {
    email: 'alex@example.com',
    phone: '+31 20 555 0100',
  })
  assert.equal(
    findStrongContactMatch([sharedOffice], {
      email: 'sam@example.com',
      phone: '+31 20 555 0100',
    }),
    undefined,
  )

  const duplicatePhone = makeContact('duplicate-phone', {
    phone: sharedOffice.phone,
  })
  assert.equal(
    findStrongContactMatch([sharedOffice, duplicatePhone], {
      phone: sharedOffice.phone,
    }),
    undefined,
  )
})

test('event captures stay pending until reviewed and no-follow-up dismisses a promise', () => {
  const session = createConferenceSession(
    EVENT_A.name,
    new Date('2026-07-18T08:00:00.000Z'),
  )
  const pending = createEncounterCapture({
    captureMethod: 'card-scan',
    session,
    now: new Date('2026-07-18T09:00:00.000Z'),
  })

  assert.equal(pending.reviewState, 'pending')
  assert.equal(pending.reviewedAt, undefined)
  assert.equal(pending.event?.id, session.id)

  const promised = createEncounterCapture({
    captureMethod: 'card-scan',
    session,
    memorySeed: 'Interested in the distribution partnership.',
    nextStepKind: 'send-deck',
    dueOn: '2026-07-19',
    now: new Date('2026-07-18T09:05:00.000Z'),
  })
  const dismissed = reviewEncounter(
    promised,
    { disposition: 'none' },
    new Date('2026-07-18T17:00:00.000Z'),
  )

  assert.equal(dismissed.reviewState, 'reviewed')
  assert.equal(dismissed.disposition, 'none')
  assert.equal(dismissed.nextStep?.status, 'dismissed')
  assert.equal(dismissed.reviewedAt, '2026-07-18T17:00:00.000Z')
})

test('event action stack gives every person one promise-first bucket', () => {
  const promise = makeContact('promise', {
    encounters: [
      makeEncounter({
        nextStep: {
          kind: 'send-deck',
          label: 'Send the deck',
          owner: 'me',
          dueOn: '2026-07-19',
          status: 'open',
          createdAt: '2026-07-18T09:00:00.000Z',
        },
        disposition: 'important',
      }),
    ],
  })
  const warm = makeContact('warm', {
    encounters: [makeEncounter({ memorySeed: 'Asked about the Kigali launch.' })],
  })
  const later = makeContact('later', {
    encounters: [makeEncounter({ disposition: 'later' })],
  })
  const pending = makeContact('pending', {
    encounters: [makeEncounter({ reviewState: 'pending', reviewedAt: undefined })],
  })
  const otherEvent = makeContact('other-event', {
    encounters: [makeEncounter({ event: EVENT_B })],
  })

  const stack = eventActionStack(
    [later, otherEvent, warm, pending, promise],
    EVENT_A.id,
  )

  assert.deepEqual(stack.promises.map((contact) => contact.id), ['promise'])
  assert.deepEqual(stack.warmFollowUps.map((contact) => contact.id), ['warm'])
  assert.deepEqual(
    stack.savedForLater.map((contact) => contact.id),
    ['later', 'pending'],
  )
})

test('people groups use the latest event while preserving ungrouped people', () => {
  const crossEvent = makeContact('cross-event', {
    name: 'Ada Lovelace',
    encounters: [
      makeEncounter(),
      makeEncounter({
        event: EVENT_B,
        capturedAt: '2026-08-04T15:30:00.000Z',
      }),
    ],
  })
  const firstEvent = makeContact('first-event', {
    name: 'Grace Hopper',
    encounters: [makeEncounter()],
  })
  const ungrouped = makeContact('ungrouped', { name: 'Lin Chen' })

  const groups = peopleGroupsByLatestEvent([ungrouped, firstEvent, crossEvent])

  assert.deepEqual(groups.events.map((group) => group.id), [EVENT_B.id, EVENT_A.id])
  assert.deepEqual(groups.events[0]?.contacts.map((contact) => contact.id), [
    'cross-event',
  ])
  assert.deepEqual(groups.other.map((contact) => contact.id), ['ungrouped'])
})

test('due commitments outrank future promises and cadence-only contacts', () => {
  const due = makeContact('due', {
    encounters: [
      makeEncounter({
        nextStep: {
          kind: 'send-deck',
          label: 'Send the deck',
          owner: 'me',
          dueOn: '2026-07-18',
          status: 'open',
          createdAt: '2026-07-17T16:00:00.000Z',
        },
        disposition: 'important',
      }),
    ],
  })
  const future = makeContact('future', {
    encounters: [
      makeEncounter({
        nextStep: {
          kind: 'book-meeting',
          label: 'Book a meeting',
          owner: 'me',
          dueOn: '2026-07-30',
          status: 'open',
          createdAt: '2026-07-18T10:00:00.000Z',
        },
        disposition: 'important',
      }),
    ],
  })
  const legacy = makeContact('legacy', { daysSinceContact: 365 })

  assert.ok(
    conferencePriorityScore(due, '2026-07-18') >
      conferencePriorityScore(future, '2026-07-18'),
  )
  assert.equal(conferencePriorityScore(future, '2026-07-18'), 0)
  assert.equal(conferencePriorityScore(legacy, '2026-07-18'), 0)
  assert.equal(isFollowUpDeferred(future, '2026-07-18'), true)
  assert.equal(isFollowUpDeferred(due, '2026-07-18'), false)
})

test('action context prefers the newest equal priority and excludes deferred work', () => {
  const older = makeEncounter({
    capturedAt: '2026-07-18T09:00:00.000Z',
    memorySeed: 'Older memory',
    disposition: 'important',
  })
  const newer = makeEncounter({
    capturedAt: '2026-08-04T15:00:00.000Z',
    event: EVENT_B,
    memorySeed: 'Newest memory',
    disposition: 'important',
  })
  assert.equal(
    actionEncounter(makeContact('recency', { encounters: [older, newer] }))
      ?.capturedAt,
    newer.capturedAt,
  )

  const deferred = makeEncounter({
    disposition: 'later',
    nextStep: {
      kind: 'send-deck',
      label: 'Send the deck',
      owner: 'me',
      status: 'open',
      createdAt: '2026-07-18T09:00:00.000Z',
    },
  })
  assert.equal(
    actionEncounter(makeContact('deferred', { encounters: [deferred] })),
    undefined,
  )
})

test('later review defers generic cadence until the user chooses a new plan', () => {
  const contact = makeContact('later', {
    daysSinceContact: 365,
    encounters: [
      makeEncounter({
        disposition: 'later',
        nextStep: {
          kind: 'send-deck',
          label: 'Send the deck',
          owner: 'me',
          status: 'open',
          createdAt: '2026-07-18T09:00:00.000Z',
        },
      }),
    ],
  })

  assert.equal(isFollowUpDeferred(contact, '2026-07-18'), true)
  assert.equal(hasActionableCommitment(contact, '2026-07-18'), false)
  assert.equal(conferencePriorityScore(contact, '2026-07-18'), 0)
})

test('a user-confirmed completion closes only the selected open promise', () => {
  const promise = makeEncounter({
    nextStep: {
      kind: 'send-deck',
      label: 'Send the deck',
      owner: 'me',
      status: 'open',
      createdAt: '2026-07-18T09:00:00.000Z',
    },
    disposition: 'important',
  })
  const encounters = completeEncounterNextStep(
    [promise],
    { capturedAt: promise.capturedAt, eventId: promise.event?.id },
    new Date('2026-07-18T12:00:00.000Z'),
  )

  assert.equal(encounters[0]?.nextStep?.status, 'done')
  assert.equal(
    encounters[0]?.nextStep?.completedAt,
    '2026-07-18T12:00:00.000Z',
  )
  assert.equal(hasActionableCommitment(makeContact('done', { encounters })), false)
})

test('reviewing a completed promise does not silently reopen it', () => {
  const promise = makeEncounter({
    nextStep: {
      kind: 'send-deck',
      label: 'Send the deck',
      owner: 'me',
      status: 'done',
      createdAt: '2026-07-18T09:00:00.000Z',
      completedAt: '2026-07-18T12:00:00.000Z',
    },
    disposition: 'important',
  })

  const unchanged = reviewEncounter(
    promise,
    { nextStepKind: 'send-deck', disposition: 'important' },
    new Date('2026-07-19T09:00:00.000Z'),
  )
  assert.equal(unchanged.nextStep?.status, 'done')
  assert.equal(unchanged.nextStep?.completedAt, '2026-07-18T12:00:00.000Z')

  const deliberatelyChanged = reviewEncounter(
    unchanged,
    {
      nextStepKind: 'send-deck',
      dueOn: '2026-07-30',
      disposition: 'important',
    },
    new Date('2026-07-19T09:05:00.000Z'),
  )
  assert.equal(deliberatelyChanged.nextStep?.status, 'open')
  assert.equal(deliberatelyChanged.nextStep?.completedAt, undefined)
})

test('an older open promise survives a newer pending or no-follow-up encounter', () => {
  const olderPromise = makeEncounter({
    capturedAt: '2026-07-18T09:00:00.000Z',
    nextStep: {
      kind: 'make-introduction',
      label: 'Make an introduction',
      owner: 'me',
      dueOn: '2026-07-18',
      status: 'open',
      createdAt: '2026-07-18T09:00:00.000Z',
    },
    disposition: 'important',
  })
  const newerPending = makeEncounter({
    capturedAt: '2026-08-04T15:00:00.000Z',
    event: EVENT_B,
    reviewState: 'pending',
    reviewedAt: undefined,
  })
  const withPending = makeContact('history', {
    encounters: [olderPromise, newerPending],
  })

  assert.equal(actionEncounter(withPending, '2026-08-04')?.capturedAt, olderPromise.capturedAt)
  assert.equal(hasActionableCommitment(withPending, '2026-08-04'), true)
  assert.equal(isPendingEncounterOnly(withPending), false)

  const withNoFollowUp = makeContact('history-none', {
    encounters: [
      olderPromise,
      reviewEncounter(
        newerPending,
        { disposition: 'none' },
        new Date('2026-08-04T18:00:00.000Z'),
      ),
    ],
  })
  assert.equal(isFollowUpSuppressed(withNoFollowUp), false)
  assert.ok(conferencePriorityScore(withNoFollowUp, '2026-08-04') > 0)
})

function validEncounterInput() {
  return {
    version: 1,
    captureMethod: 'card-scan',
    capturedAt: '2026-07-18T09:00:00.000Z',
    event: EVENT_A,
    memorySeed: 'Met after the supply-chain panel.',
    nextStep: {
      kind: 'send-deck',
      label: 'Send the deck',
      owner: 'me',
      dueOn: '2026-07-19',
      status: 'open',
      createdAt: '2026-07-18T09:00:00.000Z',
    },
    reviewState: 'reviewed',
    disposition: 'important',
    reviewedAt: '2026-07-18T09:01:00.000Z',
  }
}

test('encounter API schema accepts a complete valid encounter', () => {
  assert.equal(encounterInputSchema.safeParse(validEncounterInput()).success, true)
  assert.equal(
    contactInputSchema.safeParse({
      id: 'contact-1',
      name: 'Ada Lovelace',
      encounters: [validEncounterInput()],
    }).success,
    true,
  )
})

test('encounter API schema rejects invalid dates, bounds, and enums', () => {
  const base = validEncounterInput()
  const invalidInputs: unknown[] = [
    { ...base, capturedAt: 'yesterday' },
    { ...base, captureMethod: 'badge-scan' },
    { ...base, reviewState: 'unreviewed' },
    { ...base, disposition: 'maybe' },
    { ...base, memorySeed: 'x'.repeat(ENCOUNTER_LIMITS.memorySeed + 1) },
    { ...base, event: { ...base.event, date: '2026-02-30' } },
    {
      ...base,
      event: {
        ...base.event,
        name: 'x'.repeat(ENCOUNTER_LIMITS.eventName + 1),
      },
    },
    { ...base, nextStep: { ...base.nextStep, kind: 'send-spam' } },
    { ...base, nextStep: { ...base.nextStep, owner: 'nobody' } },
    { ...base, nextStep: { ...base.nextStep, status: 'forgotten' } },
    { ...base, nextStep: { ...base.nextStep, dueOn: '2026-13-01' } },
    {
      ...base,
      nextStep: {
        ...base.nextStep,
        label: 'x'.repeat(ENCOUNTER_LIMITS.nextStepLabel + 1),
      },
    },
  ]

  for (const input of invalidInputs) {
    assert.equal(encounterInputSchema.safeParse(input).success, false)
  }
})

test('contact schemas enforce the encounter history bound and allow explicit clearing', () => {
  const tooMany = Array.from(
    { length: ENCOUNTER_LIMITS.encounters + 1 },
    () => validEncounterInput(),
  )

  assert.equal(
    contactInputSchema.safeParse({
      id: 'contact-1',
      name: 'Ada Lovelace',
      encounters: tooMany,
    }).success,
    false,
  )
  assert.equal(
    contactUpdateInputSchema.safeParse({ encounters: tooMany }).success,
    false,
  )
  assert.equal(
    contactUpdateInputSchema.safeParse({ encounters: null }).success,
    true,
  )
})
