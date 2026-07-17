'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { CardData } from '@/lib/card'
import { NativeContactSaveButton } from '@/components/native-contact-save-button'

/**
 * Client actions for the public card page: save the card to the visitor's
 * phone via a vCard, and a CTA into FollowApp. Used by both people who have
 * the app and those who don't.
 */
export function CardActions({ card }: { card: CardData }) {
  return (
    <div className="flex flex-col gap-3">
      <NativeContactSaveButton
        card={card}
        source="public_card"
        idleLabel="Save to my contacts"
        className="primary-action px-5"
      />
      <Link
        href="/"
        className="glass-button pressable flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-[14px] font-medium text-[var(--ink-secondary)]"
      >
        Stay close with FollowApp
        <ArrowRight className="size-4" />
      </Link>
      <p className="text-pretty px-3 text-center text-[11px] leading-relaxed text-[var(--ink-tertiary)]">
        These details were provided by the card owner and are not identity
        verified by FollowApp.
      </p>
    </div>
  )
}
