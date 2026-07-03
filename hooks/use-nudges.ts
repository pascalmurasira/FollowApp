'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Contact } from '@/lib/types'
import { fallbackNudge } from '@/lib/fallback'

export interface Nudge {
  tone: string
  text: string
  fromFallback?: boolean
}

type NudgeMap = Record<string, Nudge>

function buildFallbackMap(contacts: Contact[]): NudgeMap {
  const map: NudgeMap = {}
  for (const c of contacts) {
    map[c.id] = { ...fallbackNudge(c), fromFallback: true }
  }
  return map
}

export function useNudges(contacts: Contact[], voice: string) {
  const [nudges, setNudges] = useState<NudgeMap>({})
  const [loading, setLoading] = useState(true)
  const [usedFallback, setUsedFallback] = useState(false)

  const ids = contacts.map((c) => c.id).join(',')

  const fetchNudges = useCallback(async () => {
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
        if (!seeded[c.id]) seeded[c.id] = { ...fallbackNudge(c), fromFallback: true }
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
      })

      const data = (await res.json()) as {
        nudges?: { contactId: string; tone: string; text: string }[]
      }

      if (data.nudges?.length) {
        const map: NudgeMap = {}
        for (const n of data.nudges) {
          map[n.contactId] = { tone: n.tone, text: n.text }
        }
        // Fill any the model skipped with a local fallback.
        for (const c of contacts) {
          if (!map[c.id]) map[c.id] = { ...fallbackNudge(c), fromFallback: true }
        }
        setNudges(map)
        setUsedFallback(false)
      } else {
        setNudges(buildFallbackMap(contacts))
        setUsedFallback(true)
      }
    } catch (err) {
      console.error('Nudge generation failed, using fallback:', err)
      setNudges(buildFallbackMap(contacts))
      setUsedFallback(true)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, voice])

  useEffect(() => {
    fetchNudges()
  }, [fetchNudges])

  return { nudges, loading, usedFallback, refresh: fetchNudges }
}
