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
  const changedDuringSaveRef = useRef(false)
  const operationRef = useRef(0)
  const savedIdentifierRef = useRef<string | undefined>(undefined)
  const requestIdRef = useRef<string | undefined>(undefined)
  const onOutcomeRef = useRef(onOutcome)
  const cardSignature = JSON.stringify([
    card.n,
    card.p ?? '',
    card.e ?? '',
    card.co ?? '',
    card.t ?? '',
    card.w ?? '',
  ])
  const latestCardSignatureRef = useRef(cardSignature)

  useEffect(() => {
    latestCardSignatureRef.current = cardSignature
  }, [cardSignature])

  useEffect(() => {
    onOutcomeRef.current = onOutcome
  }, [onOutcome])

  useEffect(() => {
    // A cloud OCR refinement or user correction may arrive while the direct
    // Contacts write is running. Remember that change so the completed write
    // cannot claim the newer on-screen values were saved.
    if (inFlightRef.current) {
      changedDuringSaveRef.current = true
      return
    }
    operationRef.current += 1
    setState('idle')
    onOutcomeRef.current?.('idle')
  }, [card.n, card.p, card.e, card.co, card.t, card.w])

  useEffect(
    () => () => {
      operationRef.current += 1
      inFlightRef.current = false
      changedDuringSaveRef.current = false
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
    onOutcomeRef.current?.(outcome)
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
    changedDuringSaveRef.current = false
    const startingCardSignature = cardSignature
    const operation = ++operationRef.current
    update('saving')
    try {
      if (!requestIdRef.current) {
        requestIdRef.current =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
      const result = await saveContactToPhone(card, {
        existingIdentifier: savedIdentifierRef.current,
        requestId: requestIdRef.current,
      })
      if (result.identifier) savedIdentifierRef.current = result.identifier
      if (operationRef.current !== operation) return
      const cardChanged =
        changedDuringSaveRef.current ||
        latestCardSignatureRef.current !== startingCardSignature
      update(cardChanged ? 'idle' : result.outcome)
      trackProductEvent('native_contact_save', {
        source,
        outcome: result.outcome,
        card_changed_during_save: cardChanged,
      })
    } catch (error) {
      if (operationRef.current !== operation) return
      const outcome = isNativePermissionDeniedError(error) ? 'denied' : 'error'
      update(outcome)
      trackProductEvent('native_contact_save', { source, outcome })
    } finally {
      if (operationRef.current === operation) {
        inFlightRef.current = false
        changedDuringSaveRef.current = false
      }
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
