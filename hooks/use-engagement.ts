'use client'

import { useCallback, useEffect, useState } from 'react'
import { toDateInputValue } from '@/lib/contact-dates'

const STORAGE_KEY = 'nudge.engagement.v1'

export type SnoozeDuration = 'later' | 'weekend'

interface EngagementState {
  /** Consecutive days with at least one reach-out. */
  streak: number
  /** YYYY-MM-DD of the most recent reach-out, or null. */
  lastReachOutDate: string | null
  /** YYYY-MM-DD that reachedTodayIds belongs to. */
  reachDateKey: string | null
  /** Distinct contacts reached out to today. */
  reachedTodayIds: string[]
  /** contactId -> epoch ms the snooze expires. */
  snoozed: Record<string, number>
  /** Set only after the user explicitly grants local reminder permission. */
  remindersEnabled: boolean
  /** contactId -> local YYYY-MM-DD currently registered with iOS. */
  scheduledReminders: Record<string, string>
}

const DEFAULT_STATE: EngagementState = {
  streak: 0,
  lastReachOutDate: null,
  reachDateKey: null,
  reachedTodayIds: [],
  snoozed: {},
  remindersEnabled: false,
  scheduledReminders: {},
}

function todayKey(d = new Date()): string {
  return toDateInputValue(d)
}

function isYesterday(prev: string | null): boolean {
  if (!prev) return false
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return todayKey(y) === prev
}

/** Compute the epoch ms when a snooze of the given duration should expire. */
function snoozeUntil(duration: SnoozeDuration): number {
  const now = new Date()
  if (duration === 'later') {
    now.setHours(now.getHours() + 4)
    return now.getTime()
  }
  // 'weekend' -> next Saturday at 9am (or tomorrow 9am if already weekend).
  const day = now.getDay() // 0 Sun ... 6 Sat
  let add = (6 - day + 7) % 7
  if (add === 0) add = 1
  const target = new Date(now)
  target.setDate(now.getDate() + add)
  target.setHours(9, 0, 0, 0)
  return target.getTime()
}

/** Drop any snoozes that have already expired. Returns true if changed. */
function pruneSnoozes(snoozed: Record<string, number>): {
  next: Record<string, number>
  changed: boolean
} {
  const now = Date.now()
  const next: Record<string, number> = {}
  let changed = false
  for (const [id, until] of Object.entries(snoozed)) {
    if (until > now) next[id] = until
    else changed = true
  }
  return { next, changed }
}

function normalizeScheduledReminders(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized: Record<string, string> = {}
  for (const [contactId, date] of Object.entries(value)) {
    if (
      contactId &&
      contactId.length <= 200 &&
      typeof date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      normalized[contactId] = date
    }
  }
  return normalized
}

export function useEngagement() {
  const [state, setState] = useState<EngagementState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)

  // Load once on mount, pruning expired snoozes.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const loaded = raw
        ? (JSON.parse(raw) as Partial<EngagementState>)
        : DEFAULT_STATE
      const { next } = pruneSnoozes(loaded.snoozed ?? {})
      setState({
        ...DEFAULT_STATE,
        ...loaded,
        snoozed: next,
        scheduledReminders: normalizeScheduledReminders(
          loaded.scheduledReminders,
        ),
      })
    } catch (error) {
      console.error('Failed to load engagement state:', error)
    } finally {
      setHydrated(true)
    }
  }, [])

  // Persist whenever state changes (after hydration).
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.error('Failed to save engagement state:', error)
    }
  }, [state, hydrated])

  // A long-lived native WebView must wake snoozed people without requiring a
  // full app reload. Re-arm the timer whenever the earliest deadline changes.
  useEffect(() => {
    if (!hydrated) return
    const deadlines = Object.values(state.snoozed).filter((value) => value > Date.now())
    if (deadlines.length === 0) return
    const delay = Math.max(0, Math.min(...deadlines) - Date.now() + 50)
    const timer = window.setTimeout(() => {
      setState((previous) => ({
        ...previous,
        snoozed: pruneSnoozes(previous.snoozed).next,
      }))
    }, Math.min(delay, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [hydrated, state.snoozed])

  const recordReachOut = useCallback((contactId: string) => {
    setState((prev) => {
      const today = todayKey()
      const newDay = prev.reachDateKey !== today

      // Streak only advances on the first reach-out of a new day.
      let streak = prev.streak
      if (prev.lastReachOutDate === today) {
        // already counted today
      } else if (isYesterday(prev.lastReachOutDate)) {
        streak = prev.streak + 1
      } else {
        streak = 1
      }

      const reachedTodayIds = newDay
        ? [contactId]
        : prev.reachedTodayIds.includes(contactId)
          ? prev.reachedTodayIds
          : [...prev.reachedTodayIds, contactId]

      return {
        ...prev,
        streak,
        lastReachOutDate: today,
        reachDateKey: today,
        reachedTodayIds,
      }
    })
  }, [])

  const snooze = useCallback((contactId: string, duration: SnoozeDuration) => {
    setState((prev) => ({
      ...prev,
      snoozed: { ...prev.snoozed, [contactId]: snoozeUntil(duration) },
    }))
  }, [])

  const unsnooze = useCallback((contactId: string) => {
    setState((prev) => {
      const next = { ...prev.snoozed }
      delete next[contactId]
      return { ...prev, snoozed: next }
    })
  }, [])

  const refreshTimeState = useCallback(() => {
    setState((previous) => ({
      ...previous,
      snoozed: pruneSnoozes(previous.snoozed).next,
    }))
  }, [])

  const enableReminders = useCallback(() => {
    setState((previous) => ({ ...previous, remindersEnabled: true }))
  }, [])

  const disableReminders = useCallback(() => {
    setState((previous) => ({ ...previous, remindersEnabled: false }))
  }, [])

  const markReminderScheduled = useCallback(
    (contactId: string, date: string) => {
      setState((previous) => ({
        ...previous,
        scheduledReminders: {
          ...previous.scheduledReminders,
          [contactId]: date,
        },
      }))
    },
    [],
  )

  const clearScheduledReminder = useCallback((contactId: string) => {
    setState((previous) => {
      if (!(contactId in previous.scheduledReminders)) return previous
      const scheduledReminders = { ...previous.scheduledReminders }
      delete scheduledReminders[contactId]
      return { ...previous, scheduledReminders }
    })
  }, [])

  const clearAllScheduledReminders = useCallback(() => {
    setState((previous) => ({ ...previous, scheduledReminders: {} }))
  }, [])

  const today = todayKey()
  const reachedToday =
    state.reachDateKey === today ? state.reachedTodayIds.length : 0

  return {
    hydrated,
    streak: state.lastReachOutDate === today || isYesterday(state.lastReachOutDate) ? state.streak : 0,
    reachedToday,
    snoozedIds: Object.keys(state.snoozed),
    remindersEnabled: state.remindersEnabled,
    scheduledReminderDates: state.scheduledReminders,
    recordReachOut,
    snooze,
    unsnooze,
    refreshTimeState,
    enableReminders,
    disableReminders,
    markReminderScheduled,
    clearScheduledReminder,
    clearAllScheduledReminders,
  }
}
