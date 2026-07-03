'use client'

import { useRef, useState } from 'react'
import { X, Upload, ClipboardList, FileText, Check } from 'lucide-react'
import {
  parseContactsCsv,
  parseContactsText,
  type ImportSource,
  type ParsedContact,
} from '@/lib/import-contacts'
import type { Tier } from '@/lib/types'
import { cn } from '@/lib/utils'

const SOURCE_LABEL: Record<ImportSource, string> = {
  linkedin: 'LinkedIn export',
  google: 'Google Contacts',
  generic: 'CSV file',
  text: 'pasted list',
}

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: 'key', label: 'Key' },
  { value: 'network', label: 'Network' },
  { value: 'casual', label: 'Casual' },
]

type Mode = 'upload' | 'paste'

// On phones (coarse pointer), picking a CSV from the Files app is awkward, so
// paste is the friendlier default. Desktop keeps file upload as the power path.
function defaultMode(): Mode {
  if (typeof window === 'undefined') return 'upload'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const touch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window
  // UA fallback catches mobile browsers that under-report pointer/touch.
  const mobileUa = /iphone|ipad|ipod|android/i.test(navigator.userAgent)
  return coarse || touch || mobileUa ? 'paste' : 'upload'
}

export function ImportContactsSheet({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (contacts: ParsedContact[], tier: Tier) => Promise<number> | number
}) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<ParsedContact[] | null>(null)
  const [source, setSource] = useState<ImportSource>('generic')
  const [included, setIncluded] = useState<Record<number, boolean>>({})
  const [tier, setTier] = useState<Tier>('network')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const reset = () => {
    setMode(defaultMode())
    setPasteText('')
    setParsed(null)
    setSource('generic')
    setIncluded({})
    setTier('network')
    setError(null)
    setSaving(false)
  }

  const close = () => {
    reset()
    onClose()
  }

  const showReview = (contacts: ParsedContact[], src: ImportSource) => {
    if (contacts.length === 0) {
      setError('No contacts found. Check the file or paste names one per line.')
      return
    }
    setError(null)
    setParsed(contacts)
    setSource(src)
    // Include everyone by default.
    const all: Record<number, boolean> = {}
    contacts.forEach((_, i) => (all[i] = true))
    setIncluded(all)
  }

  const handleFile = async (file: File) => {
    try {
      const text = await file.text()
      const result = parseContactsCsv(text)
      showReview(result.contacts, result.source)
    } catch (err) {
      console.error('[v0] CSV read failed:', err)
      setError('Could not read that file. Make sure it is a .csv export.')
    }
  }

  const handlePaste = () => {
    const result = parseContactsText(pasteText)
    showReview(result.contacts, result.source)
  }

  const includedCount = parsed
    ? Object.values(included).filter(Boolean).length
    : 0

  const confirm = async () => {
    if (!parsed) return
    const chosen = parsed.filter((_, i) => included[i])
    if (chosen.length === 0) return
    setSaving(true)
    await onImport(chosen, tier)
    setSaving(false)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div className="relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-serif text-xl font-medium tracking-tight">
            {parsed ? 'Review import' : 'Import contacts'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {!parsed ? (
            <>
              {/* Mode tabs */}
              <div className="mb-4 flex gap-2 rounded-full bg-muted p-1">
                <TabButton
                  active={mode === 'upload'}
                  onClick={() => setMode('upload')}
                  icon={<Upload className="size-4" />}
                  label="Upload file"
                />
                <TabButton
                  active={mode === 'paste'}
                  onClick={() => setMode('paste')}
                  icon={<ClipboardList className="size-4" />}
                  label="Paste"
                />
              </div>

              {mode === 'upload' ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center transition-colors active:bg-muted"
                  >
                    <FileText className="size-7 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Choose a .csv file
                    </span>
                    <span className="text-[12px] leading-snug text-muted-foreground text-pretty">
                      Works with LinkedIn connections, Google Contacts, or any
                      CSV with name and company columns.
                    </span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleFile(file)
                      e.target.value = ''
                    }}
                  />
                  <p className="px-1 text-[12px] leading-relaxed text-muted-foreground text-pretty">
                    Tip: in LinkedIn, go to Settings → Data privacy → Get a copy
                    of your data → Connections to download your CSV.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={7}
                    placeholder={
                      'One per line, e.g.\nMaya Chen, Design Lead at Linear, maya@linear.app\nSam Park - PM, Vercel'
                    }
                    className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base leading-relaxed outline-none focus-visible:border-primary"
                  />
                  <button
                    type="button"
                    onClick={handlePaste}
                    disabled={!pasteText.trim()}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
                  >
                    Review {pasteText.trim() ? '' : 'contacts'}
                  </button>
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-muted-foreground">
                  Found{' '}
                  <span className="font-semibold text-foreground">
                    {parsed.length}
                  </span>{' '}
                  from your {SOURCE_LABEL[source]}.
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="text-[13px] font-medium text-primary"
                >
                  Start over
                </button>
              </div>

              {/* Default tier */}
              <div>
                <p className="mb-1.5 px-1 text-sm font-medium text-foreground">
                  Set everyone as
                </p>
                <div className="flex gap-2">
                  {TIER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTier(opt.value)}
                      className={cn(
                        'flex-1 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors',
                        tier === opt.value
                          ? 'border-primary bg-primary/[0.08] text-primary'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                  You can change anyone&apos;s priority later.
                </p>
              </div>

              {/* Contact list */}
              <ul className="flex flex-col gap-1.5">
                {parsed.map((c, i) => (
                  <li key={`${c.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() =>
                        setIncluded((prev) => ({ ...prev, [i]: !prev[i] }))
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                        included[i]
                          ? 'border-primary/40 bg-primary/[0.04]'
                          : 'border-border bg-card opacity-55',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-md border',
                          included[i]
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40',
                        )}
                      >
                        {included[i] && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-foreground">
                          {c.name}
                        </span>
                        {(c.title || c.email) && (
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {c.title ?? c.email}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {parsed && (
          <footer className="border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={confirm}
              disabled={includedCount === 0 || saving}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {saving
                ? 'Importing…'
                : `Import ${includedCount} ${includedCount === 1 ? 'contact' : 'contacts'}`}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
