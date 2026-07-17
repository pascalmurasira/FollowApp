import { createHmac } from 'node:crypto'
import { logServerError } from './error-metadata.ts'

export interface RateLimitOptions {
  limit: number
  windowMs: number
  /** Stable authenticated identity; defaults to the caller IP when absent. */
  identity?: string
}

export interface RateLimitDecision {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

interface PersistentRateLimitRow {
  count: string | number
  resetAt: string | number
  retryAfter: string | number
}

export type RateLimitDatabaseQuery = (
  statement: string,
  values: readonly unknown[],
) => Promise<{ rows: PersistentRateLimitRow[] }>

export interface RateLimitRuntime {
  production: boolean
  databaseUrl?: string
  secret?: string
  query?: RateLimitDatabaseQuery
  reportError?: (message: string, error?: unknown) => void
}

interface Bucket {
  count: number
  resetAt: number
}

const rateLimitGlobal = globalThis as typeof globalThis & {
  __followAppRateBuckets?: Map<string, Bucket>
}

const buckets =
  rateLimitGlobal.__followAppRateBuckets ??
  (rateLimitGlobal.__followAppRateBuckets = new Map<string, Bucket>())

export function consumeRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now = Date.now(),
): RateLimitDecision {
  const previous = buckets.get(key)
  const bucket =
    !previous || previous.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : previous

  bucket.count += 1
  buckets.set(key, bucket)

  if (buckets.size > 10_000) {
    for (const [candidate, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(candidate)
    }
  }

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  }
}

const persistentRateLimitStatement = `
  WITH expired_rate_limits AS (
    SELECT id
    FROM verification
    WHERE $3::boolean
      AND identifier LIKE 'followapp-rate:%'
      AND "expiresAt" <= CURRENT_TIMESTAMP
    LIMIT 500
  ), cleanup AS (
    DELETE FROM verification AS stale
    USING expired_rate_limits
    WHERE stale.id = expired_rate_limits.id
  )
  INSERT INTO verification (
    id, identifier, value, "expiresAt", "createdAt", "updatedAt"
  )
  VALUES (
    $1,
    $1,
    '1',
    CURRENT_TIMESTAMP + ($2::bigint * INTERVAL '1 millisecond'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (id) DO UPDATE
  SET
    value = CASE
      WHEN verification."expiresAt" <= CURRENT_TIMESTAMP THEN '1'
      ELSE (verification.value::bigint + 1)::text
    END,
    "expiresAt" = CASE
      WHEN verification."expiresAt" <= CURRENT_TIMESTAMP
        THEN CURRENT_TIMESTAMP + ($2::bigint * INTERVAL '1 millisecond')
      ELSE verification."expiresAt"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING
    value::bigint AS count,
    (EXTRACT(EPOCH FROM "expiresAt") * 1000)::bigint AS "resetAt",
    GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP)))
    )::integer AS "retryAfter"
`

/**
 * Better Auth consumes verification rows by their caller-supplied identifier.
 * Keying these internal rows with a server secret prevents a crafted magic-link
 * token from deleting a predictable rate-limit bucket.
 */
export function persistentRateLimitBucketId(key: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(key).digest('base64url')
  return `followapp-rate:${digest}`
}

async function defaultRateLimitQuery(
  statement: string,
  values: readonly unknown[],
): Promise<{ rows: PersistentRateLimitRow[] }> {
  // Keep pg out of the development/test path, where this module is also loaded
  // directly by Node's lightweight TypeScript test runner.
  const { pool } = await import('@/lib/db')
  const result = await pool.query<PersistentRateLimitRow>(statement, [...values])
  return { rows: result.rows }
}

async function consumePersistentRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  secret: string,
  query: RateLimitDatabaseQuery,
): Promise<RateLimitDecision> {
  const bucketId = persistentRateLimitBucketId(key, secret)
  // A secret-keyed 1-in-64 sample keeps expired rotating-IP buckets bounded
  // without adding a table scan to every request. Better Auth also clears all
  // expired verification rows whenever it consumes a verification value.
  const runCleanup = bucketId.startsWith('followapp-rate:A')
  const result = await query(persistentRateLimitStatement, [
    bucketId,
    windowMs,
    runCleanup,
  ])
  const row = result.rows[0]
  if (!row) throw new Error('Rate-limit counter returned no row')

  const count = Number(row.count)
  const resetAt = Number(row.resetAt)
  const retryAfter = Number(row.retryAfter)
  if (
    !Number.isFinite(count) ||
    count < 1 ||
    !Number.isFinite(resetAt) ||
    !Number.isFinite(retryAfter)
  ) {
    throw new Error('Rate-limit counter returned an invalid row')
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
    retryAfter: Math.max(1, Math.ceil(retryAfter)),
  }
}

/** Atomic shared limiter for non-route integrations such as Better Auth. */
export async function consumeDurableRateLimit(
  key: string,
  options: RateLimitOptions,
  runtime = defaultRuntime(),
): Promise<RateLimitDecision> {
  if (!runtime.production) return consumeRateLimit(key, options)
  if (!runtime.databaseUrl || !runtime.secret || runtime.secret.length < 32) {
    throw new Error('Durable rate limiting is not configured.')
  }
  return consumePersistentRateLimit(
    key,
    options,
    runtime.secret,
    runtime.query ?? defaultRateLimitQuery,
  )
}

function requestClientKey(req: Request): string {
  const forwarded =
    req.headers.get('x-vercel-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

const defaultRuntime = (): RateLimitRuntime => ({
  production: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
})

const unavailableResponse = () =>
  Response.json(
    { error: 'Request protection is temporarily unavailable.' },
    { status: 503, headers: { 'Retry-After': '5' } },
  )

function reportProtectionError(
  runtime: RateLimitRuntime,
  message: string,
  error?: unknown,
) {
  if (runtime.reportError) runtime.reportError(message, error)
  else if (error === undefined) console.error(message)
  else logServerError(message, error)
}

/** Shared production protection for anonymous model-backed endpoints. */
export async function protectExpensiveRequest(
  req: Request,
  namespace: string,
  options: RateLimitOptions,
  runtime = defaultRuntime(),
): Promise<Response | null> {
  const requestOrigin = req.headers.get('origin')
  const requestUrl = new URL(req.url)
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const requestHost = forwardedHost || req.headers.get('host') || requestUrl.host
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const requestProtocol = forwardedProto || requestUrl.protocol.replace(':', '')
  let sameOrigin = !requestOrigin
  if (requestOrigin) {
    try {
      const originUrl = new URL(requestOrigin)
      sameOrigin =
        originUrl.host === requestHost &&
        originUrl.protocol === `${requestProtocol}:`
    } catch {
      sameOrigin = false
    }
  }
  const fetchSite = req.headers.get('sec-fetch-site')
  if (
    !sameOrigin ||
    fetchSite === 'cross-site'
  ) {
    return Response.json({ error: 'Cross-site request rejected.' }, { status: 403 })
  }

  const key = `${namespace}:${options.identity || requestClientKey(req)}`
  let result: RateLimitDecision
  if (runtime.production) {
    if (!runtime.databaseUrl || !runtime.secret || runtime.secret.length < 32) {
      reportProtectionError(
        runtime,
        '[v0] durable rate limiting is not configured',
      )
      return unavailableResponse()
    }

    try {
      result = await consumePersistentRateLimit(
        key,
        options,
        runtime.secret,
        runtime.query ?? defaultRateLimitQuery,
      )
    } catch (error) {
      reportProtectionError(runtime, '[v0] durable rate limiting failed', error)
      return unavailableResponse()
    }
  } else {
    result = consumeRateLimit(key, options)
  }
  if (result.allowed) return null

  const retryAfter =
    result.retryAfter ??
    Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
  return Response.json(
    { error: 'Too many requests. Please try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

export function resetRateLimitsForTests() {
  buckets.clear()
}
