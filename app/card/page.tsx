import type { Metadata } from 'next'
import { decodeCard } from '@/lib/card'
import { CardActions } from '@/components/card-actions'

export const metadata: Metadata = {
  title: 'Contact card · FollowApp',
  description: 'Save this contact and stay close with FollowApp.',
}

function initials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  )
}

/**
 * Public card page (/card?c=…). The QR on a user's FollowApp card encodes a
 * link here, so ANY phone camera can open it — not just FollowApp users. The
 * card data travels in the URL, so there's nothing to look up and no public
 * profile store. FollowApp's in-app scanner reads the same QR directly.
 */
export default async function CardPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams
  const card = c ? decodeCard(c) : null

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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl bg-primary p-7 text-primary-foreground shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 font-serif text-2xl font-medium">
            {initials(card.n)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-3xl font-medium leading-tight">
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
              <a href={`tel:${card.p}`} className="block truncate underline-offset-2 active:underline">
                {card.p}
              </a>
            )}
            {card.e && (
              <a href={`mailto:${card.e}`} className="block truncate underline-offset-2 active:underline">
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
