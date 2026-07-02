'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'nudge.tasks.v1'

export interface Task {
  id: string
  title: string
  /** Optional linked contact (tasks can also be free-standing). */
  contactId?: string
  contactName?: string
  /** Optional local YYYY-MM-DD due date. */
  dueDate?: string
  done: boolean
  createdAt: number
  completedAt?: number
}

const nextId = () => `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) setTasks(JSON.parse(raw) as Task[])
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
    } catch (error) {
      console.error('Failed to save tasks:', error)
    }
  }, [tasks, hydrated])

  const add = useCallback(
    (input: {
      title: string
      contactId?: string
      contactName?: string
      dueDate?: string
    }): Task | null => {
      const title = input.title.trim()
      if (!title) return null
      const task: Task = {
        id: nextId(),
        title,
        contactId: input.contactId,
        contactName: input.contactName,
        dueDate: input.dueDate,
        done: false,
        createdAt: Date.now(),
      }
      setTasks((prev) => [task, ...prev])
      return task
    },
    [],
  )

  const toggle = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              done: !t.done,
              completedAt: !t.done ? Date.now() : undefined,
            }
          : t,
      ),
    )
  }, [])

  const remove = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const open = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort((a, b) => {
          // Dated tasks first (soonest on top), then undated by newest.
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return b.createdAt - a.createdAt
        }),
    [tasks],
  )

  const completed = useMemo(
    () =>
      tasks
        .filter((t) => t.done)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [tasks],
  )

  return {
    hydrated,
    tasks,
    open,
    completed,
    openCount: open.length,
    add,
    toggle,
    remove,
  }
}
