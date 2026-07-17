import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginCameraLaunch,
  cancelCameraLaunch,
  createCameraLaunchState,
  countScanReviewCorrections,
  finishCameraLaunch,
  isCameraLaunchActive,
  normalizeScanReviewFields,
  SCAN_CARD_CLIENT_TIMEOUT_MS,
  SCAN_CARD_MODEL_TIMEOUT_MS,
  scanFieldNeedsReview,
  scanQualityNotice,
  scanReadingStatus,
} from '../lib/camera-launch.ts'

test('only one camera launch can own the native UI at a time', () => {
  const state = createCameraLaunchState()
  const first = beginCameraLaunch(state)

  assert.equal(first, 1)
  assert.equal(isCameraLaunchActive(state), true)
  assert.equal(beginCameraLaunch(state), null)
  assert.equal(finishCameraLaunch(state, 999), false)
  assert.equal(isCameraLaunchActive(state), true)
  assert.equal(finishCameraLaunch(state, first), true)
  assert.equal(isCameraLaunchActive(state), false)
  assert.equal(beginCameraLaunch(state), 2)
})

test('closing the sheet invalidates a late camera completion', () => {
  const state = createCameraLaunchState()
  const attempt = beginCameraLaunch(state)
  assert.notEqual(attempt, null)

  cancelCameraLaunch(state)

  assert.equal(isCameraLaunchActive(state), false)
  assert.equal(finishCameraLaunch(state, attempt as number), false)
  assert.equal(beginCameraLaunch(state), 3)
})

test('scan review fields are normalized and never imply false certainty', () => {
  assert.deepEqual(
    normalizeScanReviewFields(['email', 'email', 'unknown', 42, 'name']),
    ['email', 'name'],
  )
  assert.equal(scanFieldNeedsReview('name', '', []), true)
  assert.equal(scanFieldNeedsReview('company', '', ['company']), false)
  assert.equal(scanFieldNeedsReview('email', 'not-an-email', []), true)
  assert.equal(scanFieldNeedsReview('phone', '+90 555 229 36875', []), false)
  assert.equal(scanFieldNeedsReview('title', 'Head of Sales', ['title']), true)
  assert.equal(scanFieldNeedsReview('name', 'Ayşenur Kaya', []), false)
})

test('reading status becomes progressive and offers a manual escape hatch', () => {
  assert.deepEqual(scanReadingStatus(0), {
    title: 'Reading the card…',
    detail: 'Finding the name and contact details.',
    canEnterManually: false,
  })
  assert.equal(scanReadingStatus(5_000).canEnterManually, true)
  assert.equal(scanReadingStatus(12_000).title, 'Still working…')
})

test('model and client timeouts leave room for a useful server response', () => {
  assert.ok(SCAN_CARD_MODEL_TIMEOUT_MS < SCAN_CARD_CLIENT_TIMEOUT_MS)
  assert.ok(SCAN_CARD_CLIENT_TIMEOUT_MS < 30_000)
})

test('quality notices call out uncertainty without claiming verification', () => {
  assert.equal(scanQualityNotice('clear', 0), null)
  assert.equal(
    scanQualityNotice('usable', 1),
    'One detail may be uncertain. Check the highlighted field.',
  )
  assert.equal(
    scanQualityNotice('poor', 0, 'Glare covers part of the phone number.'),
    'Glare covers part of the phone number.',
  )
})

test('review corrections count changed fields without exposing their contents', () => {
  const before = {
    name: 'Aysenur Kaya',
    title: 'Sales',
    company: 'Expo',
    phone: '+90555',
    email: 'a@example.com',
  }
  assert.equal(
    countScanReviewCorrections(before, {
      ...before,
      name: 'Ayşenur Kaya',
      phone: '+90 555 229 36875',
    }),
    2,
  )
  assert.equal(countScanReviewCorrections(null, before), 0)
})
