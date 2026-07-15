'use client'

import { useEffect, useState } from 'react'
import { X, ShieldCheck, MailCheck } from 'lucide-react'
import { signIn } from '@/lib/auth-client'
import { accountSyncCallbackURL } from '@/lib/account-sync-flow'
import { getDeviceId } from '@/lib/device-id'

/**
 * The "Secure your Nudge" magic-link sheet. Collects an email, sends a sign-in
 * link, and shows a "check your inbox" confirmation. Clicking the link lands on
 * /welcome-back, which syncs this device to the account.
 */
export function SecureNudgeSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  )

  useEffect(() => {
    if (open) {
      setStatus('idle')
    }
  }, [open])

  if (!open) return null

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  const send = async () => {
    if (!valid) return
    setStatus('sending')
    try {
      const { error } = await signIn.magicLink({
        email: email.trim(),
        // Carry the anonymous capability that is being secured through the
        // one-time magic-link flow. If the email is opened on another device,
        // /welcome-back claims this source first and then merges the device
        // that opened the link into the same canonical account dataset.
        callbackURL: accountSyncCallbackURL(getDeviceId()),
      })
      if (error) throw new Error(error.message)
      setStatus('sent')
    } catch (err) {
      console.error('[v0] magic link send failed:', (err as Error).message)
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-background shadow-xl">
        <header className="flex items-center justify-between px-5 py-4">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="font-serif text-xl font-medium tracking-tight">
              Secure your network
            </h2>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-muted"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
          {status === 'sent' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary/[0.08]">
                <MailCheck className="size-7 text-primary" />
              </span>
              <p className="text-pretty text-lg font-medium text-foreground">
                Check your inbox
              </p>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                We sent a sign-in link to{' '}
                <span className="font-medium text-foreground">
                  {email.trim()}
                </span>
                . Open it on any device to sync your network and follow-ups.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 min-h-11 rounded-full px-6 text-sm font-semibold text-muted-foreground"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                Right now your network, circles, and follow-ups live only on
                this device — switch phones or clear your browser and
                they&apos;re gone. Add your email and we&apos;ll keep them safe
                and synced everywhere. No password needed.
              </p>

              <label className="flex flex-col gap-1.5">
                <span className="px-1 text-sm font-medium text-foreground">
                  Email
                </span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') send()
                  }}
                  placeholder="you@example.com"
                  className="glass-card h-12 w-full rounded-xl px-4 text-base outline-none focus-visible:border-[var(--action-bg)]"
                />
              </label>

              {status === 'error' && (
                <p className="text-sm text-destructive">
                  Something went wrong sending your link. Please try again.
                </p>
              )}

              <button
                type="button"
                onClick={send}
                disabled={!valid || status === 'sending'}
                className="primary-action pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold disabled:opacity-40"
              >
                <ShieldCheck className="size-4" />
                {status === 'sending' ? 'Sending…' : 'Email me a link'}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="min-h-11 text-sm font-medium text-muted-foreground"
              >
                Maybe later
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
