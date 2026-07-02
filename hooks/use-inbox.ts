'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'

export interface LinkView {
  id: string
  otherUserId: string
  otherName: string
  status: 'pending' | 'accepted' | 'declined'
  direction: 'incoming' | 'outgoing'
  intro: string | null
  createdAt: string
}

const POLL_MS = 6000

/**
 * Loads and polls the caller's chat links. Splits them into accepted threads,
 * incoming requests (awaiting the user's response — the badge source), and
 * pending outgoing requests. Only runs when signed in; anonymous users have no
 * links. Visibility-aware so it idles in the background.
 */
export function useInbox() {
  const { data: session } = useSession()
  const signedIn = !!session?.user
  const [links, setLinks] = useState<LinkView[]>([])
  const [loading, setLoading] = useState(signedIn)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    try {
      const res = await fetch('/api/chat/link')
      if (!res.ok) return
      const data = (await res.json()) as { links: LinkView[] }
      setLinks(data.links)
    } catch (err) {
      console.error('[v0] inbox refresh failed:', err)
    } finally {
      setLoading(false)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setLinks([])
      setLoading(false)
      return
    }
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      void refresh()
      timer = setInterval(refresh, POLL_MS)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = () =>
      document.visibilityState === 'visible' ? start() : stop()

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [signedIn, refresh])

  const respond = useCallback(
    async (linkId: string, accept: boolean) => {
      // Optimistic: update locally, then confirm with the server.
      setLinks((prev) =>
        prev.map((l) =>
          l.id === linkId
            ? { ...l, status: accept ? 'accepted' : 'declined' }
            : l,
        ),
      )
      try {
        await fetch('/api/chat/link', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkId, accept }),
        })
      } catch (err) {
        console.error('[v0] respond failed:', err)
      }
      void refresh()
    },
    [refresh],
  )

  const accepted = links.filter((l) => l.status === 'accepted')
  const incoming = links.filter(
    (l) => l.status === 'pending' && l.direction === 'incoming',
  )
  const outgoing = links.filter(
    (l) => l.status === 'pending' && l.direction === 'outgoing',
  )

  return { accepted, incoming, outgoing, loading, signedIn, respond, refresh }
}
