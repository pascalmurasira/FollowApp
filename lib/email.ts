import 'server-only'

/**
 * Sends the magic-link sign-in email.
 *
 * - ALWAYS logs the link to the server console, so the flow is testable in the
 *   v0 preview right now without any email provider configured.
 * - ALSO sends a real email through Resend when RESEND_API_KEY is set, so it's
 *   production-ready the moment a key + verified domain are added.
 */
export async function sendMagicLinkEmail({
  email,
  url,
}: {
  email: string
  url: string
}) {
  // Always log — invaluable for local/preview testing and debugging.
  console.log(`[v0] Magic link for ${email}: ${url}`)

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.RESEND_FROM ?? 'Nudge <onboarding@resend.dev>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Your Nudge sign-in link',
        html: magicLinkHtml(url),
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      console.log(`[v0] Resend send failed (${res.status}): ${detail}`)
    }
  } catch (err) {
    console.log('[v0] Resend send threw:', (err as Error).message)
  }
}

function magicLinkHtml(url: string) {
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#3a3027">
    <h1 style="font-size:20px;margin:0 0 8px">Sign in to Nudge</h1>
    <p style="font-size:15px;line-height:1.6;color:#6b5d4f;margin:0 0 24px">
      Tap the button below to securely sync your people and streaks to this device.
      This link expires in a few minutes and can only be used once.
    </p>
    <a href="${url}" style="display:inline-block;background:#2c46c9;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px">
      Secure my Nudge
    </a>
    <p style="font-size:13px;line-height:1.6;color:#9c8d7d;margin:24px 0 0">
      If you didn&apos;t request this, you can safely ignore it.
    </p>
  </div>`
}
