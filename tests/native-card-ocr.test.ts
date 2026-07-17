import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeNativeBusinessCardRecognition,
  parseBusinessCardLines,
  preliminaryBusinessCardFieldCount,
} from '../lib/native-card-ocr.ts'

test('normalizes native OCR output and bounds untrusted bridge values', () => {
  assert.deepEqual(
    normalizeNativeBusinessCardRecognition({
      lines: ['  Ayşenur Kaya  ', 'Ayşenur Kaya', 42, '\u0000Sales\nDirector'],
      text: 'raw text',
      averageConfidence: 1.4,
    }),
    {
      lines: ['Ayşenur Kaya', 'Sales Director'],
      text: 'raw text',
      averageConfidence: 1,
    },
  )
  assert.deepEqual(
    normalizeNativeBusinessCardRecognition({
      text: 'Jane Doe\r\njane@example.com',
      averageConfidence: -0.5,
    }),
    {
      lines: ['Jane Doe', 'jane@example.com'],
      text: 'Jane Doe\r\njane@example.com',
      averageConfidence: 0,
    },
  )
  assert.equal(normalizeNativeBusinessCardRecognition({ lines: [] }), null)
})

test('extracts a useful preliminary card without treating company text as a name', () => {
  const card = parseBusinessCardLines([
    'PROPERTY EXPO',
    'Ayşenur Kaya',
    'International Sales Director',
    'Mobile +90 552 293 6875',
    'aysenur@propertyexpo.com.tr',
    'www.propertyexpo.com.tr',
  ])

  assert.deepEqual(card, {
    name: 'Ayşenur Kaya',
    title: 'International Sales Director',
    company: 'PROPERTY EXPO',
    phone: '+90 552 293 6875',
    email: 'aysenur@propertyexpo.com.tr',
    website: 'www.propertyexpo.com.tr',
  })
  assert.equal(preliminaryBusinessCardFieldCount(card), 6)
})

test('prefers a labelled mobile number over fax and leaves uncertain identity blank', () => {
  const card = parseBusinessCardLines([
    'Fax +31 (0)20 123 4567',
    'Mobile +31 6 1234 5678',
    'hello@example.nl',
  ])

  assert.equal(card.phone, '+31 6 1234 5678')
  assert.equal(card.email, 'hello@example.nl')
  assert.equal(card.name, '')
  assert.equal(card.company, '')
})
