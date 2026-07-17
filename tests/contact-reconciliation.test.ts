import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergeReimportedContact,
  reconcilePeopleSnapshot,
} from '../lib/contact-reconciliation.ts'
import type { Contact } from '../lib/types.ts'

function contact(id: string, overrides: Partial<Contact> = {}): Contact {
  return {
    id,
    name: id,
    relationship: 'Known through work',
    avatarHue: 'coral',
    daysSinceContact: 3,
    lastContactedAt: '2026-07-14',
    context: '',
    interests: [],
    messages: [],
    ...overrides,
  }
}

test('a successful fetch removes settled local contacts and circles', () => {
  const result = reconcilePeopleSnapshot(
    { contacts: [contact('server')], circles: { server: ['Clients'] } },
    {
      contacts: [contact('server', { name: 'Stale' }), contact('deleted')],
      circles: { server: ['Stale circle'], deleted: ['Friends'] },
    },
    [],
  )

  assert.deepEqual(result, {
    contacts: [contact('server')],
    circles: { server: ['Clients'] },
  })
})

test('only fields backed by pending local operations survive reconciliation', () => {
  const server = contact('one', {
    name: 'Server name',
    lastContactedAt: '2026-07-01',
    daysSinceContact: 16,
    messages: [{ id: 'server-message', sender: 'me', text: 'Sent', minutesAgo: 1 }],
  })
  const local = contact('one', {
    name: 'Local edit',
    lastContactedAt: '2026-07-17',
    daysSinceContact: 0,
    messages: [{ id: 'local-message', sender: 'me', text: 'Pending', minutesAgo: 0 }],
  })

  const touched = reconcilePeopleSnapshot(
    { contacts: [server], circles: { one: ['Server'] } },
    { contacts: [local], circles: { one: ['Local'] } },
    [{ kind: 'touch', contactId: 'one' }],
  )
  assert.equal(touched.contacts[0].name, 'Server name')
  assert.equal(touched.contacts[0].lastContactedAt, '2026-07-17')
  assert.deepEqual(touched.contacts[0].messages, server.messages)
  assert.deepEqual(touched.circles, { one: ['Server'] })

  const outreachAndCircle = reconcilePeopleSnapshot(
    { contacts: [server], circles: { one: ['Server'] } },
    { contacts: [local], circles: { one: ['Local'] } },
    [
      { kind: 'outreach', contactId: 'one' },
      { kind: 'circle', contactId: 'one' },
    ],
  )
  assert.equal(outreachAndCircle.contacts[0].name, 'Server name')
  assert.deepEqual(outreachAndCircle.contacts[0].messages, local.messages)
  assert.deepEqual(outreachAndCircle.circles, { one: ['Local'] })
})

test('pending deletes win and pending missing writes remain available to retry', () => {
  const result = reconcilePeopleSnapshot(
    { contacts: [contact('delete-me')], circles: { 'delete-me': ['Server'] } },
    {
      contacts: [contact('delete-me'), contact('offline')],
      circles: { offline: ['Friends'] },
    },
    [
      { kind: 'delete', contactId: 'delete-me' },
      { kind: 'update', contactId: 'offline' },
      { kind: 'circle', contactId: 'offline' },
    ],
  )

  assert.deepEqual(result.contacts.map((item) => item.id), ['offline'])
  assert.deepEqual(result.circles, { offline: ['Friends'] })
})

test('reviewed re-import fields keep confirmed local history', () => {
  const history = [{ id: 'confirmed', sender: 'me' as const, text: 'Hello', minutesAgo: 2 }]
  const merged = mergeReimportedContact(
    contact('one', { name: 'Old', messages: history }),
    contact('one', { name: 'Reviewed', tier: 'key', messages: [] }),
  )
  assert.equal(merged.name, 'Reviewed')
  assert.equal(merged.tier, 'key')
  assert.deepEqual(merged.messages, history)
})
