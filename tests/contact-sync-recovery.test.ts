import assert from 'node:assert/strict'
import test from 'node:test'
import { coalescePendingContactOperations } from '../lib/contact-sync-recovery.ts'

test('a pending contact delete supersedes every earlier write for that person', () => {
  const pending = [
    { kind: 'upsert' as const, contactId: 'contact-1' },
    { kind: 'outreach' as const, contactId: 'contact-1' },
    { kind: 'circle' as const, contactId: 'contact-1' },
    { kind: 'upsert' as const, contactId: 'contact-2' },
  ]

  assert.deepEqual(
    coalescePendingContactOperations(pending, {
      kind: 'delete',
      contactId: 'contact-1',
    }),
    [
      { kind: 'upsert', contactId: 'contact-2' },
      { kind: 'delete', contactId: 'contact-1' },
    ],
  )
})

test('recreating a deleted contact removes its pending delete', () => {
  assert.deepEqual(
    coalescePendingContactOperations(
      [{ kind: 'delete', contactId: 'contact-1' }],
      { kind: 'upsert', contactId: 'contact-1' },
    ),
    [{ kind: 'upsert', contactId: 'contact-1' }],
  )
})

test('late circle or outreach work cannot supersede a pending delete', () => {
  const deletion = [{ kind: 'delete' as const, contactId: 'contact-1' }]
  assert.deepEqual(
    coalescePendingContactOperations(deletion, {
      kind: 'circle',
      contactId: 'contact-1',
    }),
    deletion,
  )
  assert.deepEqual(
    coalescePendingContactOperations(deletion, {
      kind: 'outreach',
      contactId: 'contact-1',
    }),
    deletion,
  )
})

test('retry queue keeps only the latest desired operation of each kind', () => {
  assert.deepEqual(
    coalescePendingContactOperations(
      [
        { kind: 'upsert', contactId: 'contact-1' },
        { kind: 'circle', contactId: 'contact-1' },
      ],
      { kind: 'upsert', contactId: 'contact-1' },
    ),
    [
      { kind: 'circle', contactId: 'contact-1' },
      { kind: 'upsert', contactId: 'contact-1' },
    ],
  )
})

test('newer explicit update and touch intents are represented independently', () => {
  assert.deepEqual(
    coalescePendingContactOperations(
      [{ kind: 'update', contactId: 'contact-1', intentId: 'edit-1' }],
      { kind: 'touch', contactId: 'contact-1', intentId: 'touch-1' },
    ),
    [
      { kind: 'update', contactId: 'contact-1', intentId: 'edit-1' },
      { kind: 'touch', contactId: 'contact-1', intentId: 'touch-1' },
    ],
  )
  assert.deepEqual(
    coalescePendingContactOperations(
      [{ kind: 'update', contactId: 'contact-1', intentId: 'edit-1' }],
      { kind: 'update', contactId: 'contact-1', intentId: 'edit-2' },
    ),
    [{ kind: 'update', contactId: 'contact-1', intentId: 'edit-2' }],
  )
})
