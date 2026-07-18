import { isNativeMethodUnavailableError } from './native-bridge.ts'
import { readCardFromScan } from './card.ts'

export interface NativeBusinessCardRecognition {
  lines: string[]
  text?: string
  averageConfidence?: number
}

export interface PreliminaryBusinessCard {
  name: string
  title: string
  company: string
  phone: string
  email: string
  website: string
}

interface FollowAppCardOcrPlugin {
  recognizeBusinessCard(input: {
    image: string
  }): Promise<{
    lines?: unknown
    text?: unknown
    averageConfidence?: unknown
  }>
}

let pluginPromise: Promise<FollowAppCardOcrPlugin> | null = null

const ROLE_WORDS =
  /\b(?:architect|advisor|agent|broker|chief|consultant|coordinator|co-?founder|designer|developer|director|engineer|executive|founder|head|lead|manager|marketing|owner|partner|president|producer|sales|specialist|vice president|vp|ceo|cfo|coo|cto)\b/i
const COMPANY_WORDS =
  /\b(?:agency|association|b\. ?v\.?|company|corp(?:oration)?|expo|foundation|gmbh|group|holding|hotel|inc(?:orporated)?|limited|llc|ltd|n\. ?v\.?|properties|real estate|s\. ?a\.?|sas|studio|university)\b/i
const ADDRESS_WORDS =
  /\b(?:address|avenue|boulevard|building|floor|road|street|suite|postal|postcode|zip)\b/i
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/iu
const WEBSITE_PATTERN =
  /(?:https?:\/\/|www\.)?[a-z\d](?:[a-z\d-]*\.)+[a-z]{2,}(?:\/[^\s]*)?/i
const PHONE_PATTERN = /(?:\+?\d[\d\s()./-]{6,}\d)/g
const MAX_NATIVE_QR_PAYLOAD_CHARS = 8_000

function cleanLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

/** Normalize the bridge response before any OCR text reaches product state. */
export function normalizeNativeBusinessCardRecognition(
  value: unknown,
): NativeBusinessCardRecognition | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    lines?: unknown
    text?: unknown
    averageConfidence?: unknown
  }
  const text = typeof candidate.text === 'string' ? candidate.text : undefined
  const rawLines = Array.isArray(candidate.lines)
    ? candidate.lines
    : text?.split(/\r?\n/) ?? []
  const lines = [
    ...new Set(
      rawLines
        .filter((line): line is string => typeof line === 'string')
        .map(cleanLine)
        .filter(Boolean),
    ),
  ].slice(0, 80)
  if (lines.length === 0) return null

  const rawConfidence = candidate.averageConfidence
  const averageConfidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : undefined
  return {
    lines,
    ...(text ? { text: text.slice(0, 8_000) } : {}),
    ...(averageConfidence === undefined ? {} : { averageConfidence }),
  }
}

function bestPhone(lines: readonly string[]): string {
  const candidates = lines.flatMap((line, lineIndex) =>
    [...line.replace(EMAIL_PATTERN, ' ').matchAll(PHONE_PATTERN)]
      .map((match) => {
        const value = match[0].trim().replace(/[./-]+$/, '')
        const digits = value.replace(/\D/g, '')
        if (digits.length < 8 || digits.length > 15) return null
        const labelScore = /\b(?:mobile|cell|phone|tel|gsm|whatsapp)\b/i.test(line)
          ? 4
          : 0
        const faxPenalty = /\bfax\b/i.test(line) ? 5 : 0
        return {
          value,
          score: labelScore - faxPenalty - lineIndex / 100,
        }
      })
      .filter((candidate): candidate is { value: string; score: number } =>
        Boolean(candidate),
      ),
  )
  return candidates.sort((a, b) => b.score - a.score)[0]?.value ?? ''
}

function bestWebsite(lines: readonly string[], email: string): string {
  for (const line of lines) {
    const withoutEmail = email ? line.replace(email, ' ') : line
    const match = withoutEmail.match(WEBSITE_PATTERN)?.[0]
    if (match) return match.replace(/[),.;]+$/, '')
  }
  return ''
}

function isContactLine(line: string): boolean {
  const digits = line.replace(/\D/g, '').length
  return (
    EMAIL_PATTERN.test(line) ||
    WEBSITE_PATTERN.test(line) ||
    digits >= 7 ||
    /\b(?:email|mobile|phone|tel|fax|www)\b/i.test(line)
  )
}

function nameScore(line: string, index: number): number {
  if (
    isContactLine(line) ||
    ROLE_WORDS.test(line) ||
    COMPANY_WORDS.test(line) ||
    ADDRESS_WORDS.test(line)
  ) {
    return Number.NEGATIVE_INFINITY
  }
  const words = line
    .replace(/^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length < 2 || words.length > 5 || line.length > 70) {
    return Number.NEGATIVE_INFINITY
  }
  if (
    words.some(
      (word) =>
        !/^[\p{L}][\p{L}'’.-]*$/u.test(word) || word.replace(/\P{L}/gu, '').length < 2,
    )
  ) {
    return Number.NEGATIVE_INFINITY
  }
  const titleCaseWords = words.filter((word) => {
    const letters = word.replace(/\P{L}/gu, '')
    return letters.length > 1 && letters[0] === letters[0].toLocaleUpperCase()
  }).length
  const allUpper = line === line.toLocaleUpperCase()
  return 12 - index + titleCaseWords * 2 + (allUpper ? 0 : 2)
}

/**
 * Fast, conservative extraction from Vision lines. Every resulting field is a
 * preview and must remain visibly reviewable until the cloud scan finishes.
 */
export function parseBusinessCardLines(
  input: readonly string[],
): PreliminaryBusinessCard {
  const lines = [...new Set(input.map(cleanLine).filter(Boolean))]
  const email = lines.map((line) => line.match(EMAIL_PATTERN)?.[0] ?? '').find(Boolean) ?? ''
  const phone = bestPhone(lines)
  const website = bestWebsite(lines, email)
  const textLines = lines.filter((line) => !isContactLine(line))

  const rankedNames = textLines
    .map((line) => ({ line, score: nameScore(line, lines.indexOf(line)) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((a, b) => b.score - a.score)
  const name = rankedNames[0]?.line ?? ''
  const title =
    textLines.find((line) => line !== name && ROLE_WORDS.test(line)) ?? ''
  const company =
    textLines.find(
      (line) => line !== name && line !== title && COMPANY_WORDS.test(line),
    ) ?? ''

  return { name, title, company, phone, email, website }
}

function emptyPreliminaryBusinessCard(): PreliminaryBusinessCard {
  return {
    name: '',
    title: '',
    company: '',
    phone: '',
    email: '',
    website: '',
  }
}

function splitEscapedVCardValue(value: string, delimiter: string): string[] {
  const parts: string[] = []
  let part = ''
  let escaped = false
  for (const character of value) {
    if (escaped) {
      part += `\\${character}`
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === delimiter) {
      parts.push(part)
      part = ''
    } else {
      part += character
    }
  }
  if (escaped) part += '\\'
  parts.push(part)
  return parts
}

function decodeVCardText(value: string): string {
  return cleanLine(
    value.replace(/\\([nN,;:\\])/g, (_match, escaped: string) => {
      if (escaped === 'n' || escaped === 'N') return ' '
      return escaped
    }),
  )
}

function safeVCardWebsite(value: string): string {
  const candidate = decodeVCardText(value).replace(/[),.;]+$/, '')
  if (!candidate || /\s/.test(candidate)) return ''
  if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^https?:/i.test(candidate)) {
    return ''
  }
  try {
    const url = new URL(
      /^(?:https?:\/\/)/i.test(candidate) ? candidate : `https://${candidate}`,
    )
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !url.hostname.includes('.')
    ) {
      return ''
    }
    return candidate.slice(0, 180)
  } catch {
    return ''
  }
}

function parseVCardQrPayload(raw: string): PreliminaryBusinessCard | null {
  const unfolded = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
  const lines = unfolded.split('\n').map((line) => line.trimEnd())
  if (
    lines.length < 4 ||
    lines[0]?.toUpperCase() !== 'BEGIN:VCARD' ||
    lines.at(-1)?.toUpperCase() !== 'END:VCARD' ||
    lines.filter((line) => line.toUpperCase() === 'BEGIN:VCARD').length !== 1 ||
    lines.filter((line) => line.toUpperCase() === 'END:VCARD').length !== 1
  ) {
    return null
  }

  const card = emptyPreliminaryBusinessCard()
  let structuredName = ''
  let supportedVersion = false

  for (const line of lines.slice(1, -1)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const descriptor = line.slice(0, separator)
    const property = descriptor
      .split(';', 1)[0]
      ?.split('.')
      .at(-1)
      ?.toUpperCase()
    const value = line.slice(separator + 1)

    if (property === 'VERSION') {
      supportedVersion = /^(?:2\.1|3\.0|4\.0)$/.test(value.trim())
      continue
    }
    // Quoted-printable contact data needs charset-aware decoding. Ignoring it
    // is safer than putting partially decoded text into a person's record.
    if (/ENCODING=QUOTED-PRINTABLE/i.test(descriptor)) continue

    if (property === 'FN' && !card.name) {
      card.name = decodeVCardText(value)
    } else if (property === 'N' && !structuredName) {
      const [last = '', first = '', middle = '', prefix = '', suffix = ''] =
        splitEscapedVCardValue(value, ';').map(decodeVCardText)
      structuredName = [prefix, first, middle, last, suffix]
        .filter(Boolean)
        .join(' ')
        .slice(0, 180)
    } else if (property === 'ORG' && !card.company) {
      card.company = splitEscapedVCardValue(value, ';')
        .map(decodeVCardText)
        .filter(Boolean)
        .join(' · ')
        .slice(0, 180)
    } else if (property === 'TITLE' && !card.title) {
      card.title = decodeVCardText(value)
    } else if (property === 'TEL' && !card.phone) {
      card.phone = bestPhone([decodeVCardText(value).replace(/^tel:/i, '')])
    } else if (property === 'EMAIL' && !card.email) {
      const emailValue = decodeVCardText(value).replace(/^mailto:/i, '')
      card.email = emailValue.match(EMAIL_PATTERN)?.[0] ?? ''
    } else if (property === 'URL' && !card.website) {
      card.website = safeVCardWebsite(value)
    }
  }

  if (!supportedVersion) return null
  if (!card.name) card.name = structuredName
  return preliminaryBusinessCardFieldCount(card) > 0 ? card : null
}

/**
 * Parse only QR formats that deliberately carry contact data. Arbitrary URLs,
 * text and malformed vCards stay untrusted and never enter the review model.
 */
export function parseSupportedBusinessCardQrPayload(
  input: string,
): PreliminaryBusinessCard | null {
  const raw = input.trim()
  if (!raw || raw.length > MAX_NATIVE_QR_PAYLOAD_CHARS) return null

  const followAppCard = readCardFromScan(raw)
  if (followAppCard) {
    return {
      name: followAppCard.n,
      title: followAppCard.t ?? '',
      company: followAppCard.co ?? '',
      phone: followAppCard.p ?? '',
      email: followAppCard.e ?? '',
      website: '',
    }
  }

  return parseVCardQrPayload(raw)
}

/**
 * Build one reviewable card from VisionKit's live text and QR observations.
 * Structured contact QR fields win when present; OCR fills only missing data.
 */
export function parseNativeBusinessCardScan(
  lines: readonly string[],
  qrPayloads: readonly string[],
): PreliminaryBusinessCard {
  const textCard = parseBusinessCardLines(lines)
  const qrCard = qrPayloads
    .map(parseSupportedBusinessCardQrPayload)
    .find((candidate): candidate is PreliminaryBusinessCard => candidate !== null)
  if (!qrCard) return textCard

  return {
    name: qrCard.name || textCard.name,
    title: qrCard.title || textCard.title,
    company: qrCard.company || textCard.company,
    phone: qrCard.phone || textCard.phone,
    email: qrCard.email || textCard.email,
    website: qrCard.website || textCard.website,
  }
}

export function preliminaryBusinessCardFieldCount(
  card: PreliminaryBusinessCard,
): number {
  return Object.values(card).filter((value) => value.trim()).length
}

/**
 * Older TestFlight builds simply return null because the bridge method does
 * not exist. Preliminary OCR is an optimization and must never block scanning.
 */
export async function recognizeNativeBusinessCard(
  image: string,
): Promise<NativeBusinessCardRecognition | null> {
  if (typeof window === 'undefined') return null
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return null
    if (!pluginPromise) {
      pluginPromise = Promise.resolve(
        registerPlugin<FollowAppCardOcrPlugin>('FollowAppNative'),
      )
    }
    const result = await (
      await pluginPromise
    ).recognizeBusinessCard({ image })
    return normalizeNativeBusinessCardRecognition(result)
  } catch (error) {
    if (!isNativeMethodUnavailableError(error)) {
      console.warn('[followapp] Preliminary on-device OCR unavailable:', error)
    }
    return null
  }
}
