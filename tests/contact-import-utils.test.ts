import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTACT_IMPORT_BATCH_SIZE,
  ContactImportError,
  confirmedImportCount,
  contactImportBatches,
  importedContactId,
  importedContactIdentityKey,
  savedCountFromImportError,
  uniqueContactsById,
} from '../lib/contact-import-utils.ts'

test('contact imports are split at the server batch limit without losing order', () => {
  const contacts = Array.from({ length: 1_201 }, (_, index) => index)
  const batches = contactImportBatches(contacts)
  assert.equal(CONTACT_IMPORT_BATCH_SIZE, 500)
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [500, 500, 201],
  )
  assert.deepEqual(batches.flat(), contacts)
})

test('an import batch requires an exact saved-count confirmation', () => {
  assert.equal(confirmedImportCount({ saved: 500 }, 500), 500)
  assert.throws(() => confirmedImportCount({}, 500))
  assert.throws(() => confirmedImportCount({ saved: 499 }, 500))
  assert.throws(() => confirmedImportCount({ saved: '500' }, 500))
})

test('duplicate stable ids are removed before a batch upsert', () => {
  assert.deepEqual(
    uniqueContactsById([
      { id: 'same', name: 'First reviewed row' },
      { id: 'other', name: 'Another person' },
      { id: 'same', name: 'Duplicate row' },
    ]),
    [
      { id: 'same', name: 'First reviewed row' },
      { id: 'other', name: 'Another person' },
    ],
  )
})

test('import ids are stable for retries and isolated between devices', () => {
  const contact = {
    name: ' Maya  Chen ',
    company: 'Linear',
    email: 'MAYA@LINEAR.APP',
  }
  assert.equal(
    importedContactId('device-a', contact),
    importedContactId('device-a', {
      name: 'maya chen',
      company: ' linear ',
      email: 'maya@linear.app',
    }),
  )
  assert.notEqual(
    importedContactId('device-a', contact),
    importedContactId('device-b', contact),
  )
})

test('an adopted account can reuse an existing imported id', () => {
  const beforeAdoption = {
    id: importedContactId('source-device', {
      name: 'Maya Chen',
      title: 'Design Lead · Linear',
      email: 'maya@linear.app',
    }),
    name: 'Maya Chen',
    title: 'Design Lead · Linear',
    email: 'maya@linear.app',
  }
  const retriedRow = {
    name: ' maya  chen ',
    position: 'Design Lead',
    company: 'Linear',
    email: 'MAYA@LINEAR.APP',
  }

  const existingIds = new Map([
    [importedContactIdentityKey(beforeAdoption), beforeAdoption.id],
  ])
  assert.equal(
    existingIds.get(importedContactIdentityKey(retriedRow)),
    beforeAdoption.id,
  )
  assert.notEqual(
    importedContactId('canonical-device', retriedRow),
    beforeAdoption.id,
  )
})

test('partial progress survives serialization boundaries', () => {
  const error = new ContactImportError('failed', 500)
  assert.equal(savedCountFromImportError(error), 500)
  assert.equal(savedCountFromImportError({ savedCount: 17.9 }), 17)
  assert.equal(savedCountFromImportError(new Error('failed')), 0)
})
