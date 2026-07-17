'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import type { Contact } from '@/lib/types'

export interface ContactMatch {
  otherUserId?: string
  otherName: string
  link: { id: string; status: 'pending' | 'accepted' | 'declined'; direction: 'incoming' | 'outgoing' } | null
}

/**
 * Checks whether a contact (by verified account email) is a real FollowApp user the
 * signed-in caller can chat with, and exposes a `requestChat` action. Only
 * runs when signed in and the contact has an email — otherwise it
 * silently reports "no match" and the UI keeps the WhatsApp/SMS handoff.
 */
export function useContactMatch(contact: Contact) {
  const { data: session } = useSession()
  const signedIn = !!session?.user
  const email = contact.email?.trim() || null
  const canMatch = signedIn && !!email

  const [match, setMatch] = useState<ContactMatch | null>(null)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async () => {
    if (!canMatch) {
      setMatch(null)
      return
    }
    setChecking(true)
    try {
      const res = await fetch('/api/chat/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        setMatch(null)
        return
      }
      const data = (await res.json()) as
        | { matched: false }
        | { matched: true; otherUserId?: string; otherName?: string; link: ContactMatch['link'] }
      setMatch(
        data.matched
          ? {
              otherUserId: data.otherUserId,
              otherName: data.otherName || contact.name,
              link: data.link,
            }
          : null,
      )
    } catch (err) {
      console.error('[v0] match check failed:', err)
      setMatch(null)
    } finally {
      setChecking(false)
    }
  }, [canMatch, email, contact.name])

  useEffect(() => {
    void check()
  }, [check])

  const requestChat = useCallback(
    async (intro?: string) => {
      if (!match) return
      try {
        const res = await fetch('/api/chat/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, intro }),
        })
        if (res.ok) {
          const data = (await res.json()) as {
            link: { id: string; status: ContactMatch['link'] extends null ? never : 'pending' | 'accepted' | 'declined'; direction: 'incoming' | 'outgoing' }
          }
          setMatch((prev) => (prev ? { ...prev, link: data.link } : prev))
        }
      } catch (err) {
        console.error('[v0] requestChat failed:', err)
      }
    },
    [email, match],
  )

  return { match, checking, requestChat, recheck: check }
}
