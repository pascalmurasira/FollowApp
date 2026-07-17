import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginCameraLaunch,
  cancelCameraLaunch,
  createCameraLaunchState,
  finishCameraLaunch,
  isCameraLaunchActive,
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
