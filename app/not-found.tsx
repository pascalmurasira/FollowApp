import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="max-w-[20rem]">
        <h1 className="font-serif text-3xl font-medium leading-tight tracking-tight text-balance">
          Nothing here
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
          This page wandered off. Let&apos;s get you back to the people who
          matter.
        </p>
      </div>
      <Link
        href="/"
        className="flex min-h-11 items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground transition-transform active:scale-[0.98]"
      >
        Back to FollowApp
      </Link>
    </main>
  )
}
