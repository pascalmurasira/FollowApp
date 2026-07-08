'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { X, Pencil, Check, Share2, QrCode, Loader2 } from 'lucide-react'
import type { Profile } from '@/lib/types'
import { loadProfile, saveProfile, DEFAULT_PROFILE } from '@/lib/profile'
import { cardUrl } from '@/lib/card'
import { getDeviceId } from '@/lib/device-id'

function initials(name: string) {
  return (
    name
      .split(' ')
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'Y'
  )
}

/** Has the user filled in anything beyond a name? Drives the empty hint. */
function hasCardDetails(p: Profile) {
  return Boolean(p.title || p.company || p.phone || p.email)
}

export function MyCardSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [qr, setQr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Profile>(DEFAULT_PROFILE)
  const [saving, setSaving] = useState(false)
  const [shared, setShared] = useState(false)

  // Refresh the profile each time the sheet opens so edits made elsewhere
  // (e.g. a new photo on the You tab) show up. We don't reset to defaults
  // first, so the previously-shown card stays put until the fresh data lands.
  useEffect(() => {
    if (!open) return
    const deviceId = getDeviceId()
    if (!deviceId) return
    let cancelled = false
    loadProfile(deviceId).then((p) => {
      if (cancelled) return
      setProfile(p)
      setDraft(p)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // (Re)generate the QR whenever the visible card identity changes.
  useEffect(() => {
    if (!open) return
    const url = cardUrl(profile)
    QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1830', light: '#ffffff' },
    })
      .then(setQr)
      .catch((err) => console.error('[v0] QR generation failed:', err))
  }, [open, profile])

  if (!open) return null

  const persist = async () => {
    setSaving(true)
    const next: Profile = {
      name: draft.name.trim() || 'You',
      photoUrl: profile.photoUrl,
      title: draft.title?.trim() || undefined,
      company: draft.company?.trim() || undefined,
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
    }
    setProfile(next)
    const deviceId = getDeviceId()
    try {
      if (deviceId) await saveProfile(deviceId, next)
      setEditing(false)
    } catch (err) {
      console.error('[v0] Card save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const share = async () => {
    const url = cardUrl(profile)
    try {
      if (navigator.share) {
        await navigator.share({ title: `${profile.name} · FollowApp card`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setShared(true)
        setTimeout(() => setShared(false), 2000)
      }
    } catch {
      // User dismissed the share sheet — no action needed.
    }
  }

  const roleLine = [profile.title, profile.company].filter(Boolean).join(' · ')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div className="app-field relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] shadow-xl">
        <span className="field-grain" aria-hidden />
        <header className="relative z-[1] flex items-center justify-between border-b border-[var(--hairline)] px-5 py-4">
          <h2 className="font-heading text-[22px] font-bold tracking-[-0.03em] text-[var(--ink-strong)]">
            {editing ? 'Edit your card' : 'Your card'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="glass-button pressable flex size-9 items-center justify-center rounded-full text-[var(--ink-secondary)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {editing ? (
            <div className="flex flex-col gap-4">
              <Field label="Name">
                <input
                  value={draft.name === 'You' ? '' : draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Your name"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              <Field label="Role">
                <input
                  value={draft.title ?? ''}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Design Lead"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              <Field label="Company">
                <input
                  value={draft.company ?? ''}
                  onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                  placeholder="Linear"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={draft.phone ?? ''}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  inputMode="tel"
                  placeholder="+1 415 555 0142"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
              <Field label="Email">
                <input
                  value={draft.email ?? ''}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  inputMode="email"
                  placeholder="you@company.com"
                  className="h-11 w-full rounded-xl border border-[var(--hairline)] bg-white/25 px-4 text-base outline-none backdrop-blur focus-visible:border-[var(--action-bg)]"
                />
              </Field>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* The business card */}
              <div className="primary-action w-full rounded-3xl p-6">
                <div className="flex items-center gap-4">
                  {profile.photoUrl ? (
                    <img
                      src={profile.photoUrl || '/placeholder.svg'}
                      alt=""
                      className="size-16 rounded-full object-cover ring-2 ring-primary-foreground/20"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary-foreground/15 font-serif text-2xl font-medium">
                      {initials(profile.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-heading text-2xl font-semibold leading-tight">
                      {profile.name}
                    </p>
                    {roleLine && (
                      <p className="truncate text-[14px] text-primary-foreground/80">
                        {roleLine}
                      </p>
                    )}
                  </div>
                </div>

                {(profile.phone || profile.email) && (
                  <div className="mt-4 space-y-1 border-t border-primary-foreground/15 pt-4 text-[13px] text-primary-foreground/85">
                    {profile.phone && <p className="truncate">{profile.phone}</p>}
                    {profile.email && <p className="truncate">{profile.email}</p>}
                  </div>
                )}

                {/* QR */}
                <div className="glass-card mt-5 flex flex-col items-center gap-2 rounded-2xl bg-white/80 p-4">
                  {qr ? (
                    <img
                      src={qr || '/placeholder.svg'}
                      alt={`QR code linking to ${profile.name}'s FollowApp card`}
                      className="size-44"
                    />
                  ) : (
                    <div className="flex size-44 items-center justify-center">
                      <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <QrCode className="size-3.5" />
                    Scan with FollowApp or any camera
                  </p>
                </div>
              </div>

              {!hasCardDetails(profile) && (
                <p className="mt-4 text-pretty text-center text-[13px] leading-relaxed text-muted-foreground">
                  Add your role, company, and contact details so a scan saves the
                  full picture.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="relative z-[1] flex gap-2 border-t border-[var(--hairline)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          {editing ? (
            <button
              type="button"
              onClick={persist}
              disabled={saving}
              className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {saving ? 'Saving…' : 'Save card'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(profile)
                  setEditing(true)
                }}
                className="glass-button pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-[var(--ink-strong)]"
              >
                <Pencil className="size-4" />
                Edit
              </button>
              <button
                type="button"
                onClick={share}
                className="primary-action pressable flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold"
              >
                <Share2 className="size-4" />
                {shared ? 'Link copied' : 'Share'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
