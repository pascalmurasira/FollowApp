'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ChannelId } from '@/lib/channels'

const STORAGE_KEY = 'nudge.channelPrefs.v1'

type PrefMap = Record<string, ChannelId>

/** Read the whole preference map. Safe to call during render (sync). */
function readPrefs(): PrefMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PrefMap) : {}
  } catch (error) {
    console.error('Failed to load channel preferences:', error)
    return {}
  }
}

/** Synchronous getter for one contact — used where a hook would be overkill. */
export function getChannelPref(contactId: string): ChannelId | undefined {
  return readPrefs()[contactId]
}

/**
 * Per-contact preferred delivery channel, persisted in localStorage. Returns
 * the current preference (or undefined to use the smart default) plus a setter.
 */
export function useChannelPref(
  contactId: string,
): [ChannelId | undefined, (channel: ChannelId) => void] {
  const [pref, setPref] = useState<ChannelId | undefined>(undefined)

  useEffect(() => {
    setPref(readPrefs()[contactId])
  }, [contactId])

  const update = useCallback(
    (channel: ChannelId) => {
      setPref(channel)
      const next = { ...readPrefs(), [contactId]: channel }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch (error) {
        console.error('Failed to save channel preference:', error)
      }
    },
    [contactId],
  )

  return [pref, update]
}
