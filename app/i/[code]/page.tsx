import Link from 'next/link'
import type { Metadata } from 'next'
import { MessageCircle, Sparkles, UserPlus } from 'lucide-react'
import { inviteLandingHeadline } from '@/lib/invite-link'

export const metadata: Metadata = {
  title: 'You’re invited to FollowApp',
  description:
    'A friend uses FollowApp to keep the people who matter close. Join them and never let a good connection go cold.',
}

/**
 * Invite landing page (/i/[code]). Codes are routing-only for backwards
 * compatibility. They are never parsed or displayed because old links may
 * contain local contact identifiers and names.
 */
export default function InvitePage() {
  const points = [
    {
      icon: MessageCircle,
      title: 'Reach out, the easy way',
      body: 'FollowApp reminds you who you’ve been meaning to message — before the connection goes quiet.',
    },
    {
      icon: Sparkles,
      title: 'The opener, written for you',
      body: 'It drafts a warm, personal first line using recent context, so starting feels effortless.',
    },
    {
      icon: UserPlus,
      title: 'Chat right here',
      body: 'When you’re both on FollowApp, you can message each other inside the app — replies and all.',
    },
  ]

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-12">
      <div className="flex flex-1 flex-col justify-center">
        <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-[12px] font-medium text-secondary-foreground">
          <Sparkles className="size-3 text-primary" />
          Invitation
        </span>

        <h1 className="text-pretty font-serif text-4xl leading-[1.1] text-foreground">
          {inviteLandingHeadline()}
        </h1>

        <p className="mt-4 text-pretty text-[15px] leading-relaxed text-muted-foreground">
          FollowApp helps busy people stay close to the relationships that
          matter — it tells you who to reach and writes the opener so you
          actually follow through.
        </p>

        <ul className="mt-8 flex flex-col gap-5">
          {points.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-foreground">
                  {title}
                </p>
                <p className="text-pretty text-[13px] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <Link
          href="/"
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          Get started — it’s free
        </Link>
        <Link
          href="/"
          className="flex min-h-11 w-full items-center justify-center text-[14px] font-medium text-muted-foreground"
        >
          I already have an account
        </Link>
      </div>
    </main>
  )
}
