'use client'

import { useEffect, useState } from 'react'

export type WakeLockState =
  | 'unsupported'
  | 'requesting'
  | 'active'
  | 'unavailable'

export interface ScreenWakeLockHandle {
  release(): Promise<void>
  addEventListener(
    type: 'release',
    listener: () => void,
    options?: { once?: boolean },
  ): void
}

interface ScreenWakeLockLifecycleOptions {
  request: () => Promise<ScreenWakeLockHandle>
  isVisible: () => boolean
  onStateChange: (state: Exclude<WakeLockState, 'unsupported'>) => void
  onError?: (error: unknown) => void
}

/**
 * Serializes browser wake-lock acquisition for one visible surface.
 *
 * Visibility events can arrive several times while Safari still has a
 * request in flight. Coalescing those events is important: two fulfilled
 * requests would otherwise overwrite the one stored sentinel and leak the
 * first lock during cleanup.
 */
export function createScreenWakeLockLifecycle({
  request,
  isVisible,
  onStateChange,
  onError,
}: ScreenWakeLockLifecycleOptions) {
  let stopped = false
  let sentinel: ScreenWakeLockHandle | null = null
  let requestInFlight: Promise<void> | null = null
  let requestQueued = false
  let generation = 0

  const releaseSafely = async (handle: ScreenWakeLockHandle) => {
    try {
      await handle.release()
    } catch (error) {
      onError?.(error)
    }
  }

  const acquire = async (requestGeneration: number) => {
    try {
      const acquired = await request()

      // A request that crossed cleanup or a background transition no longer
      // owns this lifecycle. Release its sentinel even if a newer generation
      // has already acquired another one.
      if (
        stopped ||
        requestGeneration !== generation ||
        !isVisible() ||
        sentinel
      ) {
        await releaseSafely(acquired)
        return
      }

      sentinel = acquired
      onStateChange('active')
      acquired.addEventListener(
        'release',
        () => {
          // Ignore a delayed notification from a sentinel that this lifecycle
          // already released on backgrounding; it must not disturb a newer one.
          if (sentinel !== acquired) return
          sentinel = null
          if (!stopped && isVisible()) {
            onStateChange('unavailable')
            requestNow()
          }
        },
        { once: true },
      )
    } catch (error) {
      onError?.(error)
      if (!stopped && requestGeneration === generation) {
        onStateChange('unavailable')
      }
    }
  }

  function requestNow() {
    if (stopped || !isVisible() || sentinel) return
    if (requestInFlight) {
      requestQueued = true
      return
    }

    onStateChange('requesting')
    const requestGeneration = ++generation
    const operation = acquire(requestGeneration)
    requestInFlight = operation

    void operation.finally(() => {
      if (requestInFlight === operation) requestInFlight = null
      const shouldRetry = requestQueued
      requestQueued = false
      if (shouldRetry && !stopped && isVisible() && !sentinel) requestNow()
    })
  }

  const visibilityChanged = () => {
    if (!isVisible()) {
      // Invalidate a request that was issued before the page was backgrounded.
      generation += 1
      const held = sentinel
      sentinel = null
      if (held) void releaseSafely(held)
      return
    }
    requestNow()
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    requestQueued = false
    generation += 1
    const held = sentinel
    sentinel = null
    if (held) void releaseSafely(held)
  }

  return { start: requestNow, visibilityChanged, stop }
}

/**
 * Keeps a presentation surface awake for as long as it is visible.
 *
 * Safari may release a wake lock whenever the app is backgrounded, so the
 * hook reacquires it on visibility changes. Failure is deliberately quiet:
 * QR sharing remains fully usable on older iOS versions and in web views that
 * don't expose the Screen Wake Lock API.
 */
export function useScreenWakeLock(active: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>('unsupported')

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) {
      setState('unsupported')
      return
    }

    const lifecycle = createScreenWakeLockLifecycle({
      request: () => navigator.wakeLock.request('screen'),
      isVisible: () => document.visibilityState === 'visible',
      onStateChange: setState,
      onError: (error) => {
        // Low Power Mode, an insecure context, or the host web view can deny a
        // request. None of those conditions should block card exchange.
        console.info('[v0] Screen wake lock unavailable:', error)
      },
    })

    lifecycle.start()
    document.addEventListener('visibilitychange', lifecycle.visibilityChanged)

    return () => {
      document.removeEventListener(
        'visibilitychange',
        lifecycle.visibilityChanged,
      )
      lifecycle.stop()
    }
  }, [active])

  return state
}
