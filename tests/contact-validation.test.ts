import assert from 'node:assert/strict'
import test from 'node:test'
import { isDeliverableEmail } from '../lib/contact-validation.ts'

test('only complete email addresses unlock a delivery channel', () => {
  assert.equal(isDeliverableEmail('alex@example.com'), true)
  assert.equal(isDeliverableEmail(' ALEX+work@example.co.uk '), true)
  assert.equal(isDeliverableEmail('alex@'), false)
  assert.equal(isDeliverableEmail('@example.com'), false)
  assert.equal(isDeliverableEmail('alex example.com'), false)
  assert.equal(isDeliverableEmail(undefined), false)
})
