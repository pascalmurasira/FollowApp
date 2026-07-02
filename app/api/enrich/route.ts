import { generateText, Output } from 'ai'
import { z } from 'zod'
import { TEXT_MODEL, SEARCH_MODEL } from '@/lib/ai'

export const maxDuration = 30

const enrichmentSchema = z.object({
  hooks: z
    .array(
      z.object({
        text: z
          .string()
          .describe(
            'One short, factual sentence describing a recent professional development. No preamble.',
          ),
        kind: z
          .enum(['job-change', 'company-news', 'press', 'other'])
          .describe('The category of the development.'),
        source: z
          .string()
          .optional()
          .describe('Short source name or domain, e.g. "TechCrunch" or "linkedin.com".'),
      }),
    )
    .max(3)
    .describe('0 to 3 recent, professionally relevant hooks. Empty if nothing solid is found.'),
})

interface RequestBody {
  name: string
  title?: string
  company?: string
  relationship?: string
}

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

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody

  if (!body.name?.trim()) {
    return Response.json({ hooks: [], status: 'ok' })
  }

  const who = [body.name, body.title, body.company && `at ${body.company}`]
    .filter(Boolean)
    .join(', ')

  // Stage 1 — Retrieval. Perplexity Sonar searches the live web. We DON'T retry
  // here: Sonar is rate-limited on the gateway free tier, so retrying a 429 just
  // makes the user wait for a guaranteed failure. We fail fast and tell the UI
  // the lookup is unavailable (distinct from "found nothing").
  let research: string
  try {
    const result = await generateText({
      model: SEARCH_MODEL,
      system:
        'You are a research assistant. Report only recent (last ~6 months), professionally relevant, verifiable facts about the person and their company. Prioritize the person (new role, promotion, talk, award, press), then the company (funding, launch, acquisition, major news). If you are unsure something is about this specific person, say so. Be concise.',
      prompt: `What has ${who} been up to recently, professionally? Include dates and sources where possible.`,
    })
    research = result.text
  } catch (error) {
    if (isRateLimitOrUnavailable(error)) {
      console.error('[v0] Enrich retrieval unavailable (rate limit / access):', error)
      return Response.json({ hooks: [], status: 'unavailable' })
    }
    console.error('[v0] Enrich retrieval failed:', error)
    return Response.json({ hooks: [], status: 'unavailable' })
  }

  if (!research?.trim()) {
    return Response.json({ hooks: [], status: 'ok' })
  }

  // Stage 2 — Structuring. A cheap, reliable, zero-config model turns the prose
  // into 0–3 clean hooks (or nothing if the research is vague/stale). This split
      // is what makes the feature dependable: Sonar searches, TEXT_MODEL structures.
      try {
        const result = await generateText({
          model: TEXT_MODEL,
      system: `Extract at most 3 recent, professionally relevant hooks from the research notes, to help someone send a warm, timely reconnect message.

Rules:
- Each hook: one short, factual, specific sentence. No "you could mention…".
- Only include things clearly about THIS person or their company. Drop anything vague, stale, or uncertain.
- Prefer the person over the company. If the notes contain nothing solid and recent, return an empty list — empty is better than wrong.`,
      prompt: `Person: ${who}\n\nResearch notes:\n${research}`,
      output: Output.object({ schema: enrichmentSchema }),
    })
    return Response.json({ ...result.output, status: 'ok' })
  } catch (error) {
    console.error('[v0] Enrich structuring failed:', error)
    return Response.json({ hooks: [], status: 'unavailable' })
  }
}
