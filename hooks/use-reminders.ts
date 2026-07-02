'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'nudge.reminders.v1'

export interface Reminder {
  id: string
  /** Linked contact, if the reminder was created from a follow-up card. */
  contactId?: string
  /** Snapshot of the contact's name so the list renders without a join. */
  contactName?: string
  /** Short note, e.g. "Follow up with Maya". */
  note: string
  /** Epoch ms when the reminder becomes due. */
  dueAt: number
  createdAt: number
  done: boolean
}

/** Quick-pick options offered by the "Remind me" control. */
export type ReminderPreset = 'tomorrow' | 'in3days' | 'nextweek'

/** Resolve a preset to an epoch-ms due time (9am on the target day). */
export function presetToDueAt(preset: ReminderPreset): number {
  const d = new Date()
  const days = preset === 'tomorrow' ? 1 : preset === 'in3days' ? 3 : 7
  d.setDate(d.getDate() + days)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

const nextId = () => `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [hydrated, setHydrated] = useState(false)
  // A ticking "now" so due reminders surface without a manual refresh.
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setReminders(JSON.parse(raw) as Reminder[])
    } catch (error) {
      console.error('Failed to load reminders:', error)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders))
    } catch (error) {
      console.error('Failed to save reminders:', error)
    }
  }, [reminders, hydrated])

  // Re-evaluate due state every 30s so a reminder "goes off" while the app's open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const add = useCallback(
    (input: {
      note: string
      dueAt: number
      contactId?: string
      contactName?: string
    }): Reminder => {
      const reminder: Reminder = {
        id: nextId(),
        note: input.note,
        dueAt: input.dueAt,
        contactId: input.contactId,
        contactName: input.contactName,
        createdAt: Date.now(),
        done: false,
      }
      setReminders((prev) => [...prev, reminder])
      return reminder
    },
    [],
  )

  const complete = useCallback((id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, done: true } : r)),
    )
  }, [])

  const dismiss = useCallback((id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const snooze = useCallback((id: string, dueAt: number) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, dueAt, done: false } : r)),
    )
  }, [])

  const active = useMemo(
    () =>
      reminders
        .filter((r) => !r.done)
        .sort((a, b) => a.dueAt - b.dueAt),
    [reminders],
  )

  const due = useMemo(
    () => active.filter((r) => r.dueAt <= now),
    [active, now],
  )

  const upcoming = useMemo(
    () => active.filter((r) => r.dueAt > now),
    [active, now],
  )

  return {
    hydrated,
    reminders,
    active,
    due,
    upcoming,
    dueCount: due.length,
    add,
    complete,
    dismiss,
    snooze,
  }
}
