'use client'

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'

const DISMISS_KEY = 'nudge.syncPrompt.dismissedUntil.v1'

/** Re-ask this many days after a "Maybe later". */
const SNOOZE_DAYS = 5
/**
 * After the user becomes invested, wait this long before surfacing the sheet,
 * so it never pops the instant they finish an action (e.g. adding a contact).
 * It appears a beat later, or on their next visit.
 */
const SETTLE_MS = 4000

/**
 * Decides when to surface the "Secure your Nudge" magic-link prompt.
 *
 * Investment-driven: the prompt only appears once the user has something worth
 * protecting — never to signed-in users, and not again for a few days after a
 * "Maybe later" dismissal.
 *
 * @param invested whether the user has built up data worth saving (added their
 *   own contacts, or built a streak). Computed by the caller from loaded state.
 */
export function useSyncPrompt(invested: boolean) {
  const { data: session, isPending } = useSession()
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    if (isPending) return
    if (session?.user || !invested) {
      setEligible(false)
      return
    }
    // Respect a recent dismissal.
    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0)
    if (Date.now() < dismissedUntil) {
      setEligible(false)
      return
    }
    const t = setTimeout(() => setEligible(true), SETTLE_MS)
    return () => clearTimeout(t)
  }, [invested, session, isPending])

  const dismiss = () => {
    localStorage.setItem(
      DISMISS_KEY,
      String(Date.now() + SNOOZE_DAYS * 24 * 3600_000),
    )
    setEligible(false)
  }

  return { showSyncPrompt: eligible, dismissSyncPrompt: dismiss }
}
