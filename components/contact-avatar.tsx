import type { Contact } from '@/lib/types'
import { cn } from '@/lib/utils'

// Tonal, low-chroma fills with deeper initials — calmer and more editorial
// than saturated circles. Each pairs a soft tint with a confident ink.
const HUE_STYLES: Record<Contact['avatarHue'], string> = {
  coral: 'bg-[oklch(0.9_0.045_37)] text-[oklch(0.46_0.12_37)]',
  teal: 'bg-[oklch(0.91_0.035_180)] text-[oklch(0.43_0.07_190)]',
  amber: 'bg-[oklch(0.92_0.05_82)] text-[oklch(0.46_0.08_70)]',
  rose: 'bg-[oklch(0.92_0.038_18)] text-[oklch(0.47_0.1_18)]',
  sage: 'bg-[oklch(0.91_0.035_155)] text-[oklch(0.43_0.06_158)]',
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function ContactAvatar({
  contact,
  size = 'md',
}: {
  contact: Contact
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClasses = {
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-14 text-base',
  }[size]

  if (contact.photoUrl) {
    return (
      <img
        src={contact.photoUrl || '/placeholder.svg'}
        alt=""
        aria-hidden="true"
        className={cn(
          'shrink-0 rounded-full object-cover ring-1 ring-inset ring-foreground/[0.06]',
          sizeClasses,
        )}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold font-heading tracking-tight ring-1 ring-inset ring-foreground/[0.06]',
        HUE_STYLES[contact.avatarHue],
        sizeClasses,
      )}
    >
      {initials(contact.name)}
    </div>
  )
}
