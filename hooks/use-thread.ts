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
  const cursorRef = useRef(0)
  const otherRef = useRef(otherUserId)

  // Reset when the conversation partner changes.
  useEffect(() => {
    otherRef.current = otherUserId
    cursorRef.current = 0
    setMessages([])
    if (otherUserId) setLoading(true)
  }, [otherUserId])

  const poll = useCallback(async () => {
    const other = otherRef.current
    if (!other) return
    try {
      const res = await fetch(
        `/api/chat/messages?with=${encodeURIComponent(other)}&since=${cursorRef.current}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as { messages: ChatMessage[] }
      if (otherRef.current !== other) return // partner changed mid-flight
      if (data.messages.length > 0) {
        cursorRef.current = Math.max(
          cursorRef.current,
          ...data.messages.map((m) => m.id),
        )
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id))
          const fresh = data.messages.filter((m) => !seen.has(m.id))
          return fresh.length ? [...prev, ...fresh] : prev
        })
      }
    } catch (err) {
      console.error('[v0] thread poll failed:', err)
    } finally {
      setLoading(false)
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
      if (!other || !body.trim()) return
      setSending(true)
      try {
        const res = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientUserId: other, body }),
        })
        if (res.ok) await poll() // pull our own message back immediately
      } catch (err) {
        console.error('[v0] send failed:', err)
      } finally {
        setSending(false)
      }
    },
    [poll],
  )

  return { messages, loading, sending, send }
}
