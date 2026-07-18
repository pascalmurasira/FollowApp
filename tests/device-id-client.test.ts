import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDeviceId,
  resetDeviceForAccountSwitch,
  setDeviceId,
} from '../lib/device-id.ts'

function restoreProperty(name: 'window' | 'localStorage', descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor)
  else delete (globalThis as Record<string, unknown>)[name]
}

test('blocked localStorage cannot strand capture or contact creation', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const blockedStorage = {
    get length() {
      throw new Error('storage blocked')
    },
    getItem() {
      throw new Error('storage blocked')
    },
    setItem() {
      throw new Error('storage blocked')
    },
    removeItem() {
      throw new Error('storage blocked')
    },
    key() {
      throw new Error('storage blocked')
    },
  }

  Object.defineProperty(globalThis, 'window', {
    value: {},
    configurable: true,
  })
  Object.defineProperty(globalThis, 'localStorage', {
    value: blockedStorage,
    configurable: true,
  })

  try {
    const generated = getDeviceId()
    assert.match(
      generated,
      /^(?:[0-9a-f-]{36}|dev_[a-z0-9]{16,})$/i,
    )

    const adopted = '550e8400-e29b-41d4-a716-446655440099'
    setDeviceId(adopted)
    assert.equal(getDeviceId(), adopted)

    const reset = resetDeviceForAccountSwitch()
    assert.notEqual(reset, adopted)
    assert.ok(reset)
  } finally {
    restoreProperty('window', previousWindow)
    restoreProperty('localStorage', previousStorage)
  }
})
