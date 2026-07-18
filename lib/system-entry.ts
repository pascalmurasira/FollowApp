export type SystemEntryAction = 'scan-card' | 'show-my-qr' | 'open-event'

export interface SystemEntryDelivery {
  action: SystemEntryAction
  deliveredAt: number
}

export const SYSTEM_ENTRY_DEDUPE_MS = 1_500

/** Collapse the duplicate callbacks iOS can emit for one shortcut launch. */
export function shouldDeliverSystemEntry(
  previous: SystemEntryDelivery | null,
  action: SystemEntryAction,
  deliveredAt: number,
): boolean {
  return (
    previous === null ||
    previous.action !== action ||
    deliveredAt - previous.deliveredAt >= SYSTEM_ENTRY_DEDUPE_MS
  )
}

const ACTION_BY_SLUG: Readonly<Record<string, SystemEntryAction>> = {
  scan: 'scan-card',
  'scan-card': 'scan-card',
  'my-qr': 'show-my-qr',
  qr: 'show-my-qr',
  event: 'open-event',
  conference: 'open-event',
}

function normalizedSlug(url: URL): string {
  if (url.protocol === 'followapp:') {
    return [url.hostname, ...url.pathname.split('/')]
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join('/')
  }

  return url.pathname
    .replace(/^\/+/, '')
    .replace(/^app\//, '')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/**
 * Parse only FollowApp-owned, content-free system entry points. Contact ids,
 * card payloads, drafts, and auth tokens are deliberately never accepted here.
 */
export function systemEntryAction(rawUrl: string): SystemEntryAction | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.username || url.password) return null
  if (url.search || url.hash) return null

  const customScheme = url.protocol === 'followapp:'
  const universalLink =
    url.protocol === 'https:' &&
    url.hostname.toLowerCase() === 'followapp.chat' &&
    !url.port
  if (!customScheme && !universalLink) return null

  const slug = normalizedSlug(url)
  return ACTION_BY_SLUG[slug] ?? null
}
