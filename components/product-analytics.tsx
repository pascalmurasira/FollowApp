'use client'

import {
  Analytics,
  type BeforeSendEvent,
} from '@vercel/analytics/react'
import { safeAnalyticsUrl } from '@/lib/product-analytics'

/** Strip card payloads and auth credentials before analytics leaves the device. */
export function ProductAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => ({
        ...event,
        url: safeAnalyticsUrl(event.url),
      })}
    />
  )
}
