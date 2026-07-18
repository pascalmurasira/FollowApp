import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('business-card capture uses one maintained native camera lifecycle', () => {
  const nativeSource = readFileSync(
    new URL('../lib/native.ts', import.meta.url),
    'utf8',
  )
  const scanSheetSource = readFileSync(
    new URL('../components/scan-card-sheet.tsx', import.meta.url),
    'utf8',
  )
  const followAppNativeSource = readFileSync(
    new URL('../ios/App/App/FollowAppNativePlugin.swift', import.meta.url),
    'utf8',
  )

  assert.match(nativeSource, /Camera\.takePhoto\(/)
  assert.doesNotMatch(nativeSource, /\.takeBusinessCardPhoto\(/)
  assert.doesNotMatch(scanSheetSource, /prepareBusinessCardCamera/)
  assert.doesNotMatch(
    followAppNativeSource,
    /takeBusinessCardPhoto|prepareBusinessCardCamera/,
  )
})
