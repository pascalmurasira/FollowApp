export type ScheduleTier = 'key' | 'network' | 'casual'

interface CadenceDefinition {
  days: number
  label: string
  shortLabel: string
}

/** The single source of truth for cadence timing and language. */
const CADENCE_BY_TIER: Record<ScheduleTier, CadenceDefinition> = {
  key: { days: 21, label: 'Every 3 weeks', shortLabel: '3 weeks' },
  network: { days: 45, label: 'Every 6 weeks', shortLabel: '6 weeks' },
  casual: { days: 90, label: 'Quarterly', shortLabel: '3 months' },
}

function tierOrDefault(tier?: ScheduleTier): ScheduleTier {
  return tier ?? 'network'
}

export function cadenceForTier(tier: ScheduleTier = 'network'): number {
  return CADENCE_BY_TIER[tierOrDefault(tier)].days
}

export function cadenceLabel(tier: ScheduleTier = 'network'): string {
  return CADENCE_BY_TIER[tierOrDefault(tier)].label
}

export function cadenceShortLabel(tier: ScheduleTier = 'network'): string {
  return CADENCE_BY_TIER[tierOrDefault(tier)].shortLabel
}

function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isFinite(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? date
    : null
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizedDateInput(value: string | null | undefined): string | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  const direct = parseDateInput(value)
  if (direct) return dateInputValue(direct)
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? dateInputValue(parsed) : undefined
}

function addDays(value: string, days: number): string | null {
  const date = parseDateInput(value)
  if (!date) return null
  date.setDate(date.getDate() + Math.trunc(days))
  return dateInputValue(date)
}

/** Exact next due date, including legacy contacts that only carry an age. */
export function nextFollowUpDateInput(
  lastContactedAt: string | null | undefined,
  tier: ScheduleTier = 'network',
  fallbackDaysSinceContact = 0,
  now = new Date(),
): string {
  const today = dateInputValue(now)
  const normalized = normalizedDateInput(lastContactedAt)
  if (normalized === null) return today
  if (normalized) return addDays(normalized, cadenceForTier(tier)) ?? today
  const age = Number.isFinite(fallbackDaysSinceContact)
    ? Math.max(0, Math.floor(fallbackDaysSinceContact))
    : 0
  return addDays(today, cadenceForTier(tier) - age) ?? today
}

/** Whether a date-only reminder would still fire at 09:00 local time. */
export function canScheduleReminderDate(
  value: string,
  now = new Date(),
): boolean {
  const date = parseDateInput(value)
  if (!date) return false
  date.setHours(9, 0, 0, 0)
  return date.getTime() > now.getTime()
}

export function formatFollowUpDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseDateInput(value)
  if (!date) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date)
}
