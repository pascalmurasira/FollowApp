import type { Tier } from './types.ts'
import {
  canScheduleReminderDate,
  cadenceForTier,
  formatFollowUpDate,
  nextFollowUpDateInput,
} from './follow-up-schedule.ts'

export {
  canScheduleReminderDate,
  formatFollowUpDate,
  nextFollowUpDateInput,
}

const MS_PER_DAY = 86_400_000

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const parsed = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isFinite(parsed.getTime()) &&
    parsed.getFullYear() === Number(y) &&
    parsed.getMonth() === Number(m) - 1 &&
    parsed.getDate() === Number(d)
    ? parsed
    : null
}

/** A calendar-day number that cannot be shortened or lengthened by DST. */
function localCalendarOrdinal(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  )
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayDateInputValue(): string {
  return toDateInputValue(new Date())
}

/**
 * Count local calendar boundaries, not elapsed 24-hour periods. A spring DST
 * day is only 23 hours and previously made yesterday appear to be today.
 */
export function daysSinceDateInput(value: string, now = new Date()): number {
  const parsed = parseDateInput(value)
  if (!parsed) return 0
  return Math.max(0, localCalendarOrdinal(now) - localCalendarOrdinal(parsed))
}

export function dateInputFromDaysAgo(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  date.setDate(date.getDate() - safeDays)
  return toDateInputValue(date)
}

/** Store a date-only value at a deterministic instant without server TZ drift. */
export function dateInputToUtcNoon(value: string): Date | null {
  const parsed = parseDateInput(value)
  if (!parsed) return null
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12),
  )
}

/** Read a date that was stored by dateInputToUtcNoon without local TZ drift. */
export function utcDateToDateInputValue(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeLastContactedAt(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  const parsed = parseDateInput(value)
  if (parsed) return toDateInputValue(parsed)
  const fromIso = new Date(value)
  if (!Number.isFinite(fromIso.getTime())) return undefined
  return toDateInputValue(fromIso)
}

export function daysForLastContactedAt(
  lastContactedAt: string | null | undefined,
  tier: Tier = 'network',
  fallbackDays = 0,
): number {
  const normalized = normalizeLastContactedAt(lastContactedAt)
  if (normalized === null) return cadenceForTier(tier)
  if (normalized) return daysSinceDateInput(normalized)
  return Number.isFinite(fallbackDays) ? Math.max(0, Math.floor(fallbackDays)) : 0
}

export function nextFollowUpForContact(
  contact: Pick<
    { lastContactedAt?: string | null; tier?: Tier; daysSinceContact: number },
    'lastContactedAt' | 'tier' | 'daysSinceContact'
  >,
  now = new Date(),
): string {
  return nextFollowUpDateInput(
    contact.lastContactedAt,
    contact.tier,
    contact.daysSinceContact,
    now,
  )
}

export function contactLastContactedInputValue(contact: {
  lastContactedAt?: string | null
  daysSinceContact: number
}): string {
  const normalized = normalizeLastContactedAt(contact.lastContactedAt)
  if (normalized === null) return ''
  if (normalized) return normalized
  return dateInputFromDaysAgo(contact.daysSinceContact)
}
