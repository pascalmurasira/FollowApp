'use client'

import { flushSync } from 'react-dom'

function reducedMotionRequested(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Apply a React state update inside the browser View Transition API when it is
 * available and appropriate. Callers never need to coordinate an extra
 * lifecycle or await the animation; unsupported browsers simply run `update`.
 */
export function runViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || reducedMotionRequested()) {
    update()
    return
  }

  const startViewTransition = document.startViewTransition
  if (typeof startViewTransition !== 'function') {
    update()
    return
  }

  let applied = false
  const applyOnce = () => {
    if (applied) return
    applied = true
    flushSync(update)
  }

  try {
    const transition = startViewTransition.call(document, applyOnce)
    void transition.finished.catch(() => {})
  } catch {
    // A browser can reject a transition while another one is active. Never let
    // animation support prevent the underlying product action from completing.
    applyOnce()
  }
}
