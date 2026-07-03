'use client'

import { useCallback, useEffect, useState } from 'react'

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
}

const DEFAULT_STATE: EngagementState = {
  streak: 0,
  lastReachOutDate: null,
  reachDateKey: null,
  reachedTodayIds: [],
  snoozed: {},
}

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
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

export function useEngagement() {
  const [state, setState] = useState<EngagementState>(DEFAULT_STATE)
  const [hydrated, setHydrated] = useState(false)

  // Load once on mount, pruning expired snoozes.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const loaded = raw ? (JSON.parse(raw) as EngagementState) : DEFAULT_STATE
      const { next } = pruneSnoozes(loaded.snoozed ?? {})
      setState({ ...DEFAULT_STATE, ...loaded, snoozed: next })
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

  const today = todayKey()
  const reachedToday =
    state.reachDateKey === today ? state.reachedTodayIds.length : 0

  return {
    hydrated,
    streak: state.lastReachOutDate === today || isYesterday(state.lastReachOutDate) ? state.streak : 0,
    reachedToday,
    snoozedIds: Object.keys(state.snoozed),
    recordReachOut,
    snooze,
    unsnooze,
  }
}
