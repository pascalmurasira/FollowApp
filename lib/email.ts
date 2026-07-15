import 'server-only'

/**
 * Sends the magic-link sign-in email.
 *
 * Sends a real email through Resend when RESEND_API_KEY is set. Magic-link
 * URLs are sensitive credentials, so they are never logged in production.
 */
export async function sendMagicLinkEmail({
  email,
  url,
}: {
  email: string
  url: string
}) {
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.FOLLOWAPP_LOG_MAGIC_LINKS === 'true'
  ) {
    console.info(`[v0] Dev magic link for ${email}: ${url}`)
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY must be set to send FollowApp magic links.')
    }
    console.info('[v0] RESEND_API_KEY is not set; magic-link email was not sent.')
    return
  }

  const from = process.env.RESEND_FROM ?? 'FollowApp <onboarding@resend.dev>'

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
        subject: 'Your FollowApp sign-in link',
        html: magicLinkHtml(url),
      }),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(
        `Resend send failed (${res.status}): ${detail.slice(0, 500)}`,
      )
    }
  } catch (err) {
    console.error('[v0] Resend send threw:', (err as Error).message)
    throw err
  }
}

function magicLinkHtml(url: string) {
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#3a3027">
    <h1 style="font-size:20px;margin:0 0 8px">Sign in to FollowApp</h1>
    <p style="font-size:15px;line-height:1.6;color:#6b5d4f;margin:0 0 24px">
      Tap the button below to securely sync your people and streaks to this device.
      This link expires in a few minutes and can only be used once.
    </p>
    <a href="${url}" style="display:inline-block;background:#2c46c9;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:12px">
      Secure my FollowApp
    </a>
    <p style="font-size:13px;line-height:1.6;color:#9c8d7d;margin:24px 0 0">
      If you didn&apos;t request this, you can safely ignore it.
    </p>
  </div>`
}
