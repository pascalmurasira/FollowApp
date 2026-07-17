import { track } from '@vercel/analytics/react'

type AnalyticsValue = string | number | boolean | null | undefined

const SENSITIVE_PROPERTY = /(^|_)(name|email|phone|message|draft|text|body|company|relationship|url)($|_)/i
const COARSE_INVITE_PATH = '/i/invite'

function coarseAnalyticsPath(pathname: string): string {
  return pathname.startsWith('/i/') ? COARSE_INVITE_PATH : pathname
}

/** Never let a public-card fragment or auth/query credential enter analytics. */
export function safeAnalyticsUrl(value: string): string {
  try {
    const url = new URL(value)
    url.pathname = coarseAnalyticsPath(url.pathname)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    const path = value.split(/[?#]/, 1)[0] ?? ''
    return coarseAnalyticsPath(path)
  }
}

/**
 * Keep activation telemetry useful without ever attaching a contact's content.
 * This is exported for regression tests because analytics privacy should fail
 * closed when a caller accidentally supplies a sensitive property.
 */
export function safeProductProperties(
  properties: Record<string, AnalyticsValue> = {},
): Record<string, AnalyticsValue> {
  return Object.fromEntries(
    Object.entries(properties).filter(
      ([key, value]) =>
        !SENSITIVE_PROPERTY.test(key) &&
        (value == null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'),
    ),
  )
}

/** Record a product-funnel event. Event names describe actions, never people. */
export function trackProductEvent(
  event: string,
  properties: Record<string, AnalyticsValue> = {},
): void {
  if (typeof window === 'undefined') return
  try {
    track(event, safeProductProperties(properties))
  } catch (error) {
    // Measurement must never block the product's core loop.
    console.warn('[followapp] Analytics event was not recorded:', error)
  }
}
