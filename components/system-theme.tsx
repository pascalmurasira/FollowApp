'use client'

import { useEffect } from 'react'

/** Keeps the document theme in sync when the device appearance changes. */
export function SystemTheme() {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      document.documentElement.classList.toggle('dark', query.matches)
      document.documentElement.style.colorScheme = query.matches
        ? 'dark'
        : 'light'
    }

    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  return null
}
