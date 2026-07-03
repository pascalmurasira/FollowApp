/** A wall-clock time (e.g. "4:32 PM") derived from a relative offset. */
export function clockTime(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** A wall-clock time from an absolute timestamp (Date or ISO string). */
export function clockTimeAt(when: Date | string): string {
  const d = typeof when === 'string' ? new Date(when) : when
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function relativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return 'just now'
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m`
  const hours = minutesAgo / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 7) return `${Math.round(days)}d`
  const weeks = days / 7
  if (weeks < 4) return `${Math.round(weeks)}w`
  const months = days / 30
  if (months < 12) return `${Math.round(months)}mo`
  return `${Math.round(days / 365)}y`
}

/** Professional "time since last contact" phrasing, e.g. "Last touch: 3w ago". */
export function driftLabel(days: number): string {
  if (days <= 0) return 'In touch'
  if (days === 1) return 'Last touch: yesterday'
  if (days < 14) return `Last touch: ${days}d ago`
  if (days < 30) return `Last touch: ${Math.round(days / 7)}w ago`
  return `Last touch: ${Math.round(days / 30)}mo ago`
}

import type { Tier } from './types'

/** Compact "time since last contact" for tight card chips, e.g. "2mo ago". */
export function lastTouchShort(days: number): string {
  if (days <= 0) return 'In touch'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days}d ago`
  if (days < 30) return `${Math.round(days / 7)}w ago`
  return `${Math.round(days / 30)}mo ago`
}

/** Returns a warmth bucket used to color the chat-list drift indicator. */
export function driftLevel(days: number): 'warm' | 'cooling' | 'cold' {
  if (days < 10) return 'warm'
  if (days < 30) return 'cooling'
  return 'cold'
}

/** Target follow-up rhythm (in days) for each relationship tier. */
export function cadenceForTier(tier: Tier = 'network'): number {
  switch (tier) {
    case 'key':
      return 21
    case 'casual':
      return 90
    default:
      return 45
  }
}

/** Human label for a tier, used on badges and the add form. */
export function tierLabel(tier: Tier = 'network'): string {
  switch (tier) {
    case 'key':
      return 'Key'
    case 'casual':
      return 'Casual'
    default:
      return 'Network'
  }
}

/** True once a contact has gone past their tier's target cadence. */
export function isOverdue(days: number, tier: Tier = 'network'): boolean {
  return days >= cadenceForTier(tier)
}

/**
 * Relationship health relative to the contact's own cadence — not an absolute
 * day count. "On track" until 60% of cadence, "due soon" up to it, "overdue"
 * past it. Drives the colored health dot.
 */
export function healthLevel(
  days: number,
  tier: Tier = 'network',
): 'on-track' | 'due-soon' | 'overdue' {
  const cadence = cadenceForTier(tier)
  if (days >= cadence) return 'overdue'
  if (days >= cadence * 0.6) return 'due-soon'
  return 'on-track'
}

/** A short "why now" reason shown on the daily pick, blending timing + a hook. */
export function whyNow(days: number, interests: string[]): string {
  const hook = interests[0]
  if (!hook) return driftLabel(days)
  return `${driftLabel(days)} · last on ${hook}`
}
