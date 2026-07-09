import 'server-only'
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { Pool } from 'pg'
import { sendMagicLinkEmail } from '@/lib/email'

/**
 * Better Auth server config for FollowApp.
 *
 * We use ONLY the magic-link plugin (no email/password) — the product decision
 * is a passwordless "secure your FollowApp" flow. On a successful magic-link
 * verification, `onMagicLinkVerify` (wired via the app's sign-in callback) is
 * where the current device's anonymous data is adopted by the account.
 */

function resolveBaseURL() {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV === 'production') return 'https://followapp.chat'
  return process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'
}

const baseURL = resolveBaseURL()

const authSecret = process.env.BETTER_AUTH_SECRET
if (process.env.NODE_ENV === 'production' && (!authSecret || authSecret.length < 32)) {
  throw new Error('BETTER_AUTH_SECRET must be set to at least 32 characters in production.')
}

const trustedOrigins = [
  baseURL,
  'https://followapp.chat',
  process.env.V0_RUNTIME_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined,
].filter((v): v is string => Boolean(v))

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: authSecret,
  baseURL,
  trustedOrigins,
  plugins: [
    magicLink({
      // The link the user clicks. We route it through our own page so we can
      // run the device-adoption step right after the session is created.
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ email, url })
      },
    }),
  ],
  advanced:
    process.env.NODE_ENV === 'development'
      ? { defaultCookieAttributes: { sameSite: 'none', secure: true } }
      : undefined,
})
