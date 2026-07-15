import assert from 'node:assert/strict'
import test from 'node:test'
import { isNativeMethodUnavailableError } from '../lib/native-bridge.ts'

test('older or absent native contact methods are eligible for fallback', () => {
  assert.equal(
    isNativeMethodUnavailableError({
      code: 'UNIMPLEMENTED',
      message: 'FollowAppNative.saveContact is not implemented on ios',
    }),
    true,
  )
  assert.equal(
    isNativeMethodUnavailableError(
      new TypeError('saveContact is not a function'),
    ),
    true,
  )
  assert.equal(
    isNativeMethodUnavailableError(
      'FollowAppNative plugin is not implemented on this native shell',
    ),
    true,
  )
})

test('cancellation and real contact errors do not look like a missing bridge', () => {
  assert.equal(
    isNativeMethodUnavailableError(new Error('User cancelled contact editor')),
    false,
  )
  assert.equal(
    isNativeMethodUnavailableError({
      code: 'CONTACT_UNAVAILABLE',
      message: 'Contacts could not be opened.',
    }),
    false,
  )
  assert.equal(
    isNativeMethodUnavailableError({
      code: 'CONTACT_BUSY',
      message: 'Contact editor is already open.',
    }),
    false,
  )
})
