import assert from 'node:assert/strict'
import test from 'node:test'

import {
  shouldDeliverSystemEntry,
  systemEntryAction,
} from '../lib/system-entry.ts'

test('native system entry points map to content-free app actions', () => {
  assert.equal(systemEntryAction('followapp://scan'), 'scan-card')
  assert.equal(systemEntryAction('followapp://my-qr'), 'show-my-qr')
  assert.equal(systemEntryAction('followapp://event'), 'open-event')
})

test('owned universal links support the same entry points', () => {
  assert.equal(systemEntryAction('https://followapp.chat/app/scan'), 'scan-card')
  assert.equal(
    systemEntryAction('https://followapp.chat/app/my-qr'),
    'show-my-qr',
  )
  assert.equal(
    systemEntryAction('https://followapp.chat/app/conference'),
    'open-event',
  )
})

test('lookalike, credentialed, and content-bearing routes fail closed', () => {
  assert.equal(systemEntryAction('https://followapp.chat.evil.test/app/scan'), null)
  assert.equal(systemEntryAction('https://user@followapp.chat/app/scan'), null)
  assert.equal(systemEntryAction('http://followapp.chat/app/scan'), null)
  assert.equal(systemEntryAction('followapp://contact/secret-id'), null)
  assert.equal(systemEntryAction('followapp://scan?token=secret'), null)
  assert.equal(systemEntryAction('https://followapp.chat/app/scan#payload'), null)
  assert.equal(systemEntryAction('not a url'), null)
})

test('duplicate native launch callbacks collapse without blocking later actions', () => {
  const first = { action: 'scan-card' as const, deliveredAt: 10_000 }

  assert.equal(shouldDeliverSystemEntry(first, 'scan-card', 10_250), false)
  assert.equal(shouldDeliverSystemEntry(first, 'show-my-qr', 10_250), true)
  assert.equal(shouldDeliverSystemEntry(first, 'scan-card', 11_500), true)
})
