import assert from 'node:assert/strict'
import test from 'node:test'
import {
  shouldEnterApp,
  shouldShowSampleContacts,
} from '../lib/onboarding.ts'

test('samples are visible only before real relationship data exists', () => {
  assert.equal(shouldShowSampleContacts(null, 0), true)
  assert.equal(
    shouldShowSampleContacts(
      {
        completed: true,
        selectedContactIds: ['maya'],
        toneId: 'lowkey',
        sampleMode: true,
      },
      0,
    ),
    true,
  )
  assert.equal(
    shouldShowSampleContacts(
      {
        completed: true,
        selectedContactIds: ['user-1'],
        toneId: 'lowkey',
        sampleMode: false,
      },
      0,
    ),
    false,
  )
  assert.equal(
    shouldShowSampleContacts(
      {
        completed: true,
        selectedContactIds: ['maya'],
        toneId: 'lowkey',
        sampleMode: true,
      },
      1,
    ),
    false,
  )
})

test('real local data bypasses onboarding even when its marker is missing', () => {
  assert.equal(shouldEnterApp(null, 0), false)
  assert.equal(shouldEnterApp(null, 1), true)
  assert.equal(
    shouldEnterApp(
      {
        completed: true,
        selectedContactIds: [],
        toneId: 'lowkey',
      },
      0,
    ),
    true,
  )
})
