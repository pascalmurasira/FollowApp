'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Contact, Suggestion } from '@/lib/types'
import { enqueue } from '@/lib/request-queue'
import { fallbackReplies } from '@/lib/fallback'

interface Options {
  enabled?: boolean
  /** User-approved recent news hooks to weave into the generated openers. */
  enrichment?: string[]
}

export function useSuggestions(
  contact: Contact,
  voice: string,
  { enabled = true, enrichment = [] }: Options = {},
) {
  // Stable dependency so suggestions refetch when the chosen hooks change.
  const enrichmentKey = enrichment.join('|')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  // Re-fetch whenever the latest message changes so suggestions stay relevant.
  const messages = contact.messages
  const lastMessage = messages[messages.length - 1]
  const lastMessageId = lastMessage?.id ?? 'none'

  const applyFallback = useCallback(() => {
    const lastFromThem = [...messages]
      .reverse()
      .find((m) => m.sender === 'them')?.text
    return fallbackReplies(contact, lastFromThem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, lastMessageId])

  const fetchSuggestions = useCallback(async () => {
    setLoading(true)
    // Seed instant local suggestions so the chips are tappable immediately,
    // then upgrade to AI ones when they arrive.
    setSuggestions(applyFallback())
    try {
      const res = await enqueue(() =>
        fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: contact.name,
            relationship: contact.relationship,
            context: contact.context,
            interests: contact.interests,
            daysSinceContact: contact.daysSinceContact,
            voice,
            recentMessages: contact.messages
              .slice(-8)
              .map((m) => ({ sender: m.sender, text: m.text })),
            enrichment,
          }),
        }),
      )
      const data = (await res.json()) as { suggestions?: Suggestion[] }
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions)
      } else {
        setSuggestions(applyFallback())
      }
    } catch (err) {
      console.error('Suggestion generation failed, using fallback:', err)
      setSuggestions(applyFallback())
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, lastMessageId, voice, enrichmentKey, applyFallback])

  useEffect(() => {
    if (enabled) fetchSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fetchSuggestions])

  return { suggestions, loading, refresh: fetchSuggestions }
}
