'use client'

import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  nativeAuthDestination,
  nativeAuthMarker,
} from '@/lib/native-auth-url'

/**
 * Universal magic links must be verified inside the Capacitor WebView so the
 * resulting Better Auth cookie belongs to FollowApp, not to mobile Safari.
 */
export function NativeAuthLinkHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let active = true
    let listener: PluginListenerHandle | undefined
    const openAuthLink = (value?: string) => {
      if (!active) return
      const destination = nativeAuthDestination(value)
      const marker = nativeAuthMarker(destination)
      if (!destination || !marker) return

      let consumed = window.name === marker
      try {
        consumed ||= sessionStorage.getItem(marker) === '1'
      } catch {
        // window.name still survives the verification page's full navigation.
      }
      if (consumed) return

      window.name = marker
      try {
        sessionStorage.setItem(marker, '1')
      } catch {
        // The window marker is the storage-disabled fallback.
      }
      if (destination !== window.location.href) {
        window.location.replace(destination)
      }
    }

    void App.getLaunchUrl()
      .then((launch) => openAuthLink(launch?.url))
      .catch(() => undefined)

    void App.addListener('appUrlOpen', ({ url }) => openAuthLink(url))
      .then((handle) => {
        if (active) listener = handle
        else void handle.remove()
      })
      .catch(() => undefined)

    return () => {
      active = false
      void listener?.remove()
    }
  }, [])

  return null
}
