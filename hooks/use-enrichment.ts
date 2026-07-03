'use client'

import { useCallback, useState } from 'react'
import type { Contact, EnrichmentHook } from '@/lib/types'
import { enqueue } from '@/lib/request-queue'

// Session-only cache of enrichment results, keyed by contact id. Nothing here
// is ever persisted to Neon or the memory layer — it lives for this tab only,
// matching the product's privacy stance about other people's data.
const sessionCache = new Map<string, EnrichmentHook[]>()

type Status = 'idle' | 'loading' | 'done' | 'error'

/** Pulls the company out of a "Role · Company" or "Works at Company" title. */
function companyFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  const dot = title.split('·')[1]?.trim()
  if (dot) return dot
  const at = title.match(/(?:at|@)\s+(.+)$/i)?.[1]?.trim()
  return at || undefined
}

/**
 * Warm the session cache for a contact in the background (e.g. right after a
 * business-card scan) so recent-news hooks are ready the moment its
 * conversation opens. Silent and best-effort: never throws, skips if already
 * cached, and only stores a successful ("ok") lookup.
 */
export async function primeEnrichment(contact: {
  id: string
  name: string
  title?: string
  relationship: string
}): Promise<void> {
  if (sessionCache.has(contact.id) || !contact.name?.trim()) return
  try {
    const res = await enqueue(() =>
      fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contact.name,
          title: contact.title,
          company: companyFromTitle(contact.title),
          relationship: contact.relationship,
        }),
      }),
    )
    const data = (await res.json()) as {
      hooks?: EnrichmentHook[]
      status?: 'ok' | 'unavailable'
    }
    if (data.status === 'ok') {
      sessionCache.set(contact.id, data.hooks ?? [])
    }
  } catch (err) {
    console.error('[v0] Enrichment prime failed:', err)
  }
}

export function useEnrichment(contact: Contact) {
  const [hooks, setHooks] = useState<EnrichmentHook[]>(
    () => sessionCache.get(contact.id) ?? [],
  )
  const [status, setStatus] = useState<Status>(() =>
    sessionCache.has(contact.id) ? 'done' : 'idle',
  )

  const run = useCallback(async () => {
    setStatus('loading')
    try {
      const res = await enqueue(() =>
        fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: contact.name,
            title: contact.title,
            company: companyFromTitle(contact.title),
            relationship: contact.relationship,
          }),
        }),
      )
      const data = (await res.json()) as {
        hooks?: EnrichmentHook[]
        status?: 'ok' | 'unavailable'
      }
      // The server distinguishes "found nothing" (ok) from "couldn't run the
      // lookup" (unavailable, e.g. the search model is rate-limited) so the UI
      // can be honest about which one happened.
      if (data.status === 'unavailable') {
        setStatus('error')
        return
      }
      const found = data.hooks ?? []
      sessionCache.set(contact.id, found)
      setHooks(found)
      setStatus('done')
    } catch (err) {
      console.error('[v0] Enrichment failed:', err)
      setStatus('error')
    }
  }, [contact.id, contact.name, contact.title, contact.relationship])

  return { hooks, status, run }
}
