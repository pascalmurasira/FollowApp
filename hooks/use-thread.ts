'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface ChatMessage {
  id: number
  senderUserId: string
  body: string
  createdAt: string
  mine: boolean
}

const POLL_MS = 4000
const MAX_CATCH_UP_PAGES = 5
const MAX_LOCAL_MESSAGES = 500

/**
 * Polls the in-app message thread with `otherUserId`. Cursor-based: only rows
 * newer than the highest id we hold come back, so polling stays cheap. Pauses
 * while the tab is hidden (visibility-aware) and resumes — with an immediate
 * catch-up fetch — when it returns. Built so a future realtime transport can
 * replace `poll()` without touching callers.
 */
export function useThread(otherUserId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const cursorRef = useRef(0)
  const otherRef = useRef(otherUserId)
  const pollingRef = useRef(false)

  // Reset when the conversation partner changes.
  useEffect(() => {
    otherRef.current = otherUserId
    cursorRef.current = 0
    setMessages([])
    setSendError(null)
    if (otherUserId) setLoading(true)
  }, [otherUserId])

  const poll = useCallback(async () => {
    const other = otherRef.current
    if (!other || pollingRef.current) return
    pollingRef.current = true
    try {
      for (let page = 0; page < MAX_CATCH_UP_PAGES; page += 1) {
        const res = await fetch(
          `/api/chat/messages?with=${encodeURIComponent(other)}&since=${cursorRef.current}`,
        )
        if (!res.ok) return
        const data = (await res.json()) as {
          messages: ChatMessage[]
          hasMore?: boolean
        }
        if (otherRef.current !== other) return
        if (data.messages.length > 0) {
          cursorRef.current = Math.max(
            cursorRef.current,
            ...data.messages.map((message) => message.id),
          )
          setMessages((previous) => {
            const seen = new Set(previous.map((message) => message.id))
            const fresh = data.messages.filter(
              (message) => !seen.has(message.id),
            )
            return fresh.length
              ? [...previous, ...fresh].slice(-MAX_LOCAL_MESSAGES)
              : previous
          })
        }
        if (!data.hasMore) break
      }
    } catch (err) {
      console.error('[v0] thread poll failed:', err)
    } finally {
      pollingRef.current = false
      if (otherRef.current === other) setLoading(false)
    }
  }, [])

  // Polling loop, paused while the tab is hidden.
  useEffect(() => {
    if (!otherUserId) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      void poll()
      timer = setInterval(poll, POLL_MS)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [otherUserId, poll])

  const send = useCallback(
    async (body: string) => {
      const other = otherRef.current
      if (!other || !body.trim()) return false
      setSending(true)
      setSendError(null)
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientUserId: other, body }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error || 'The message could not be sent.')
        }
        await poll()
        return true
      } catch (err) {
        console.error('[v0] send failed:', err)
        setSendError(
          err instanceof Error
            ? err.message
            : 'The message could not be sent. Please try again.',
        )
        return false
      } finally {
        setSending(false)
      }
    },
    [poll],
  )

  return { messages, loading, sending, send, sendError }
}
