import type { Tier } from '@/lib/types'
import { cadenceForTier } from '@/lib/format'

const MS_PER_DAY = 86_400_000

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const parsed = new Date(Number(y), Number(m) - 1, Number(d))
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed
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

export function daysSinceDateInput(value: string): number {
  const parsed = parseDateInput(value)
  if (!parsed) return 0
  const elapsed = startOfLocalDay(new Date()).getTime() - parsed.getTime()
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY))
}

export function dateInputFromDaysAgo(days: number): string {
  const safeDays = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0
  const date = startOfLocalDay(new Date())
  date.setDate(date.getDate() - safeDays)
  return toDateInputValue(date)
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

export function contactLastContactedInputValue(contact: {
  lastContactedAt?: string | null
  daysSinceContact: number
}): string {
  const normalized = normalizeLastContactedAt(contact.lastContactedAt)
  if (normalized === null) return ''
  if (normalized) return normalized
  return dateInputFromDaysAgo(contact.daysSinceContact)
}
