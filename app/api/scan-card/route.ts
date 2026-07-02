import { generateText, Output } from 'ai'
import { z } from 'zod'
import { TEXT_MODEL } from '@/lib/ai'

export const maxDuration = 30

// Everything except a best-effort name is optional — business cards vary wildly,
// and an empty string is far better than an invented value.
const cardSchema = z.object({
  name: z
    .string()
    .describe("The person's full name as printed. Empty string if not legible."),
  title: z
    .string()
    .describe('Job title / role as printed, e.g. "Head of Design". Empty if absent.'),
  company: z
    .string()
    .describe('Company or organization name. Empty if absent.'),
  phone: z
    .string()
    .describe(
      'Primary phone number, normalized to international format (e.g. +14155550123) when the country is unambiguous; otherwise as printed. Empty if absent.',
    ),
  email: z.string().describe('Email address, lowercased. Empty if absent.'),
  website: z
    .string()
    .describe('Website or domain as printed, e.g. "linear.app". Empty if absent.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your overall confidence (0–1) that the card was read correctly.'),
})

function isRateLimitOrUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { statusCode?: number; type?: string; name?: string }
  return (
    e.statusCode === 429 ||
    e.statusCode === 402 ||
    e.statusCode === 403 ||
    e.type === 'rate_limit_exceeded' ||
    e.name === 'GatewayRateLimitError'
  )
}

interface RequestBody {
  image?: string // data URL (JPEG/PNG)
}

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody
  const image = body.image?.trim()

  if (!image || !image.startsWith('data:image/')) {
    return Response.json({ status: 'error', message: 'No image provided.' }, { status: 400 })
  }

  // Guard against oversized payloads (data URLs are ~33% larger than the bytes).
  // ~8MB of base64 ≈ ~6MB image; reject beyond that to protect the model call.
  if (image.length > 8_000_000) {
    return Response.json({ status: 'error', message: 'Image too large.' }, { status: 413 })
  }

  try {
    const result = await generateText({
      model: TEXT_MODEL,
      // Don't retry: on the gateway free tier a 429 just makes the user wait
      // for a guaranteed failure. Fail fast so the UI can drop into manual
      // entry immediately instead of stalling ~8s on doomed retries.
      maxRetries: 0,
      system:
        'You read business cards. Extract ONLY the information actually printed on the card. Never guess or invent details. If a field is not present or not legible, return an empty string for it. Normalize phone numbers to international format when the country is clear from context (country code, address, or dialing prefix).',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the contact details from this business card.',
            },
            { type: 'image', image },
          ],
        },
      ],
      output: Output.object({ schema: cardSchema }),
    })
    return Response.json({ ...result.output, status: 'ok' })
  } catch (error) {
    if (isRateLimitOrUnavailable(error)) {
      console.error('[v0] Card scan unavailable (rate limit / access):', error)
      return Response.json({ status: 'unavailable' })
    }
    console.error('[v0] Card scan failed:', error)
    return Response.json({ status: 'unavailable' })
  }
}
