import assert from 'node:assert/strict'
import test from 'node:test'
import { toInternationalWhatsAppNumber } from '../lib/phone.ts'

test('WhatsApp routing requires an explicit international phone number', () => {
  assert.equal(toInternationalWhatsAppNumber('+90 555 229 3687'), '905552293687')
  assert.equal(toInternationalWhatsAppNumber('0090 555 229 3687'), '905552293687')
  assert.equal(toInternationalWhatsAppNumber('0555 229 3687'), null)
  assert.equal(toInternationalWhatsAppNumber('4155550142'), null)
})
