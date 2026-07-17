import { isNativeMethodUnavailableError } from './native-bridge.ts'

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
