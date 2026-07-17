import type { Profile } from '@/lib/types'

/**
 * The compact card payload carried inside a FollowApp QR / card link. Keys are
 * short to keep the encoded string (and therefore the QR) small and easy to
 * scan. The photo is intentionally NOT included — it would bloat the QR past a
 * reliably-scannable density. Name + role + company + phone + email is exactly
 * what a business card needs.
 */
export interface CardData {
  /** Name (required). */
  n: string
  /** Title / role. */
  t?: string
  /** Company. */
  co?: string
  /** Phone. */
  p?: string
  /** Email. */
  e?: string
}

/** Conservative ceiling that keeps screen-scanned QR codes reasonably sparse. */
export const MAX_CARD_QR_URL_BYTES = 900

// --- URL-safe base64 (isomorphic: btoa/atob exist in modern browsers + Node) -

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Encode a profile's card fields into a URL-safe token. */
export function encodeCard(profile: Pick<Profile, 'name' | 'title' | 'company' | 'phone' | 'email'>): string {
  const card: CardData = { n: profile.name }
  if (profile.title) card.t = profile.title
  if (profile.company) card.co = profile.company
  if (profile.phone) card.p = profile.phone
  if (profile.email) card.e = profile.email
  return toBase64Url(new TextEncoder().encode(JSON.stringify(card)))
}

/** Decode a card token back into structured data, or null if malformed. */
export function decodeCard(token: string): CardData | null {
  try {
    const json = new TextDecoder().decode(fromBase64Url(token))
    const obj = JSON.parse(json) as unknown
    if (!obj || typeof obj !== 'object') return null
    const data = obj as Record<string, unknown>
    if (typeof data.n !== 'string' || !data.n.trim()) return null
    return {
      n: data.n,
      t: typeof data.t === 'string' ? data.t : undefined,
      co: typeof data.co === 'string' ? data.co : undefined,
      p: typeof data.p === 'string' ? data.p : undefined,
      e: typeof data.e === 'string' ? data.e : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Public card path. The payload lives in the fragment so it is decoded by the
 * recipient's browser but is not sent in HTTP requests, referrers, or CDN logs.
 */
export function cardPath(profile: Parameters<typeof encodeCard>[0]): string {
  return `/card#c=${encodeCard(profile)}`
}

/** Absolute card URL (what the QR encodes). Falls back to a relative path. */
export function cardUrl(
  profile: Parameters<typeof encodeCard>[0],
  origin?: string,
): string {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}${cardPath(profile)}`
}

/** Guard the share flow before the QR library reaches an unrecoverable size. */
export function cardFitsReliableQr(
  profile: Parameters<typeof encodeCard>[0],
): boolean {
  const productionUrl = cardUrl(profile, 'https://followapp.chat')
  return new TextEncoder().encode(productionUrl).byteLength <= MAX_CARD_QR_URL_BYTES
}

/**
 * If a scanned QR string is a FollowApp card URL (or a bare token), return its
 * decoded card; otherwise null. Lets the in-app scanner accept either a full
 * URL or the raw `c` token.
 */
export function readCardFromScan(raw: string): CardData | null {
  const text = raw.trim()
  // Accept current fragment links and legacy query links already in the wild.
  try {
    const url = new URL(text)
    const c =
      new URLSearchParams(url.hash.replace(/^#/, '')).get('c') ??
      url.searchParams.get('c')
    if (c) return decodeCard(c)
  } catch {
    // Not a URL — fall through and treat the whole string as a token.
  }
  return decodeCard(text)
}

// --- vCard (.vcf) ----------------------------------------------------------

/** Escape a value per the vCard text spec. */
function vc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/**
 * Build a vCard 3.0 string from card data. Opening this (as a .vcf file or
 * data URL) triggers the native "Add to Contacts" sheet on iOS and Android.
 */
export function buildVCard(card: CardData): string {
  const name = card.n.trim()
  const parts = name.split(/\s+/)
  const first = parts[0] ?? ''
  const last = parts.length > 1 ? parts.slice(1).join(' ') : ''

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${vc(last)};${vc(first)};;;`,
    `FN:${vc(name)}`,
  ]
  if (card.co) lines.push(`ORG:${vc(card.co)}`)
  if (card.t) lines.push(`TITLE:${vc(card.t)}`)
  if (card.p) lines.push(`TEL;TYPE=CELL:${vc(card.p)}`)
  if (card.e) lines.push(`EMAIL;TYPE=INTERNET:${vc(card.e)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/**
 * Trigger the native contact-add flow for a card by handing the OS a .vcf.
 * Browser-only. The temporary object URL is revoked internally after the
 * download/open has had a chance to start.
 */
export function saveToPhone(card: CardData): void {
  const blob = new Blob([buildVCard(card)], { type: 'text/vcard;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `${card.n.replace(/[^\w]+/g, '_') || 'contact'}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after a tick so the navigation/open has time to start.
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
