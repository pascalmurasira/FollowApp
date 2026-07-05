import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy · FollowApp',
  description:
    'How FollowApp handles contacts, AI drafting, enrichment, card scanning, email, and account sync.',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-6 py-12 text-foreground sm:px-8">
      <Link href="/" className="text-sm font-medium text-primary">
        ← Back to FollowApp
      </Link>

      <h1 className="mt-8 font-heading text-4xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Last updated 5 July 2026. FollowApp is designed to keep you in control:
        nothing is sent to another person until you review and send it yourself.
      </p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          What FollowApp stores
        </h2>
        <p>
          FollowApp stores the people, circles, profile details, follow-up
          signals, and preferences you add so the app can remind you who to
          reach and draft better openers. Anonymous use is scoped to a generated
          device id. If you sign in, that data can sync across your devices.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          AI and enrichment
        </h2>
        <p>
          FollowApp may send the relevant contact context you provide to AI
          providers through Vercel AI Gateway to draft message suggestions,
          search for recent professional context, or read a business card image.
          These features are used to help you write and organize follow-ups; the
          app does not auto-send messages.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Service providers
        </h2>
        <p>
          FollowApp uses Neon for database storage, Vercel for hosting and AI
          Gateway access, and Resend for magic-link sign-in emails. These
          providers process data only as needed to run the app.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Your control
        </h2>
        <p>
          You can edit or remove people from your device data, clear what
          FollowApp has learned about your style, and choose whether to sign in
          for sync. Replies happen in the channel you send through, such as
          WhatsApp or email, not automatically inside FollowApp.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Contact
        </h2>
        <p>
          For privacy questions, contact the FollowApp owner through the support
          channel listed in the App Store or on the main website.
        </p>
      </section>
    </main>
  )
}
