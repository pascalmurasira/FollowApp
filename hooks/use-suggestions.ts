'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const enrichmentKey = JSON.stringify(enrichment)
  const enrichmentPayload = useMemo(
    () => JSON.parse(enrichmentKey) as string[],
    [enrichmentKey],
  )
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const requestSequence = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  // Re-fetch whenever the latest message changes so suggestions stay relevant.
  const messages = contact.messages
  const fallbackSuggestions = useMemo(() => {
    const lastFromThem = [...messages]
      .reverse()
      .find((m) => m.sender === 'them')?.text
    return fallbackReplies(contact, lastFromThem)
  }, [contact, messages])

  const fetchSuggestions = useCallback(async () => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    setLoading(true)
    // Seed instant local suggestions so the chips are tappable immediately,
    // then upgrade to AI ones when they arrive.
    setSuggestions(fallbackSuggestions)
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
            enrichment: enrichmentPayload,
          }),
          signal: controller.signal,
        }),
      )
      const data = (await res.json()) as { suggestions?: Suggestion[] }
      if (requestSequence.current !== sequence) return
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions)
      } else {
        setSuggestions(fallbackSuggestions)
      }
    } catch (err) {
      if (controller.signal.aborted || requestSequence.current !== sequence) {
        return
      }
      console.error('Suggestion generation failed, using fallback:', err)
      setSuggestions(fallbackSuggestions)
    } finally {
      if (requestSequence.current === sequence) setLoading(false)
    }
  }, [
    contact,
    enrichmentPayload,
    fallbackSuggestions,
    voice,
  ])

  useEffect(() => {
    if (enabled) void fetchSuggestions()
    return () => activeController.current?.abort()
  }, [enabled, fetchSuggestions])

  return { suggestions, loading, refresh: fetchSuggestions }
}
