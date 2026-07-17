import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contactInputSchema,
  contactUpdateInputSchema,
  confirmedOutreachInputSchema,
  profileInputSchema,
} from '../lib/server/input-schemas.ts'

test('persistence schemas reject nulls and wrong primitive field types', () => {
  assert.equal(profileInputSchema.safeParse(null).success, false)
  assert.equal(
    profileInputSchema.safeParse({ name: 42 }).success,
    false,
  )
  assert.equal(
    contactInputSchema.safeParse({ id: 'one', name: 'Ada', context: 7 })
      .success,
    false,
  )
  assert.equal(
    contactUpdateInputSchema.safeParse({ interests: ['valid', 3] }).success,
    false,
  )
})

test('confirmed outreach requires a timestamp and explicit channel', () => {
  const base = {
    id: 'outreach-1',
    sender: 'me' as const,
    text: 'Great meeting you.',
    minutesAgo: 0,
  }
  assert.equal(confirmedOutreachInputSchema.safeParse(base).success, false)
  assert.equal(
    confirmedOutreachInputSchema.safeParse({
      ...base,
      sentAt: '2026-07-17T18:00:00.000Z',
      sentOn: '2026-07-17',
      channel: 'whatsapp',
    }).success,
    true,
  )
  assert.equal(
    confirmedOutreachInputSchema.safeParse({
      ...base,
      sentAt: '2026-07-17T18:00:00.000Z',
      sentOn: '2026-02-31',
      channel: 'whatsapp',
    }).success,
    false,
  )
})

test('contact schema supplies safe defaults for minimal imports', () => {
  const parsed = contactInputSchema.safeParse({ id: 'one', name: 'Ada' })
  assert.equal(parsed.success, true)
  if (!parsed.success) return
  assert.equal(parsed.data.relationship, '')
  assert.equal(parsed.data.avatarHue, 'coral')
  assert.deepEqual(parsed.data.interests, [])
})

test('contact cadence dates reject malformed calendar values', () => {
  for (const lastContactedAt of ['not-a-date', '2026-02-30', '2026-2-03']) {
    assert.equal(
      contactInputSchema.safeParse({
        id: 'contact-1',
        name: 'Maya Chen',
        lastContactedAt,
      }).success,
      false,
    )
    assert.equal(
      contactUpdateInputSchema.safeParse({ lastContactedAt }).success,
      false,
    )
  }
})
