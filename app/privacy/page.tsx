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
        Last updated 17 July 2026. FollowApp is designed to keep you in control:
        nothing is sent to another person until you review and send it yourself.
      </p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="font-heading text-xl font-semibold text-foreground">
          What FollowApp stores
        </h2>
        <p>
          FollowApp stores the people, circles, profile details, follow-up
          signals, and preferences you add so the app can remind you who to
          reach and draft better openers. Anonymous use has a local browser copy
          and a cloud copy scoped to a randomly generated installation ID. If
          you sign in, that data is linked to your account so it can be restored
          securely.
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
          Card scanning and phone contacts
        </h2>
        <p>
          A business-card image is processed only after you choose to scan or
          upload it. FollowApp shows the extracted details for review before it
          creates a person. Saving someone to Apple Contacts is a separate,
          explicit action: iOS shows its contact editor and you decide whether
          to add or cancel it.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Account links and device sync
        </h2>
        <p>
          Magic links sign in the installation where you open them. For an
          existing anonymous network, open the link on that same device so its
          installation can be linked safely. Opening the email elsewhere never
          transfers or takes control of the original installation&apos;s anonymous
          ID.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Service providers
        </h2>
        <p>
          FollowApp uses Neon for database storage, Vercel for hosting and AI
          Gateway access, product analytics, and performance measurement, and
          Resend for magic-link sign-in emails. These providers process data
          only as needed to run and improve the app.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Product analytics
        </h2>
        <p>
          FollowApp measures high-level actions such as opening the scanner,
          reaching a review screen, confirming a handoff, or encountering an
          error. Event properties are filtered so names, email addresses, phone
          numbers, message text, draft text, relationship notes, companies, and
          shared URLs are not attached to product events. Analytics never decides
          who you should contact and is not used to send messages on your behalf.
        </p>

        <h2 className="font-heading text-xl font-semibold text-foreground">
          Your control
        </h2>
        <p>
          You can edit or remove individual people, clear what FollowApp has
          learned about your style, and choose whether to sign in for sync. In
          the You tab, signed-out users can delete this installation&apos;s local and
          cloud data; signed-in users can sign out or permanently delete their
          account and its FollowApp data. A failed deletion leaves the current
          data in place and shows an error so you can retry. External handoffs
          open only the channel you choose, such as WhatsApp or email. If two
          signed-in users explicitly accept a FollowApp connection, FollowApp
          also stores their in-app message bodies, sender/recipient identifiers,
          timestamps, and read status so that conversation works.
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
