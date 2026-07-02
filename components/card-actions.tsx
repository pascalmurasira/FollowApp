'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Smartphone, ArrowRight } from 'lucide-react'
import type { CardData } from '@/lib/card'
import { saveToPhone } from '@/lib/card'

/**
 * Client actions for the public card page: save the card to the visitor's
 * phone via a vCard, and a CTA into FollowApp. Used by both people who have
 * the app and those who don't.
 */
export function CardActions({ card }: { card: CardData }) {
  const [saved, setSaved] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          saveToPhone(card)
          setSaved(true)
        }}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
      >
        <Smartphone className="size-4" />
        {saved ? 'Opened in Contacts' : 'Save to my contacts'}
      </button>
      <Link
        href="/"
        className="flex min-h-11 w-full items-center justify-center gap-1.5 text-[14px] font-medium text-muted-foreground"
      >
        Stay close with FollowApp
        <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}
