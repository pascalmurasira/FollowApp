import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildVCard,
  cardFitsReliableQr,
  cardPath,
  cardUrl,
  decodeCard,
  encodeCard,
  MAX_CARD_TOKEN_CHARS,
  readCardFromScan,
} from '../lib/card.ts'

function tokenFor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

test('a minimal card round-trips without inventing optional fields', () => {
  const token = encodeCard({ name: 'Ada Lovelace' })

  assert.match(token, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeCard(token), {
    n: 'Ada Lovelace',
    t: undefined,
    co: undefined,
    p: undefined,
    e: undefined,
  })
})

test('all card fields round-trip Unicode text through URL-safe base64', () => {
  const profile = {
    name: 'Zoë 王',
    title: 'Déléguée à l’innovation 🚀',
    company: 'München & 東京',
    phone: '+31 6 12 34 56 78',
    email: 'zoë@example.com',
  }

  const token = encodeCard(profile)

  assert.doesNotMatch(token, /[+/=]/)
  assert.deepEqual(decodeCard(token), {
    n: profile.name,
    t: profile.title,
    co: profile.company,
    p: profile.phone,
    e: profile.email,
  })
})

test('malformed or nameless card payloads are rejected', () => {
  const malformed = [
    '',
    'not*base64',
    Buffer.from('not JSON', 'utf8').toString('base64url'),
    tokenFor(null),
    tokenFor([]),
    tokenFor({}),
    tokenFor({ n: 42 }),
    tokenFor({ n: '   ' }),
  ]

  for (const token of malformed) {
    assert.equal(decodeCard(token), null, `expected ${token} to be rejected`)
  }
})

test('non-string optional fields are discarded when decoding', () => {
  assert.deepEqual(
    decodeCard(
      tokenFor({
        n: 'Grace Hopper',
        t: 12,
        co: null,
        p: ['555-0100'],
        e: false,
      }),
    ),
    {
      n: 'Grace Hopper',
      t: undefined,
      co: undefined,
      p: undefined,
      e: undefined,
    },
  )
})

test('card decoding rejects oversized and control-character fields', () => {
  const oversized = [
    { n: 'N'.repeat(201) },
    { n: 'Person', t: 'T'.repeat(301) },
    { n: 'Person', co: 'C'.repeat(301) },
    { n: 'Person', p: '1'.repeat(101) },
    { n: 'Person', e: `${'e'.repeat(309)}@example.com` },
  ]

  for (const payload of oversized) {
    assert.equal(decodeCard(tokenFor(payload)), null)
  }
  assert.equal(decodeCard(tokenFor({ n: 'Person\nInjected' })), null)
  assert.equal(decodeCard(tokenFor({ n: 'Person', co: 'Company\u0000Hidden' })), null)
  assert.equal(decodeCard('a'.repeat(MAX_CARD_TOKEN_CHARS + 1)), null)
})

test('card decoding trims bounded text and drops empty optional fields', () => {
  assert.deepEqual(
    decodeCard(tokenFor({ n: '  Grace Hopper ', t: '  ', co: ' Navy  ' })),
    {
      n: 'Grace Hopper',
      t: undefined,
      co: 'Navy',
      p: undefined,
      e: undefined,
    },
  )
})

test('card decoding accepts every field exactly at its public input limit', () => {
  assert.deepEqual(
    decodeCard(
      tokenFor({
        n: 'N'.repeat(200),
        t: 'T'.repeat(300),
        co: 'C'.repeat(300),
        p: '1'.repeat(100),
        e: 'e'.repeat(320),
      }),
    ),
    {
      n: 'N'.repeat(200),
      t: 'T'.repeat(300),
      co: 'C'.repeat(300),
      p: '1'.repeat(100),
      e: 'e'.repeat(320),
    },
  )
})

test('card paths and absolute URLs contain one decodable card token', () => {
  const profile = {
    name: 'Lin Chen',
    title: 'Founder',
    company: 'North Star',
    phone: '+1 555 0100',
    email: 'lin@example.com',
  }

  const path = cardPath(profile)
  const absolute = cardUrl(profile, 'https://followapp.chat')
  const parsed = new URL(absolute)

  assert.equal(parsed.origin, 'https://followapp.chat')
  assert.equal(parsed.pathname, '/card')
  assert.equal(parsed.search, '')
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  assert.equal(path, `${parsed.pathname}${parsed.hash}`)
  assert.deepEqual(decodeCard(fragment.get('c') ?? ''), {
    n: profile.name,
    t: profile.title,
    co: profile.company,
    p: profile.phone,
    e: profile.email,
  })
})

test('cardUrl always uses the canonical public origin by default', () => {
  const profile = { name: 'Katherine Johnson' }
  assert.equal(cardUrl(profile), `https://followapp.chat${cardPath(profile)}`)
})

test('QR sizing accepts concise cards and rejects oversized Unicode payloads', () => {
  assert.equal(
    cardFitsReliableQr({
      name: 'Katherine Johnson',
      title: 'Research Mathematician',
      company: 'NASA',
      phone: '+1 555 0100',
      email: 'katherine@example.com',
    }),
    true,
  )
  assert.equal(
    cardFitsReliableQr({
      name: '🛰️'.repeat(200),
      title: '🚀'.repeat(300),
      company: '🌍'.repeat(300),
    }),
    false,
  )
})

test('scanned cards require a canonical FollowApp card link', () => {
  const profile = { name: 'Radia Perlman', title: 'Engineer' }
  const token = encodeCard(profile)
  const expected = {
    n: profile.name,
    t: profile.title,
    co: undefined,
    p: undefined,
    e: undefined,
  }

  assert.deepEqual(
    readCardFromScan(`https://followapp.chat/card?utm_source=event&c=${token}`),
    expected,
  )
  assert.deepEqual(
    readCardFromScan(`https://followapp.chat/card#c=${token}`),
    expected,
  )
  assert.deepEqual(
    readCardFromScan(`http://localhost:3000/card#c=${token}`),
    expected,
  )
  assert.equal(readCardFromScan(`  ${token}\n`), null)
  assert.equal(readCardFromScan(`https://followapp.chat.evil.test/card#c=${token}`), null)
  assert.equal(readCardFromScan(`http://followapp.chat/card#c=${token}`), null)
  assert.equal(readCardFromScan(`https://user@followapp.chat/card#c=${token}`), null)
  assert.equal(readCardFromScan(`https://followapp.chat:8443/card#c=${token}`), null)
  assert.equal(readCardFromScan(`https://followapp.chat/other#c=${token}`), null)
  assert.equal(readCardFromScan('https://followapp.chat/card'), null)
  assert.equal(readCardFromScan('not a card'), null)
})

test('scanned card URLs fail closed above the reliable QR size ceiling', () => {
  const token = encodeCard({ name: 'Bounded Person' })
  assert.equal(
    readCardFromScan(
      `https://followapp.chat/card#c=${token}&padding=${'x'.repeat(900)}`,
    ),
    null,
  )
})

test('production scanning never treats a localhost link as a FollowApp card', () => {
  const environment = process.env as Record<string, string | undefined>
  const previous = environment.NODE_ENV
  Reflect.set(environment, 'NODE_ENV', 'production')
  try {
    const token = encodeCard({ name: 'Local Impostor' })
    assert.equal(
      readCardFromScan(`http://localhost:3000/card#c=${token}`),
      null,
    )
  } finally {
    if (previous === undefined) Reflect.deleteProperty(environment, 'NODE_ENV')
    else Reflect.set(environment, 'NODE_ENV', previous)
  }
})

test('unknown future card versions fail closed', () => {
  assert.equal(decodeCard(tokenFor({ v: 999, n: 'Future Person' })), null)
})

test('a minimal vCard uses CRLF delimiters and standard name fields', () => {
  const vcard = buildVCard({ n: 'Ada Lovelace' })

  assert.equal(
    vcard,
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Lovelace;Ada;;;',
      'FN:Ada Lovelace',
      'END:VCARD',
    ].join('\r\n'),
  )
  assert.equal(vcard.replace(/\r\n/g, '').includes('\n'), false)
})

test('a full vCard preserves Unicode and escapes reserved text characters', () => {
  const vcard = buildVCard({
    n: 'Zoë 王',
    co: 'Acme, Europe; R&D\\Labs',
    t: 'Design\nResearch',
    p: '+31 6 12 34 56 78',
    e: 'zoë@example.com',
  })

  assert.equal(
    vcard,
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:王;Zoë;;;',
      'FN:Zoë 王',
      'ORG:Acme\\, Europe\\; R&D\\\\Labs',
      'TITLE:Design\\nResearch',
      'TEL;TYPE=CELL:+31 6 12 34 56 78',
      'EMAIL;TYPE=INTERNET:zoë@example.com',
      'END:VCARD',
    ].join('\r\n'),
  )
})

test('vCard text normalizes CRLF and bare CR line breaks without leaking controls', () => {
  const vcard = buildVCard({
    n: 'Margaret Hamilton',
    co: 'Apollo\r\nGuidance\rComputer',
  })

  assert.match(vcard, /\r\nORG:Apollo\\nGuidance\\nComputer\r\n/)
  assert.equal(vcard.replace(/\r\n/g, '').includes('\r'), false)
})
