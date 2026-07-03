'use client'

import { useEffect, useState } from 'react'
import { X, Smartphone, UserPlus, Users, Check, ScanLine, QrCode } from 'lucide-react'
import type { NewContactInput } from '@/lib/contacts-store'
import type { Tier } from '@/lib/types'
import { cn } from '@/lib/utils'

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
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [interests, setInterests] = useState('')
  const [group, setGroup] = useState('')
  const [newGroup, setNewGroup] = useState('')
  const [pickerSupported, setPickerSupported] = useState(false)
  // Name of the last person added while keeping the sheet open (quick-add).
  const [justAdded, setJustAdded] = useState<string | null>(null)

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
      setPhone('')
      setNote('')
      setInterests('')
      setGroup('')
      setNewGroup('')
      setJustAdded(null)
    }
  }, [open])

  if (!open) return null

  const pickFromPhone = async () => {
    try {
      // @ts-expect-error - Contact Picker API is not in the standard lib types.
      const results = await navigator.contacts.select(['name', 'tel'], {
        multiple: false,
      })
      const picked = results?.[0]
      if (!picked) return
      if (picked.name?.[0]) setName(picked.name[0])
      if (picked.tel?.[0]) setPhone(picked.tel[0])
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
      phone: phone || undefined,
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
      setPhone('')
      setNote('')
      setInterests('')
    } else {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-xl font-medium tracking-tight">
            Add someone
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {justAdded && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/[0.06] px-3 py-2.5 text-[13px] font-medium text-primary">
              <Check className="size-4 shrink-0" />
              <span className="text-pretty">
                {justAdded} added. Add the next person below.
              </span>
            </div>
          )}

          {onScan && (
            <button
              type="button"
              onClick={onScan}
              className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
            >
              <ScanLine className="size-4" />
              Scan a business card
            </button>
          )}

          {onScanQr && (
            <button
              type="button"
              onClick={onScanQr}
              className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[15px] font-semibold text-foreground transition-colors active:bg-muted"
            >
              <QrCode className="size-4" />
              Scan a FollowApp card
            </button>
          )}

          {onImport && (
            <>
              <button
                type="button"
                onClick={onImport}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-transform active:scale-[0.98]"
              >
                <Users className="size-4" />
                Import a list (CSV or paste)
              </button>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or add one
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {pickerSupported && (
            <>
              <button
                type="button"
                onClick={pickFromPhone}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/[0.06] px-4 text-sm font-semibold text-primary transition-transform active:scale-[0.98]"
              >
                <Smartphone className="size-4" />
                Pick from my phone
              </button>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or add by hand
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <div className="flex flex-col gap-4">
            <Field label="Name" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Maya Chen"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="How you know them">
              <input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="Former manager"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="Role & company" hint="Optional">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Design Lead · Linear"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="Priority" hint="Sets your follow-up rhythm">
              <div className="flex gap-2">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTier(opt.value)}
                    className={cn(
                      'flex flex-1 flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 transition-colors',
                      tier === opt.value
                        ? 'border-primary bg-primary/[0.08] text-primary'
                        : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-[10px] leading-tight">{opt.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 px-1 text-[12px] text-muted-foreground">
                {`We'll remind you to reach out in ${
                  TIER_OPTIONS.find((o) => o.value === tier)?.reminder ??
                  'about 6 weeks'
                }.`}
              </p>
            </Field>

            <Field label="Phone number">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="+1 415 555 0142"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="Where you left off" hint="Helps FollowApp write something real">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Met at the design conf in May, talked about her move to Linear…"
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base leading-relaxed outline-none focus-visible:border-primary"
              />
            </Field>

            <Field label="What they care about" hint="Comma separated">
              <input
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="design systems, her new role, marathons"
                className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
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
                          'rounded-full border px-3 py-1.5 text-sm transition-colors',
                          group === g && !newGroup
                            ? 'border-primary bg-primary/[0.08] font-medium text-primary'
                            : 'border-border bg-card text-muted-foreground',
                        )}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={newGroup}
                  onChange={(e) => {
                    setNewGroup(e.target.value)
                    if (e.target.value) setGroup('')
                  }}
                  placeholder="Or name a new circle (Family, Work…)"
                  className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus-visible:border-primary"
                />
              </div>
            </Field>
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={!name.trim()}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <UserPlus className="size-4" />
            Add to FollowApp
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={!name.trim()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-primary transition-colors active:bg-primary/[0.06] disabled:opacity-40"
          >
            Save & add another
          </button>
        </footer>
      </div>
    </div>
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
        <span className="text-sm font-medium text-foreground">{label}</span>
        {required && <span className="text-xs text-primary">required</span>}
        {hint && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  )
}
