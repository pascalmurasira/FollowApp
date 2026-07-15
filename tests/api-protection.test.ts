import assert from 'node:assert/strict'
import test from 'node:test'
import {
  consumeRateLimit,
  persistentRateLimitBucketId,
  protectExpensiveRequest,
  resetRateLimitsForTests,
  type RateLimitDatabaseQuery,
  type RateLimitRuntime,
} from '../lib/server/api-protection.ts'

test.beforeEach(() => resetRateLimitsForTests())

const productionSecret = 'test-rate-limit-secret-that-is-at-least-32-characters'

function productionRuntime(query: RateLimitDatabaseQuery): RateLimitRuntime {
  return {
    production: true,
    databaseUrl: 'postgres://rate-limit-test.invalid/followapp',
    secret: productionSecret,
    query,
    reportError: () => undefined,
  }
}

test('rate limit resets at the next window', () => {
  const options = { limit: 2, windowMs: 1_000 }
  assert.equal(consumeRateLimit('test', options, 0).allowed, true)
  assert.equal(consumeRateLimit('test', options, 100).allowed, true)
  assert.equal(consumeRateLimit('test', options, 200).allowed, false)
  assert.equal(consumeRateLimit('test', options, 1_000).allowed, true)
})

test('expensive endpoints reject cross-site browser requests', async () => {
  let queryCalls = 0
  const req = new Request('https://followapp.chat/api/suggest', {
    method: 'POST',
    headers: {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    },
  })
  const response = await protectExpensiveRequest(
    req,
    'test',
    { limit: 1, windowMs: 1_000 },
    productionRuntime(async () => {
      queryCalls += 1
      throw new Error('cross-site requests must not reach the database')
    }),
  )
  assert.equal(response?.status, 403)
  assert.equal(queryCalls, 0)
  assert.deepEqual(await response?.json(), {
    error: 'Cross-site request rejected.',
  })
})

test('same-origin requests are allowed until their quota is spent', async () => {
  const request = () =>
    new Request('https://followapp.chat/api/suggest', {
      method: 'POST',
      headers: {
        origin: 'https://followapp.chat',
        'x-vercel-forwarded-for': '203.0.113.10',
      },
    })
  const options = { limit: 1, windowMs: 60_000 }
  assert.equal(await protectExpensiveRequest(request(), 'suggest', options), null)
  assert.equal(
    (await protectExpensiveRequest(request(), 'suggest', options))?.status,
    429,
  )
})

test('same-origin checks use the public host forwarded to Next.js', async () => {
  const request = new Request('http://localhost:3100/api/suggest', {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3100',
      origin: 'http://127.0.0.1:3100',
      'x-forwarded-for': '127.0.0.1',
    },
  })
  assert.equal(
    await protectExpensiveRequest(request, 'public-host', {
      limit: 1,
      windowMs: 60_000,
    }),
    null,
  )
})

test('authenticated identities do not share a NAT rate-limit bucket', async () => {
  const request = () =>
    new Request('https://followapp.chat/api/chat/link', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.40' },
    })
  const base = { limit: 1, windowMs: 60_000 }
  assert.equal(
    await protectExpensiveRequest(request(), 'chat-link', {
      ...base,
      identity: 'user-a',
    }),
    null,
  )
  assert.equal(
    await protectExpensiveRequest(request(), 'chat-link', {
      ...base,
      identity: 'user-b',
    }),
    null,
  )
  assert.equal(
    (
      await protectExpensiveRequest(request(), 'chat-link', {
        ...base,
        identity: 'user-a',
      })
    )?.status,
    429,
  )
})

test('production uses the shared atomic counter instead of the local map', async () => {
  let count = 0
  let statement = ''
  let values: readonly unknown[] = []
  const query: RateLimitDatabaseQuery = async (sql, parameters) => {
    count += 1
    statement = sql
    values = parameters
    return {
      rows: [
        {
          count,
          resetAt: Date.now() + 60_000,
          retryAfter: 60,
        },
      ],
    }
  }
  const request = () =>
    new Request('https://followapp.chat/api/suggest', {
      method: 'POST',
      headers: { 'x-vercel-forwarded-for': '203.0.113.55' },
    })
  const options = { limit: 1, windowMs: 60_000 }
  const runtime = productionRuntime(query)

  assert.equal(
    await protectExpensiveRequest(request(), 'suggest', options, runtime),
    null,
  )
  resetRateLimitsForTests()
  const blocked = await protectExpensiveRequest(
    request(),
    'suggest',
    options,
    runtime,
  )

  assert.equal(blocked?.status, 429)
  assert.equal(blocked?.headers.get('Retry-After'), '60')
  assert.match(statement, /ON CONFLICT \(id\) DO UPDATE/)
  assert.match(statement, /LIMIT 500/)
  assert.equal(values[1], 60_000)
  assert.equal(typeof values[2], 'boolean')
  assert.equal(
    values[0],
    persistentRateLimitBucketId(
      'suggest:203.0.113.55',
      productionSecret,
    ),
  )
  assert.equal(String(values[0]).includes('203.0.113.55'), false)
})

test('production fails closed when durable rate limiting is not configured', async () => {
  const response = await protectExpensiveRequest(
    new Request('https://followapp.chat/api/suggest'),
    'suggest',
    { limit: 1, windowMs: 60_000 },
    {
      production: true,
      reportError: () => undefined,
    },
  )

  assert.equal(response?.status, 503)
  assert.equal(response?.headers.get('Retry-After'), '5')
  assert.deepEqual(await response?.json(), {
    error: 'Request protection is temporarily unavailable.',
  })
})

test('production fails closed when the shared counter query fails', async () => {
  const response = await protectExpensiveRequest(
    new Request('https://followapp.chat/api/suggest'),
    'suggest',
    { limit: 1, windowMs: 60_000 },
    productionRuntime(async () => {
      throw new Error('database unavailable')
    }),
  )

  assert.equal(response?.status, 503)
})

test('persistent bucket identifiers are secret-keyed and do not expose identities', () => {
  const key = 'suggest:203.0.113.70'
  const first = persistentRateLimitBucketId(key, productionSecret)
  const again = persistentRateLimitBucketId(key, productionSecret)
  const rotated = persistentRateLimitBucketId(key, `${productionSecret}-rotated`)

  assert.equal(first, again)
  assert.notEqual(first, rotated)
  assert.match(first, /^followapp-rate:[A-Za-z0-9_-]{43}$/)
  assert.equal(first.includes('203.0.113.70'), false)
})
