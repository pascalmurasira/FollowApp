import assert from 'node:assert/strict'
import test from 'node:test'
import {
  safeAnalyticsUrl,
  safeProductProperties,
} from '../lib/product-analytics.ts'

test('product analytics strips contact content and preserves funnel metrics', () => {
  assert.deepEqual(
    safeProductProperties({
      source: 'first_run',
      elapsed_ms: 412,
      corrected_fields: 2,
      native: true,
      contact_name: 'Private Person',
      email: 'private@example.com',
      draft_text: 'Private message',
      phone_number: '+1 555 0100',
    }),
    {
      source: 'first_run',
      elapsed_ms: 412,
      corrected_fields: 2,
      native: true,
    },
  )
})

test('product analytics removes card payloads and auth credentials from URLs', () => {
  assert.equal(
    safeAnalyticsUrl(
      'https://followapp.chat/card?campaign=private#c=encoded-contact-data',
    ),
    'https://followapp.chat/card',
  )
  assert.equal(
    safeAnalyticsUrl(
      'https://followapp.chat/api/auth/magic-link/verify?token=secret&callbackURL=%2F',
    ),
    'https://followapp.chat/api/auth/magic-link/verify',
  )
  assert.equal(
    safeAnalyticsUrl(
      'https://followapp.chat/i/local-contact-id-private-name?campaign=secret#person',
    ),
    'https://followapp.chat/i/invite',
  )
  assert.equal(
    safeAnalyticsUrl('/i/legacy-id-private-name?campaign=secret#person'),
    '/i/invite',
  )
})
