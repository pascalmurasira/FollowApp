# FollowApp

FollowApp is a relationship-nurturing tool for busy professionals. It helps you
notice who is due for a follow-up, drafts a warm opener in your voice, and lets
you review everything before sending through your own channel.

## Deployment

The GitHub-connected Vercel project should use:

- Production domain: `followapp.chat`
- Framework: Next.js
- Build command: `next build`
- Required production environment variables:
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET` (32+ characters)
  - `BETTER_AUTH_URL`
  - `AI_GATEWAY_API_KEY`
  - `RESEND_API_KEY`
  - `RESEND_FROM`

## Local checks

```bash
pnpm lint
BETTER_AUTH_SECRET=local-build-only-followapp-secret-32chars pnpm build
```
