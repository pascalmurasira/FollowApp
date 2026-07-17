'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Contact, EnrichmentHook } from '@/lib/types'
import { enqueue } from '@/lib/request-queue'

// Session-only cache of enrichment results, keyed by contact id. Nothing here
// is ever persisted to Neon or the memory layer — it lives for this tab only,
// matching the product's privacy stance about other people's data.
interface EnrichmentCacheEntry {
  fingerprint: string
  hooks: EnrichmentHook[]
}

const sessionCache = new Map<string, EnrichmentCacheEntry>()

type Status = 'idle' | 'loading' | 'done' | 'error'

/** Pulls the company out of a "Role · Company" or "Works at Company" title. */
function companyFromTitle(title?: string): string | undefined {
  if (!title) return undefined
  const dot = title.split('·')[1]?.trim()
  if (dot) return dot
  const at = title.match(/(?:at|@)\s+(.+)$/i)?.[1]?.trim()
  return at || undefined
}

function enrichmentFingerprint(contact: {
  id: string
  name: string
  title?: string
  relationship: string
}): string {
  return JSON.stringify([
    contact.id,
    contact.name,
    contact.title ?? '',
    contact.relationship,
  ])
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
  const fingerprint = enrichmentFingerprint(contact)
  if (
    sessionCache.get(contact.id)?.fingerprint === fingerprint ||
    !contact.name?.trim()
  ) {
    return
  }
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
      sessionCache.set(contact.id, {
        fingerprint,
        hooks: data.hooks ?? [],
      })
    }
  } catch (err) {
    console.error('[v0] Enrichment prime failed:', err)
  }
}

export function useEnrichment(contact: Contact) {
  const fingerprint = enrichmentFingerprint(contact)
  const cached = sessionCache.get(contact.id)
  const [hooks, setHooks] = useState<EnrichmentHook[]>(
    () => (cached?.fingerprint === fingerprint ? cached.hooks : []),
  )
  const [status, setStatus] = useState<Status>(() =>
    cached?.fingerprint === fingerprint ? 'done' : 'idle',
  )
  const requestSequence = useRef(0)
  const activeController = useRef<AbortController | null>(null)

  useEffect(() => {
    requestSequence.current += 1
    activeController.current?.abort()
    const latest = sessionCache.get(contact.id)
    setHooks(latest?.fingerprint === fingerprint ? latest.hooks : [])
    setStatus(latest?.fingerprint === fingerprint ? 'done' : 'idle')
    return () => activeController.current?.abort()
  }, [contact.id, fingerprint])

  const run = useCallback(async () => {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
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
          signal: controller.signal,
        }),
      )
      const data = (await res.json()) as {
        hooks?: EnrichmentHook[]
        status?: 'ok' | 'unavailable'
      }
      // The server distinguishes "found nothing" (ok) from "couldn't run the
      // lookup" (unavailable, e.g. the search model is rate-limited) so the UI
      // can be honest about which one happened.
      if (requestSequence.current !== sequence) return
      if (data.status === 'unavailable') {
        setStatus('error')
        return
      }
      const found = data.hooks ?? []
      sessionCache.set(contact.id, { fingerprint, hooks: found })
      setHooks(found)
      setStatus('done')
    } catch (err) {
      if (controller.signal.aborted || requestSequence.current !== sequence) {
        return
      }
      console.error('[v0] Enrichment failed:', err)
      setStatus('error')
    }
  }, [contact, fingerprint])

  return { hooks, status, run }
}
