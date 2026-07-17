'use client'

import { useEffect, useState } from 'react'
import { decodeCard } from '@/lib/card'
import { CardActions } from '@/components/card-actions'

function initials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  )
}

export function PublicCard({ initialToken }: { initialToken?: string }) {
  const [fragmentToken, setFragmentToken] = useState<string | null>(null)
  const [fragmentRead, setFragmentRead] = useState(Boolean(initialToken))

  useEffect(() => {
    if (initialToken) return
    const readFragment = () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      setFragmentToken(params.get('c'))
      setFragmentRead(true)
    }
    readFragment()
    window.addEventListener('hashchange', readFragment)
    return () => window.removeEventListener('hashchange', readFragment)
  }, [initialToken])

  if (!fragmentRead) {
    return (
      <main className="app-field min-h-dvh" aria-label="Opening contact card" />
    )
  }

  const card = decodeCard(initialToken ?? fragmentToken ?? '')
  if (!card) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          This card link looks broken
        </h1>
        <p className="mt-2 text-pretty text-[14px] leading-relaxed text-muted-foreground">
          Ask for a fresh QR code or link, and try again.
        </p>
      </main>
    )
  }

  const roleLine = [card.t, card.co].filter(Boolean).join(' · ')

  return (
    <main className="app-field mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <span className="field-grain" aria-hidden />
      <div className="primary-action rounded-3xl p-7">
        <div className="flex items-center gap-4">
          <div className="glass-button flex size-16 shrink-0 items-center justify-center rounded-full bg-white/15 font-heading text-2xl font-semibold">
            {initials(card.n)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-3xl font-semibold leading-tight">
              {card.n}
            </p>
            {roleLine && (
              <p className="truncate text-[15px] text-primary-foreground/80">
                {roleLine}
              </p>
            )}
          </div>
        </div>

        {(card.p || card.e) && (
          <div className="mt-5 space-y-1.5 border-t border-primary-foreground/15 pt-5 text-[14px] text-primary-foreground/90">
            {card.p && (
              <a
                href={`tel:${card.p}`}
                className="block truncate underline-offset-2 active:underline"
              >
                {card.p}
              </a>
            )}
            {card.e && (
              <a
                href={`mailto:${card.e}`}
                className="block truncate underline-offset-2 active:underline"
              >
                {card.e}
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mt-8">
        <CardActions card={card} />
      </div>
    </main>
  )
}
