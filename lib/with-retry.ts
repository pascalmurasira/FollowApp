// Retries a task with exponential backoff, specifically to ride out
// transient rate-limit (429) errors from the AI gateway.

function isRateLimit(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { statusCode?: number; type?: string }
  return e.statusCode === 429 || e.type === 'rate_limit_exceeded'
}

export async function withRetry<T>(
  task: () => Promise<T>,
  { retries = 3, baseDelayMs = 800 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let attempt = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await task()
    } catch (error) {
      attempt++
      if (attempt > retries || !isRateLimit(error)) throw error
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
