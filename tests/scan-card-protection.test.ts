import assert from 'node:assert/strict'
import test from 'node:test'
import { resetRateLimitsForTests } from '../lib/server/api-protection.ts'
import { protectScanCardRequest } from '../lib/server/scan-card-protection.ts'

const firstDevice = '550e8400-e29b-41d4-a716-446655440000'
const secondDevice = '550e8400-e29b-41d4-a716-446655440001'

function request(deviceId = firstDevice): Request {
  return new Request('https://followapp.chat/api/scan-card', {
    method: 'POST',
    headers: {
      origin: 'https://followapp.chat',
      'x-vercel-forwarded-for': '203.0.113.90',
      'x-followapp-device-id': deviceId,
    },
  })
}

test.beforeEach(() => resetRateLimitsForTests())

test('conference attendees behind one NAT receive independent scan allowances', async () => {
  for (let index = 0; index < 60; index += 1) {
    assert.equal(await protectScanCardRequest(request(firstDevice)), null)
  }
  assert.equal(
    (await protectScanCardRequest(request(firstDevice)))?.status,
    429,
  )

  // A second installation on the same venue IP is not trapped in the first
  // attendee's exhausted bucket.
  assert.equal(await protectScanCardRequest(request(secondDevice)), null)
})

test('invalid or absent installation ids stay in the bounded legacy IP bucket', async () => {
  for (let index = 0; index < 60; index += 1) {
    assert.equal(await protectScanCardRequest(request('not-a-device-id')), null)
  }
  assert.equal(
    (await protectScanCardRequest(request('also-invalid')))?.status,
    429,
  )
})

test('rotating installation ids cannot bypass the shared venue ceiling', async () => {
  for (let index = 0; index < 600; index += 1) {
    const deviceId = `550e8400-e29b-41d4-a716-${index.toString().padStart(12, '0')}`
    assert.equal(await protectScanCardRequest(request(deviceId)), null)
  }

  assert.equal(
    (await protectScanCardRequest(
      request('550e8400-e29b-41d4-a716-999999999999'),
    ))?.status,
    429,
  )
})
