'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Smartphone,
  UserPlus,
  Users,
  Check,
  ScanLine,
  QrCode,
  CalendarDays,
  ChevronDown,
} from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import { todayDateInputValue } from '@/lib/contact-dates'
import { cn } from '@/lib/utils'
import { trackProductEvent } from '@/lib/product-analytics'
import { CONTACT_LIMITS } from '@/lib/persistence-limits'
import { useModalFocus } from '@/hooks/use-modal-focus'

const TIER_OPTIONS: {
  value: Tier
  label: string
  hint: string
  /** Plain-language first-reminder timing for the follow-up preview. */
  reminder: string
}[] = [
  { value: 'key', label: 'Key', hint: 'every ~3 weeks', reminder: 'about 3 weeks' },
  { value: 'network', label: 'Network', hint: 'every ~6 weeks', reminder: 'about 6 weeks' },
  { value: 'casual', label: 'Casual', hint: 'every ~3 months', reminder: 'about 3 months' },
]

/** Feature-detect the browser Contact Picker API (Chrome on Android, etc.). */
function contactPickerSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    'ContactsManager' in window
  )
}

export function AddContactSheet({
  open,
  existingGroups,
  onClose,
  onAdd,
  onImport,
  onScan,
  onScanQr,
}: {
  open: boolean
  existingGroups: string[]
  onClose: () => void
  onAdd: (input: NewContactInput) => void
  onImport?: () => void
  onScan?: () => void
  onScanQr?: () => void
}) {
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [title, setTitle] = useState('')
  const [tier, setTier] = useState<Tier>('network')
  const [lastContactedAt, setLastContactedAt] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [interests, setInterests] = useState('')
  const [group, setGroup] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [pickerSupported, setPickerSupported] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Name of the last person added while keeping the sheet open (quick-add).
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const { portalRoot, dialogRef, modalRootRef } = useModalFocus(open, onClose)

  useEffect(() => {
    setPickerSupported(contactPickerSupported())
  }, [])

  // Reset fields whenever the sheet is opened fresh.
  useEffect(() => {
    if (open) {
      setName('')
      setRelationship('')
      setTitle('')
      setTier('network')
      setLastContactedAt('')
      setPhone('')
      setEmail('')
      setNote('')
      setInterests('')
      setGroup('')
      setNewGroup('')
      setJustAdded(null)
      setManualOpen(false)
      setDetailsOpen(false)
    }
  }, [open])

  if (!open || !portalRoot) return null

  const pickFromPhone = async () => {
    try {
      // @ts-expect-error - Contact Picker API is not in the standard lib types.
      const results = await navigator.contacts.select(['name', 'tel', 'email'], {
        multiple: false,
      })
      const picked = results?.[0]
      if (!picked) return
      if (picked.name?.[0]) setName(picked.name[0])
      if (picked.tel?.[0]) setPhone(picked.tel[0])
      if (picked.email?.[0]) setEmail(picked.email[0])
      setManualOpen(true)
      trackProductEvent('contact_entry_selected', { method: 'phone_picker' })
    } catch (error) {
      // User cancelled or denied — nothing to do.
      console.error('[v0] Contact picker cancelled or failed:', error)
    }
  }

  const submit = (keepOpen = false) => {
    if (!name.trim()) return
    const chosenGroup = newGroup.trim() || group || undefined
    onAdd({
      name,
      relationship,
      title: title || undefined,
      tier,
      lastContactedAt: lastContactedAt || null,
      phone: phone || undefined,
      email: email || undefined,
      context: note || undefined,
      interests: interests
        ? interests.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      group: chosenGroup,
    })

    if (keepOpen) {
      // Rapid entry (e.g. after a conference): clear who-they-are fields but
      // keep the chosen tier and circle so the next person is fast to add.
      setJustAdded(name.trim())
      setName('')
      setRelationship('')
      setTitle('')
      setLastContactedAt('')
      setPhone('')
      setEmail('')
      setNote('')
      setInterests('')
    } else {
      onClose()
    }
    trackProductEvent('manual_contact_saved', {
      keep_open: keepOpen,
      has_phone: Boolean(phone.trim()),
      has_email: Boolean(email.trim()),
      has_optional_details: Boolean(
        relationship.trim() || title.trim() || note.trim() || interests.trim(),
      ),
    })
  }

  const openManual = () => {
    setManualOpen(true)
    trackProductEvent('contact_entry_selected', { method: 'manual' })
    requestAnimationFrame(() =>
      document.getElementById('manual-contact-name')?.focus(),
    )
  }

  return createPortal(
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-contact-sheet-title"
        tabIndex={-1}
        className="app-field relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl outline-none"
      >
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <h2
            id="add-contact-sheet-title"
            className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]"
          >
            Add contact
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="glass-button pressable flex size-11 items-center justify-center rounded-full text-[var(--ink-secondary)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {justAdded && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--status-on-track)]/30 bg-[var(--status-on-track-tint)] px-3 py-2.5 text-[13px] font-medium text-[var(--status-on-track)]">
              <Check className="size-4 shrink-0" />
              <span className="text-pretty">
                {justAdded} added. Add the next person below.
              </span>
            </div>
          )}

          {!manualOpen && onScan && (
            <section className="glass-hero mb-4 flex items-center gap-3 rounded-3xl p-3.5 text-left">
              <span className="primary-action flex size-11 shrink-0 items-center justify-center rounded-2xl">
                <ScanLine className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-[var(--ink-strong)]">
                  Have a business card?
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                  Scan it and jump straight to a follow-up.
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  trackProductEvent('contact_entry_selected', {
                    method: 'business_card',
                  })
                  onScan()
                }}
                aria-label="Scan card with camera"
                className="primary-action pressable flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <ScanLine className="size-4" />
              </button>
            </section>
          )}

          {!manualOpen && <div className="glass-card mb-4 overflow-hidden">
            {onScanQr && (
              <button
                type="button"
                onClick={() => {
                  trackProductEvent('contact_entry_selected', { method: 'qr' })
                  onScanQr()
                }}
                className="pressable flex w-full items-center gap-3 border-b border-[var(--hairline)] px-4 py-3.5 text-left"
              >
                <QrCode className="size-5 text-[var(--ink-secondary)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--ink-strong)]">
                    Scan a FollowApp card
                  </span>
                  <span className="block text-xs text-[var(--ink-secondary)]">
                    Add someone from their QR
                  </span>
                </span>
              </button>
            )}

          {onImport && (
            <>
              <button
                type="button"
                onClick={() => {
                  trackProductEvent('contact_entry_selected', { method: 'import' })
                  onImport()
                }}
                className="pressable flex w-full items-center gap-3 border-b border-[var(--hairline)] px-4 py-3.5 text-left"
              >
                <Users className="size-5 text-[var(--ink-secondary)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--ink-strong)]">
                    Import a list
                  </span>
                  <span className="block text-xs text-[var(--ink-secondary)]">
                    Paste or upload contacts to track
                  </span>
                </span>
              </button>
            </>
          )}
              <button
                type="button"
                onClick={openManual}
              className="pressable flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              <UserPlus className="size-5 text-[var(--ink-secondary)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--ink-strong)]">
                  Enter manually
                </span>
                <span className="block text-xs text-[var(--ink-secondary)]">
                  Name, number, where you met
                </span>
              </span>
            </button>
          </div>}

          {pickerSupported && !manualOpen && (
            <>
              <button
                type="button"
                onClick={pickFromPhone}
                className="glass-button pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)]"
              >
                <Smartphone className="size-4" />
                Pick from my phone
              </button>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--ink-tertiary)]">
                <span className="h-px flex-1 bg-border" />
                or add by hand
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {manualOpen && <div className="flex flex-col gap-4">
            <Field label="Name" required>
              <input
                value={name}
                maxLength={CONTACT_LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Maya Chen"
                id="manual-contact-name"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field
              label="Last spoke or met"
              hint="Leave blank if never"
            >
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-tertiary)]" />
                <input
                  value={lastContactedAt}
                  onChange={(e) => setLastContactedAt(e.target.value)}
                  type="date"
                  max={todayDateInputValue()}
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 pl-10 pr-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </div>
              <p className="mt-1.5 px-1 text-[12px] text-[var(--ink-secondary)]">
                {lastContactedAt
                  ? 'FollowApp will time reminders from this date.'
                  : 'No date means ready for a first follow-up.'}
              </p>
            </Field>

            <Field label="Phone number">
              <input
                value={phone}
                maxLength={CONTACT_LIMITS.phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+1 415 555 0142"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field label="Email">
              <input
                value={email}
                maxLength={CONTACT_LIMITS.email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                placeholder="maya@company.com"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              className="glass-button pressable flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-[var(--ink-strong)]">
                  Add optional details
                </span>
                <span className="block text-[12px] text-[var(--ink-secondary)]">
                  {`Follow up ${lastContactedAt ? 'on your rhythm' : 'now'}, then ${
                    TIER_OPTIONS.find((option) => option.value === tier)?.hint ??
                    'every ~6 weeks'
                  }`}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'size-5 text-[var(--ink-tertiary)] transition-transform',
                  detailsOpen && 'rotate-180',
                )}
              />
            </button>

            {detailsOpen && <div className="flex flex-col gap-4 rounded-2xl border border-[var(--hairline)] bg-white/10 p-3.5">
            <Field label="How you know them">
              <input
                value={relationship}
                maxLength={CONTACT_LIMITS.relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="Former manager"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field label="Role & company" hint="Optional">
              <input
                value={title}
                maxLength={CONTACT_LIMITS.title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Design Lead · Linear"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field label="Follow-up rhythm">
              <div className="flex gap-2">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTier(opt.value)}
                    className={cn(
                      'pressable flex flex-1 flex-col items-center gap-0.5 rounded-[var(--r-chip)] border px-2 py-2.5 transition-colors',
                      tier === opt.value
                        ? 'border-[var(--action-bg)] bg-[var(--action-bg)] text-[var(--action-fg)]'
                        : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                    )}
                  >
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-[10px] leading-tight">{opt.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 px-1 text-[12px] text-[var(--ink-secondary)]">
                {`FollowApp will offer a reminder in ${
                  TIER_OPTIONS.find((o) => o.value === tier)?.reminder ??
                  'about 6 weeks'
                }.`}
              </p>
            </Field>

            <Field label="Where you left off" hint="Helps FollowApp write something real">
              <textarea
                value={note}
                maxLength={CONTACT_LIMITS.context}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Met at the design conf in May, talked about her move to Linear…"
                className="w-full resize-none rounded-xl border border-[var(--hairline)] bg-white/25 px-4 py-3 text-base leading-relaxed outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field label="What they care about" hint="Comma separated">
              <input
                value={interests}
                maxLength={
                  CONTACT_LIMITS.interests * (CONTACT_LIMITS.interest + 1)
                }
                onChange={(e) => setInterests(e.target.value)}
                placeholder="design systems, her new role, marathons"
                className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
              />
            </Field>

            <Field label="Circle" hint="Optional — group them with others">
              <div className="flex flex-col gap-2">
                {existingGroups.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {existingGroups.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setGroup((prev) => (prev === g ? '' : g))
                          setNewGroup('')
                        }}
                        className={cn(
                          'pressable rounded-full border px-3 py-1.5 text-sm transition-colors',
                          group === g && !newGroup
                            ? 'border-[var(--action-bg)] bg-[var(--action-bg)] font-medium text-[var(--action-fg)]'
                            : 'border-[var(--glass-border)] bg-white/25 text-[var(--ink-secondary)]',
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={newGroup}
                  maxLength={CONTACT_LIMITS.group}
                  onChange={(e) => {
                    setNewGroup(e.target.value)
                    if (e.target.value) setGroup('')
                  }}
                  placeholder="Or name a new circle (Family, Work…)"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </div>
            </Field>
            </div>}
          </div>}
        </div>

        {manualOpen && <footer className="relative z-[1] flex flex-col gap-2 border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={!name.trim()}
            className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40"
          >
            <UserPlus className="size-4" />
            Save contact to FollowApp
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={!name.trim()}
            className="glass-button pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-[var(--ink-strong)] disabled:opacity-40"
          >
            Save & add another
          </button>
        </footer>}
      </section>
    </div>,
    portalRoot,
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-2 px-1">
        <span className="text-[13px] font-semibold text-[var(--ink-secondary)]">{label}</span>
        {required && <span className="text-xs text-[var(--ink-secondary)]">required</span>}
        {hint && (
          <span className="ml-auto text-[11px] text-[var(--ink-secondary)]">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
