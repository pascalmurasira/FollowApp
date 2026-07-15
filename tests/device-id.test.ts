import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isValidDeviceId,
  normalizeDeviceId,
} from '../lib/server/device-id.ts'

test('accepts generated UUID and legacy fallback device ids', () => {
  assert.equal(
    normalizeDeviceId(' 550e8400-e29b-41d4-a716-446655440000 '),
    '550e8400-e29b-41d4-a716-446655440000',
  )
  assert.equal(isValidDeviceId('dev_abc123def456ghi789'), true)
})

test('rejects arbitrary namespaces and malformed ids', () => {
  assert.equal(normalizeDeviceId('victim-device'), null)
  assert.equal(normalizeDeviceId('../another-user'), null)
  assert.equal(normalizeDeviceId('550e8400-e29b-41d4-c716-446655440000'), null)
  assert.equal(normalizeDeviceId('x'.repeat(129)), null)
  assert.equal(normalizeDeviceId(undefined), null)
})
