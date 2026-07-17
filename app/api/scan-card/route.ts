import { generateText, Output } from 'ai'
import { z } from 'zod'
import { VISION_MODEL } from '@/lib/ai'
import {
  SCAN_CARD_FIELD_KEYS,
  SCAN_CARD_MODEL_TIMEOUT_MS,
} from '@/lib/camera-launch'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import {
  isScanCardUnavailable,
  scanCardErrorMetadata,
} from '@/lib/server/scan-card-error'

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
  needsReview: z
    .array(z.enum(SCAN_CARD_FIELD_KEYS))
    .describe(
      'Non-empty fields containing any ambiguous, obscured, or guessed character. Return an empty array when no specific field needs review.',
    ),
  imageQuality: z
    .enum(['clear', 'usable', 'poor'])
    .describe(
      'clear when text is sharp and unobstructed, usable when extraction is still reliable despite minor issues, poor when blur, glare, crop, or distance may affect details.',
    ),
  qualityNote: z
    .string()
    .max(160)
    .describe(
      'A short actionable note only when imageQuality is poor; otherwise an empty string. Never claim a field was verified.',
    ),
})

const requestSchema = z.object({ image: z.string() })

export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'scan-card', {
    limit: 10,
    windowMs: 10 * 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ status: 'error', message: 'Invalid request body.' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json(
      { status: 'error', message: 'Invalid request body.' },
      { status: 400 },
    )
  }
  const image = parsed.data.image.trim()

  if (!image || !image.startsWith('data:image/')) {
    return Response.json({ status: 'error', message: 'No image provided.' }, { status: 400 })
  }

  // Guard against oversized payloads (data URLs are ~33% larger than the bytes).
  // ~8MB of base64 ≈ ~6MB image; reject beyond that to protect the model call.
  if (image.length > 8_000_000) {
    return Response.json({ status: 'error', message: 'Image too large.' }, { status: 413 })
  }

  const scanController = new AbortController()
  let modelTimedOut = false
  const abortFromClient = () => scanController.abort(req.signal.reason)
  if (req.signal.aborted) abortFromClient()
  else req.signal.addEventListener('abort', abortFromClient, { once: true })
  const modelTimeout = setTimeout(() => {
    modelTimedOut = true
    scanController.abort()
  }, SCAN_CARD_MODEL_TIMEOUT_MS)

  try {
    const result = await generateText({
      model: VISION_MODEL,
      // Don't retry: on the gateway free tier a 429 just makes the user wait
      // for a guaranteed failure. Fail fast so the UI can drop into manual
      // entry immediately instead of stalling ~8s on doomed retries.
      maxRetries: 0,
      abortSignal: scanController.signal,
      system:
        'You read business cards from camera photos. Extract ONLY the information actually printed on the card. Never guess or invent details. If a field is not present or not legible, return an empty string for it. Normalize phone numbers to international format only when the country is clear from context (country code, address, or dialing prefix). Mark every non-empty field with even one ambiguous character in needsReview. Judge blur, glare, crop, and distance honestly in imageQuality. If the image is difficult, still extract every clearly legible field and give one short, actionable qualityNote. Never say that a field is verified.',
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
    if (modelTimedOut) {
      console.warn('[v0] Card scan exceeded the model time budget.')
      return Response.json({ status: 'timeout' })
    }
    if (req.signal.aborted) {
      return Response.json({ status: 'cancelled' }, { status: 408 })
    }
    const metadata = scanCardErrorMetadata(error)
    if (isScanCardUnavailable(metadata)) {
      console.error('[v0] Card scan unavailable (rate limit / access):', metadata)
      return Response.json({ status: 'unavailable' })
    }
    console.error('[v0] Card scan failed:', metadata)
    return Response.json({ status: 'unavailable' })
  } finally {
    clearTimeout(modelTimeout)
    req.signal.removeEventListener('abort', abortFromClient)
  }
}
