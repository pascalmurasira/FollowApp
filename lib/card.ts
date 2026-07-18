import type { Profile } from './types'

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
  /** Website. Used by scanned physical cards; omitted from compact profile QR. */
  w?: string
}

/** Conservative ceiling that keeps screen-scanned QR codes reasonably sparse. */
export const MAX_CARD_QR_URL_BYTES = 900
/**
 * A public card may also be opened from an older link rather than a QR, so its
 * decode ceiling is intentionally wider than the reliable-QR ceiling. It is
 * still finite: decoding an attacker-controlled multi-megabyte fragment should
 * never allocate an equally large base64 and JSON payload in the browser.
 */
export const MAX_CARD_TOKEN_CHARS = 8_192
const CARD_FORMAT_VERSION = 1
const CARD_ORIGIN = 'https://followapp.chat'
const CARD_FIELD_LIMITS = {
  n: 200,
  t: 300,
  co: 300,
  p: 100,
  e: 320,
} as const
const SINGLE_LINE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

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
  const card: CardData & { v: typeof CARD_FORMAT_VERSION } = {
    v: CARD_FORMAT_VERSION,
    n: profile.name,
  }
  if (profile.title) card.t = profile.title
  if (profile.company) card.co = profile.company
  if (profile.phone) card.p = profile.phone
  if (profile.email) card.e = profile.email
  return toBase64Url(new TextEncoder().encode(JSON.stringify(card)))
}

/** Decode a card token back into structured data, or null if malformed. */
export function decodeCard(token: string): CardData | null {
  if (
    !token ||
    token.length > MAX_CARD_TOKEN_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(token)
  ) {
    return null
  }
  try {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(
      fromBase64Url(token),
    )
    const obj = JSON.parse(json) as unknown
    if (!obj || typeof obj !== 'object') return null
    const data = obj as Record<string, unknown>
    if (data.v !== undefined && data.v !== CARD_FORMAT_VERSION) return null

    const boundedField = <Key extends keyof typeof CARD_FIELD_LIMITS>(
      key: Key,
      required = false,
    ): string | undefined | null => {
      const value = data[key]
      if (value === undefined) return required ? null : undefined
      // Preserve backwards compatibility with early cards that accidentally
      // carried non-string optional values, while still failing the required
      // identity field closed.
      if (typeof value !== 'string') return required ? null : undefined
      const normalized = value.trim()
      if (
        (!normalized && required) ||
        normalized.length > CARD_FIELD_LIMITS[key] ||
        SINGLE_LINE_CONTROL_CHARACTERS.test(normalized)
      ) {
        return null
      }
      return normalized || undefined
    }

    const name = boundedField('n', true)
    const title = boundedField('t')
    const company = boundedField('co')
    const phone = boundedField('p')
    const email = boundedField('e')
    if (
      name == null ||
      title === null ||
      company === null ||
      phone === null ||
      email === null
    ) {
      return null
    }
    return {
      n: name,
      t: title,
      co: company,
      p: phone,
      e: email,
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
  // A canonical origin keeps every shared card scannable and prevents a
  // preview/local host from becoming a permanent public identity link.
  const base = origin ?? CARD_ORIGIN
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
 * Read only a card link from FollowApp's canonical origin. The payload remains
 * self-asserted (the UI labels it that way), but an arbitrary QR can no longer
 * masquerade as a FollowApp card by carrying a bare base64 token or using a
 * lookalike host. Localhost is accepted solely for development and tests.
 */
export function readCardFromScan(raw: string): CardData | null {
  const text = raw.trim()
  // Every card emitted by the app is kept below this ceiling. Reject a larger
  // scanned URL before URL/base64/JSON parsing so an untrusted QR cannot turn a
  // camera frame into an unbounded allocation.
  if (
    !text ||
    new TextEncoder().encode(text).byteLength > MAX_CARD_QR_URL_BYTES
  ) {
    return null
  }
  try {
    const url = new URL(text)
    const localHost =
      process.env.NODE_ENV !== 'production' &&
      (url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '::1')
    const productionHost =
      url.hostname === 'followapp.chat' || url.hostname === 'www.followapp.chat'
    if (!productionHost && !localHost) return null
    if (productionHost && url.protocol !== 'https:') return null
    if (url.username || url.password || (productionHost && url.port)) return null
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/card') {
      return null
    }
    const c =
      new URLSearchParams(url.hash.replace(/^#/, '')).get('c') ??
      url.searchParams.get('c')
    if (c) return decodeCard(c)
  } catch {
    return null
  }
  return null
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
  if (card.w) lines.push(`URL:${vc(card.w)}`)
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
