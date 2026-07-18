import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createScreenWakeLockLifecycle,
  type ScreenWakeLockHandle,
} from '../hooks/use-screen-wake-lock.ts'
import { createNativeQRPresentationCoordinator } from '../lib/native.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

class FakeWakeLock implements ScreenWakeLockHandle {
  releaseCount = 0

  addEventListener() {
    // Release notifications are not needed for these ownership tests.
  }

  async release() {
    this.releaseCount += 1
  }
}

test('wake-lock lifecycle coalesces overlapping acquisition requests', async () => {
  const firstRequest = deferred<ScreenWakeLockHandle>()
  let requestCount = 0
  const states: string[] = []
  const lifecycle = createScreenWakeLockLifecycle({
    request: () => {
      requestCount += 1
      return firstRequest.promise
    },
    isVisible: () => true,
    onStateChange: (state) => states.push(state),
  })

  lifecycle.start()
  lifecycle.visibilityChanged()
  lifecycle.visibilityChanged()
  assert.equal(requestCount, 1)

  const sentinel = new FakeWakeLock()
  firstRequest.resolve(sentinel)
  await flushPromises()

  assert.equal(requestCount, 1)
  assert.deepEqual(states, ['requesting', 'active'])
  lifecycle.stop()
  await flushPromises()
  assert.equal(sentinel.releaseCount, 1)
})

test('wake-lock lifecycle releases a stale request and reacquires after foregrounding', async () => {
  const requests = [
    deferred<ScreenWakeLockHandle>(),
    deferred<ScreenWakeLockHandle>(),
  ]
  let requestIndex = 0
  let visible = true
  const lifecycle = createScreenWakeLockLifecycle({
    request: () => requests[requestIndex++].promise,
    isVisible: () => visible,
    onStateChange: () => {},
  })

  lifecycle.start()
  visible = false
  lifecycle.visibilityChanged()
  visible = true
  lifecycle.visibilityChanged()

  const stale = new FakeWakeLock()
  requests[0].resolve(stale)
  await flushPromises()
  assert.equal(stale.releaseCount, 1)
  assert.equal(requestIndex, 2)

  const current = new FakeWakeLock()
  requests[1].resolve(current)
  await flushPromises()
  lifecycle.stop()
  await flushPromises()
  assert.equal(current.releaseCount, 1)
})

test('native QR coordinator retains brightness until the last owner ends', async () => {
  const began: string[] = []
  const ended: string[] = []
  const coordinator = createNativeQRPresentationCoordinator({
    async begin(id) {
      began.push(id)
      return true
    },
    async end(id) {
      ended.push(id)
    },
  })

  assert.equal(await coordinator.begin('first'), true)
  assert.equal(await coordinator.begin('second'), true)
  await coordinator.end('first')
  await coordinator.end('first')
  assert.deepEqual(began, ['first'])
  assert.deepEqual(ended, [])

  await coordinator.end('second')
  assert.deepEqual(ended, ['first'])
})

test('native QR coordinator orders a stale cleanup before a newer begin', async () => {
  const firstBegin = deferred<boolean>()
  const calls: string[] = []
  const coordinator = createNativeQRPresentationCoordinator({
    async begin(id) {
      calls.push(`begin:${id}`)
      if (id === 'old') return firstBegin.promise
      return true
    },
    async end(id) {
      calls.push(`end:${id}`)
    },
  })

  const oldBegin = coordinator.begin('old')
  const oldEnd = coordinator.end('old')
  const newBegin = coordinator.begin('new')
  await flushPromises()
  assert.deepEqual(calls, ['begin:old'])

  firstBegin.resolve(true)
  await Promise.all([oldBegin, oldEnd, newBegin])
  assert.deepEqual(calls, ['begin:old', 'end:old', 'begin:new'])

  // A duplicate late cleanup from the old generation cannot end the new one.
  await coordinator.end('old')
  assert.deepEqual(calls, ['begin:old', 'end:old', 'begin:new'])
  await coordinator.end('new')
  assert.deepEqual(calls, [
    'begin:old',
    'end:old',
    'begin:new',
    'end:new',
  ])
})
