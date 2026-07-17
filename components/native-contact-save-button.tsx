'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Settings, Smartphone } from 'lucide-react'
import type { CardData } from '@/lib/card'
import {
  isNativePermissionDeniedError,
  isNativeRuntime,
  openAppSettings,
  saveContactToPhone,
} from '@/lib/native'
import { trackProductEvent } from '@/lib/product-analytics'
import { cn } from '@/lib/utils'
import {
  nativeContactSaveLabel,
  type ContactSaveOutcome,
} from '@/lib/native-contact-save'

export type { ContactSaveOutcome } from '@/lib/native-contact-save'

export function NativeContactSaveButton({
  card,
  source,
  idleLabel,
  className,
  disabled = false,
  onOutcome,
}: {
  card: CardData
  source: 'business_card' | 'qr' | 'public_card'
  idleLabel?: string
  className?: string
  disabled?: boolean
  onOutcome?: (outcome: ContactSaveOutcome) => void
}) {
  const [state, setState] = useState<ContactSaveOutcome>('idle')
  const [native, setNative] = useState(false)
  const inFlightRef = useRef(false)
  const operationRef = useRef(0)

  useEffect(() => {
    // Native Contacts owns the screen until the user saves or cancels. Card
    // fields can still improve in the background (for example cloud OCR
    // replacing the fast Vision preview), but that must not invalidate the
    // active editor or make its eventual outcome disappear.
    if (inFlightRef.current) return
    operationRef.current += 1
    setState('idle')
  }, [card.n, card.p, card.e, card.co, card.t])

  useEffect(
    () => () => {
      operationRef.current += 1
      inFlightRef.current = false
    },
    [],
  )

  useEffect(() => {
    void isNativeRuntime().then(setNative)
    const resetAfterSettings = () => {
      if (document.visibilityState === 'visible') {
        setState((current) => (current === 'denied' ? 'idle' : current))
      }
    }
    document.addEventListener('visibilitychange', resetAfterSettings)
    return () => document.removeEventListener('visibilitychange', resetAfterSettings)
  }, [])

  const update = (outcome: ContactSaveOutcome) => {
    setState(outcome)
    onOutcome?.(outcome)
  }

  const run = async () => {
    const complete = state === 'saved' || state === 'exported'
    if (disabled || inFlightRef.current || state === 'saving' || complete) return
    if (state === 'denied' && native) {
      inFlightRef.current = true
      try {
        await openAppSettings()
      } finally {
        inFlightRef.current = false
      }
      return
    }
    inFlightRef.current = true
    const operation = ++operationRef.current
    update('saving')
    try {
      const outcome = await saveContactToPhone(card)
      if (operationRef.current !== operation) return
      update(outcome)
      trackProductEvent('native_contact_save', { source, outcome })
    } catch (error) {
      if (operationRef.current !== operation) return
      const outcome = isNativePermissionDeniedError(error) ? 'denied' : 'error'
      update(outcome)
      trackProductEvent('native_contact_save', { source, outcome })
    } finally {
      if (operationRef.current === operation) inFlightRef.current = false
    }
  }

  const complete = state === 'saved' || state === 'exported'

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={disabled || state === 'saving' || complete}
      aria-live="polite"
      className={cn(
        'glass-button pressable flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-[var(--ink-strong)] disabled:opacity-70',
        className,
      )}
    >
      {state === 'saving' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : complete ? (
        <Check className="size-4" />
      ) : state === 'denied' && native ? (
        <Settings className="size-4" />
      ) : (
        <Smartphone className="size-4" />
      )}
      {nativeContactSaveLabel(state, idleLabel)}
    </button>
  )
}
