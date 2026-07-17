import assert from 'node:assert/strict'
import test from 'node:test'
import {
  confirmedOutreachCount,
  INVITE_AFTER_CONFIRMED_OUTREACH,
} from '../lib/invite-policy.ts'
import type { Contact, Message } from '../lib/types.ts'

function contact(id: string, messages: Message[]): Contact {
  return {
    id,
    name: `Person ${id}`,
    relationship: 'Friend',
    tier: 'network',
    avatarHue: 'coral',
    daysSinceContact: 0,
    lastContactedAt: null,
    context: '',
    interests: [],
    messages,
  }
}

test('deferred invite waits for three confirmed external handoffs', () => {
  assert.equal(INVITE_AFTER_CONFIRMED_OUTREACH, 3)
  assert.equal(
    confirmedOutreachCount([
      contact('one', [
        {
          id: 'draft-only',
          sender: 'me',
          text: 'Not confirmed',
          minutesAgo: 0,
        },
        {
          id: 'confirmed-one',
          sender: 'me',
          text: 'Sent',
          minutesAgo: 0,
          sentAt: '2026-07-17T09:00:00.000Z',
          channel: 'whatsapp',
        },
      ]),
      contact('two', [
        {
          id: 'confirmed-two',
          sender: 'me',
          text: 'Sent by email',
          minutesAgo: 0,
          sentAt: '2026-07-17T10:00:00.000Z',
          channel: 'email',
        },
        {
          id: 'incoming',
          sender: 'them',
          text: 'Hello',
          minutesAgo: 0,
          sentAt: '2026-07-17T10:01:00.000Z',
          channel: 'email',
        },
      ]),
    ]),
    2,
  )
})

test('deferred invite does not double-count a persisted confirmation id', () => {
  const message: Message = {
    id: 'same-confirmation',
    sender: 'me',
    text: 'Sent',
    minutesAgo: 0,
    sentAt: '2026-07-17T09:00:00.000Z',
    channel: 'whatsapp',
  }
  assert.equal(
    confirmedOutreachCount([
      contact('one', [message]),
      contact('two', [{ ...message, text: 'duplicate copy' }]),
    ]),
    1,
  )
})
