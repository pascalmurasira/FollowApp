'use client'

import { useEffect, useState } from 'react'
import { MeshGradient } from '@paper-design/shaders-react'
import { cn } from '@/lib/utils'

/**
 * Ambient animated mesh-gradient backdrop (Paper Shaders), tuned to FollowApp's
 * warm blue/teal palette rather than the library's default look. It's purely
 * decorative: absolutely positioned to fill its (relative) parent, non-
 * interactive, and hidden from assistive tech.
 *
 * Motion is deliberately subtle + slow. When the user prefers reduced motion we
 * set `speed={0}` (which stops the render loop entirely) and pin a deterministic
 * `frame`, so they still get the rich gradient — just frozen, with zero ongoing
 * GPU cost.
 */

type Variant = 'hero' | 'appbar'

// On-brand color spots. `hero` sits on the warm off-white canvas, so it stays
// pale and text-safe; `appbar` sits on the deep indigo bar, so it leans richer.
const VARIANT_COLORS: Record<Variant, string[]> = {
  hero: ['#e8dcc6', '#b6ccff', '#a3e2da', '#f0dcbe'],
  appbar: ['#3a54e8', '#2b3fb0', '#1f9fa6', '#4a63f0'],
}

interface ShaderBackdropProps {
  variant?: Variant
  /** Override the default palette for this surface. */
  colors?: string[]
  /** Animation speed; kept low for an ambient feel. */
  speed?: number
  distortion?: number
  swirl?: number
  /** Extra classes — typically opacity + a mask for a soft fade. */
  className?: string
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

export function ShaderBackdrop({
  variant = 'hero',
  colors,
  speed = 0.18,
  distortion = 0.8,
  swirl = 0.1,
  className,
}: ShaderBackdropProps) {
  const reducedMotion = usePrefersReducedMotion()
  // Avoid SSR/WebGL hydration mismatches: only mount the canvas on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <MeshGradient
        colors={colors ?? VARIANT_COLORS[variant]}
        distortion={distortion}
        swirl={swirl}
        speed={reducedMotion ? 0 : speed}
        frame={reducedMotion ? 14000 : undefined}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
