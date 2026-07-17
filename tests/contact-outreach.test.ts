import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendMessageOnce,
  confirmedOutreachDate,
} from '../lib/contact-outreach.ts'
import type { Message } from '../lib/types.ts'

const confirmed: Message = {
  id: 'outreach-stable-id',
  sender: 'me',
  text: 'Great speaking with you.',
  minutesAgo: 0,
  sentAt: '2026-07-17T08:00:00.000Z',
  channel: 'email',
}

test('confirmed outreach ids append once and duplicates preserve original data', () => {
  const first = appendMessageOnce([], confirmed)
  assert.equal(first.inserted, true)
  assert.deepEqual(first.messages, [confirmed])

  const replayWithChangedTimestamp: Message = {
    ...confirmed,
    sentAt: '2026-07-18T08:00:00.000Z',
  }
  const duplicate = appendMessageOnce(first.messages, replayWithChangedTimestamp)
  assert.equal(duplicate.inserted, false)
  assert.strictEqual(duplicate.messages, first.messages)
  assert.equal(duplicate.messages[0].sentAt, confirmed.sentAt)
})

test('confirmed outreach history remains bounded', () => {
  const previous = Array.from({ length: 100 }, (_, index): Message => ({
    ...confirmed,
    id: `outreach-${index}`,
  }))
  const next = appendMessageOnce(previous, { ...confirmed, id: 'outreach-new' })

  assert.equal(next.inserted, true)
  assert.equal(next.messages.length, 100)
  assert.equal(next.messages[0].id, 'outreach-1')
  assert.equal(next.messages.at(-1)?.id, 'outreach-new')
})

test('the explicit sender-local date wins with a sentAt fallback for old data', () => {
  assert.equal(
    confirmedOutreachDate({
      sentAt: '2026-07-18T00:30:00.000Z',
      sentOn: '2026-07-17',
    }),
    '2026-07-17',
  )
  assert.equal(
    confirmedOutreachDate({ sentAt: '2026-07-18T08:00:00.000Z' }),
    '2026-07-18',
  )
})
