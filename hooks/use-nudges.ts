'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Contact } from '@/lib/types'
import { fallbackNudge } from '@/lib/fallback'

export interface Nudge {
  tone: string
  text: string
  fromFallback?: boolean
}

type NudgeMap = Record<string, Nudge>

function buildFallbackMap(contacts: Contact[], voice: string): NudgeMap {
  const map: NudgeMap = {}
  for (const c of contacts) {
    map[c.id] = { ...fallbackNudge(c, voice), fromFallback: true }
  }
  return map
}

export function useNudges(contacts: Contact[], voice: string) {
  const [nudges, setNudges] = useState<NudgeMap>({})
  const [loading, setLoading] = useState(true)
  const [usedFallback, setUsedFallback] = useState(false)
  const requestSequence = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  const fetchNudges = useCallback(async () => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    if (!contacts.length) {
      setNudges({})
      setLoading(false)
      return
    }
    setLoading(true)
    // Seed instant local openers so every card has real text and a live Send
    // button immediately — no waiting on the network for the primary action.
    setNudges((prev) => {
      const seeded = { ...prev }
      for (const c of contacts) {
        if (!seeded[c.id]) seeded[c.id] = { ...fallbackNudge(c, voice), fromFallback: true }
      }
      return seeded
    })
    try {
      const res = await fetch('/api/nudges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice,
          contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            relationship: c.relationship,
            context: c.context,
            interests: c.interests,
            daysSinceContact: c.daysSinceContact,
            lastMessage: c.messages[c.messages.length - 1]?.text,
          })),
        }),
        signal: controller.signal,
      })

      const data = (await res.json()) as {
        nudges?: { contactId: string; tone: string; text: string }[]
      }

      if (requestSequence.current !== sequence) return
      if (data.nudges?.length) {
        const map: NudgeMap = {}
        for (const n of data.nudges) {
          map[n.contactId] = { tone: n.tone, text: n.text }
        }
        // Fill any the model skipped with a local fallback.
        for (const c of contacts) {
          if (!map[c.id]) map[c.id] = { ...fallbackNudge(c, voice), fromFallback: true }
        }
        setNudges(map)
        setUsedFallback(false)
      } else {
        setNudges(buildFallbackMap(contacts, voice))
        setUsedFallback(true)
      }
    } catch (err) {
      if (controller.signal.aborted || requestSequence.current !== sequence) {
        return
      }
      console.error('Nudge generation failed, using fallback:', err)
      setNudges(buildFallbackMap(contacts, voice))
      setUsedFallback(true)
    } finally {
      if (requestSequence.current === sequence) setLoading(false)
    }
  }, [contacts, voice])

  useEffect(() => {
    void fetchNudges()
    return () => activeController.current?.abort()
  }, [fetchNudges])

  return { nudges, loading, usedFallback, refresh: fetchNudges }
}
