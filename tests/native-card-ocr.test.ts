import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeNativeBusinessCardRecognition,
  parseBusinessCardLines,
  parseNativeBusinessCardScan,
  parseSupportedBusinessCardQrPayload,
  preliminaryBusinessCardFieldCount,
} from '../lib/native-card-ocr.ts'
import { cardUrl } from '../lib/card.ts'

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

test('turns a canonical FollowApp QR into the normal review card model', () => {
  const card = parseSupportedBusinessCardQrPayload(
    cardUrl({
      name: 'Grace Hopper',
      title: 'Rear Admiral',
      company: 'United States Navy',
      phone: '+1 555 0100',
      email: 'grace@example.com',
    }),
  )

  assert.deepEqual(card, {
    name: 'Grace Hopper',
    title: 'Rear Admiral',
    company: 'United States Navy',
    phone: '+1 555 0100',
    email: 'grace@example.com',
    website: '',
  })
})

test('parses useful plain vCard QR contact data including folded fields', () => {
  const card = parseSupportedBusinessCardQrPayload(
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Lovelace;Ada;Byron;Countess;',
      'FN:Countess Ada Lovelace',
      'ORG:Analytical\\; Engines;Research',
      'TITLE:Mathematician and',
      '  programmer',
      'TEL;TYPE=CELL:tel:+44 20 7946 0958',
      'EMAIL;TYPE=INTERNET:mailto:ada@example.org',
      'URL:https://example.org/people/ada',
      'END:VCARD',
    ].join('\r\n'),
  )

  assert.deepEqual(card, {
    name: 'Countess Ada Lovelace',
    title: 'Mathematician and programmer',
    company: 'Analytical; Engines · Research',
    phone: '+44 20 7946 0958',
    email: 'ada@example.org',
    website: 'https://example.org/people/ada',
  })
})

test('uses structured N when FN is absent and lets OCR fill missing fields', () => {
  const card = parseNativeBusinessCardScan(
    ['Apollo Guidance Computer', 'Software Director'],
    [
      [
        'BEGIN:VCARD',
        'VERSION:4.0',
        'N:Hamilton;Margaret;Heafield;;',
        'EMAIL:margaret@example.org',
        'END:VCARD',
      ].join('\n'),
    ],
  )

  assert.deepEqual(card, {
    name: 'Margaret Heafield Hamilton',
    title: 'Software Director',
    company: '',
    phone: '',
    email: 'margaret@example.org',
    website: '',
  })
})

test('finds a supported contact payload after unrelated QR values', () => {
  const card = parseNativeBusinessCardScan([], [
    'https://tickets.example/event/123',
    [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'FN:Lin Chen',
      'TEL;CELL:+31 6 1234 5678',
      'END:VCARD',
    ].join('\n'),
  ])

  assert.equal(card.name, 'Lin Chen')
  assert.equal(card.phone, '+31 6 1234 5678')
})

test('unsupported and malformed QR content fails closed without suppressing OCR', () => {
  const rejected = [
    'https://followapp.chat.evil.test/card#c=anything',
    'https://example.com/person',
    'BEGIN:VCARD\nFN:No Version\nEND:VCARD',
    'BEGIN:VCARD\nVERSION:3.0\nEND:VCARD',
    `BEGIN:VCARD\nVERSION:3.0\nFN:${'x'.repeat(8_000)}\nEND:VCARD`,
  ]
  for (const payload of rejected) {
    assert.equal(parseSupportedBusinessCardQrPayload(payload), null)
  }

  const card = parseNativeBusinessCardScan(
    ['Ada Lovelace', 'ada@example.org'],
    ['https://example.com/not-a-contact'],
  )
  assert.equal(card.name, 'Ada Lovelace')
  assert.equal(card.email, 'ada@example.org')
})
