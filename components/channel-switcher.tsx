'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Contact } from '@/lib/types'
import {
  channelLabel,
  resolveChannel,
  selectableChannels,
  type ChannelId,
} from '@/lib/channels'
import { ChannelIcon } from '@/components/channel-icon'
import { cn } from '@/lib/utils'

export function ChannelSwitcher({
  contact,
  preferred,
  onChange,
}: {
  contact: Contact
  preferred?: ChannelId
  onChange: (channel: ChannelId) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = resolveChannel(contact, preferred)
  const options = selectableChannels(contact)

  // Close the menu on any outside tap.
  useEffect(() => {
    if (!open) return
    const handle = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [open])

  // Nothing to switch between — show a static label instead of a control.
  if (options.length === 0) {
    return (
      <span className="rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        No send channel
      </span>
    )
  }

  if (options.length <= 1) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <ChannelIcon channel={active} className="size-3 text-accent" />
        {channelLabel(active)}
      </span>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sending via ${channelLabel(active)}. Change channel.`}
        className="flex min-h-11 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors active:bg-muted"
      >
        <ChannelIcon channel={active} className="size-3.5 text-accent" />
        {channelLabel(active)}
        <ChevronDown
          className={cn('size-3 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.375rem)] z-20 w-44 overflow-hidden rounded-2xl border border-border bg-popover p-1 shadow-card-lg"
        >
          {options.map((id) => {
            const selected = id === active
            return (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(id)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors active:bg-muted',
                  selected ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <ChannelIcon channel={id} className="size-4 shrink-0 text-accent" />
                <span className="flex-1 capitalize">{channelLabel(id)}</span>
                {selected && <Check className="size-4 text-primary" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
