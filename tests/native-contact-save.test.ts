import assert from 'node:assert/strict'
import test from 'node:test'
import { nativeContactSaveLabel } from '../lib/native-contact-save.ts'

test('native contact save labels distinguish every outcome honestly', () => {
  assert.equal(nativeContactSaveLabel('idle'), 'Also save to phone')
  assert.equal(nativeContactSaveLabel('saving'), 'Opening Contacts…')
  assert.equal(nativeContactSaveLabel('saved'), 'Saved to Contacts')
  assert.equal(nativeContactSaveLabel('exported'), 'Contact file ready')
  assert.equal(nativeContactSaveLabel('cancelled'), 'Not saved — try again')
  assert.equal(nativeContactSaveLabel('denied'), 'Open Settings for Contacts')
  assert.equal(nativeContactSaveLabel('error'), 'Could not save — try again')
})
