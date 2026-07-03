'use client'

import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="max-w-[20rem]">
        <h1 className="font-serif text-3xl font-medium leading-tight tracking-tight text-balance">
          Something slipped
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
          We hit an unexpected snag. Your conversations are safe — give it
          another try.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 font-medium text-primary-foreground transition-transform active:scale-[0.98]"
      >
        <RotateCw className="size-4" />
        Try again
      </button>
    </main>
  )
}
