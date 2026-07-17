export type OperationalErrorCategory =
  | 'aborted'
  | 'access_denied'
  | 'database'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'upstream_failure'
  | 'unknown'

export interface OperationalErrorMetadata {
  category: OperationalErrorCategory
  statusCode?: number
}

function property(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * Reduce any provider/ORM/runtime exception to a small operational allowlist.
 * Messages, stacks, SQL params, causes, bodies, tokens, and images never pass.
 */
export function operationalErrorMetadata(
  error: unknown,
): OperationalErrorMetadata {
  const rawStatus = property(error, 'statusCode') ?? property(error, 'status')
  const statusCode =
    typeof rawStatus === 'number' &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 599
      ? rawStatus
      : undefined
  const type = property(error, 'type')
  const name = property(error, 'name')

  let category: OperationalErrorCategory = 'unknown'
  if (
    statusCode === 429 ||
    type === 'rate_limit_exceeded' ||
    name === 'GatewayRateLimitError'
  ) {
    category = 'rate_limited'
  } else if (statusCode === 402) {
    category = 'quota_exhausted'
  } else if (statusCode === 401 || statusCode === 403) {
    category = 'access_denied'
  } else if (name === 'AbortError') {
    category = 'aborted'
  } else if (
    name === 'DrizzleQueryError' ||
    name === 'PostgresError' ||
    name === 'DatabaseError'
  ) {
    category = 'database'
  } else if (statusCode && statusCode >= 500) {
    category = 'upstream_failure'
  }

  return statusCode === undefined ? { category } : { category, statusCode }
}

export function logServerError(message: string, error: unknown): void {
  console.error(message, operationalErrorMetadata(error))
}
