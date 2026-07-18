'use client'

import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import {
  shouldDeliverSystemEntry,
  systemEntryAction,
  type SystemEntryAction,
  type SystemEntryDelivery,
} from '@/lib/system-entry'
import {
  consumeNativeSystemEntryPoint,
  listenForNativeSystemEntryPoints,
} from '@/lib/native'

/** Deliver native shortcuts, controls, and Live Activity links to app UI. */
export function useSystemEntry(
  onAction: (action: SystemEntryAction) => void,
): void {
  const callback = useRef(onAction)
  const lastDelivery = useRef<SystemEntryDelivery | null>(null)

  useEffect(() => {
    callback.current = onAction
  }, [onAction])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let active = true
    let listener: PluginListenerHandle | undefined
    let removeNativeListener: (() => void) | undefined
    const open = (rawUrl?: string) => {
      if (!active || !rawUrl) return
      const action = systemEntryAction(rawUrl)
      if (!action) return

      // A cold launch can surface the same intent through both Capacitor's URL
      // callback and the native retained-entry bridge. Treat that as one user
      // action so a Lock Screen image is never consumed by one callback and
      // then replaced by an empty second handoff.
      const now = Date.now()
      const previous = lastDelivery.current
      if (!shouldDeliverSystemEntry(previous, action, now)) return
      lastDelivery.current = { action, deliveredAt: now }
      callback.current(action)
    }

    void App.getLaunchUrl()
      .then((launch) => open(launch?.url))
      .catch(() => undefined)

    // App Intents and the locked-camera handoff can open the containing app
    // without a conventional URL callback. The native bridge retains one
    // content-free route so a cold launch cannot lose the requested action.
    void consumeNativeSystemEntryPoint()
      .then((entryPoint) => open(entryPoint?.url))
      .catch(() => undefined)

    void App.addListener('appUrlOpen', ({ url }) => open(url))
      .then((handle) => {
        if (active) listener = handle
        else void handle.remove()
      })
      .catch(() => undefined)

    void listenForNativeSystemEntryPoints((entryPoint) => open(entryPoint.url))
      .then((remove) => {
        if (active) removeNativeListener = remove
        else remove()
      })
      .catch(() => undefined)

    return () => {
      active = false
      void listener?.remove()
      removeNativeListener?.()
    }
  }, [])
}
