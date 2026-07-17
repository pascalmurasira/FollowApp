import { generateText, Output } from 'ai'
import { z } from 'zod'
import { withRetry } from '@/lib/with-retry'
import { TEXT_MODEL } from '@/lib/ai'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { logServerError } from '@/lib/server/error-metadata'

export const maxDuration = 30

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        tone: z
          .string()
          .describe('One or two words for the vibe, e.g. "Casual", "Caring", "Playful", "Make a plan".'),
        text: z
          .string()
          .describe('The ready-to-send message, written as the user would actually text.'),
      }),
    )
    .length(3),
})

interface RequestBody {
  name: string
  relationship: string
  context: string
  interests: string[]
  daysSinceContact: number
  voice: string
  recentMessages: { sender: 'me' | 'them'; text: string }[]
  /** Recent, user-approved news hooks to weave in (from /api/enrich). */
  enrichment?: string[]
}

const requestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  relationship: z.string().max(500),
  context: z.string().max(4_000),
  interests: z.array(z.string().max(300)).max(30),
  daysSinceContact: z.number().finite().min(0).max(100_000),
  voice: z.string().trim().min(1).max(500),
  recentMessages: z
    .array(
      z.object({
        sender: z.enum(['me', 'them']),
        text: z.string().max(2_000),
      }),
    )
    .max(8),
  enrichment: z.array(z.string().max(1_000)).max(3).optional(),
})

export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'suggest', {
    limit: 30,
    windowMs: 60_000,
  })
  if (blocked) return blocked

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const body = parsed.data as RequestBody

  const transcript = body.recentMessages
    .map((m) => `${m.sender === 'me' ? 'User' : body.name}: ${m.text}`)
    .join('\n')

  const isColdOpen = body.recentMessages.length === 0 || body.daysSinceContact >= 14

  const system = `You are a thoughtful follow-up assistant for busy professionals who want to keep their network warm but never get around to reaching out. You write the actual message the user can send with one tap.

Rules:
- Write in the user's voice: ${body.voice}
- Keep each message short and natural, like a real text — never a stiff networking email or a sales pitch. No "Dear", no sign-offs.
- Never use the person's name awkwardly or sound like a form letter or templated outreach.
- Sound like a real human reconnecting, not someone who wants something. No asks unless the context clearly calls for one.
- ${isColdOpen ? 'It has been a while, so acknowledge the gap lightly and warmly without being guilt-trippy or over-apologizing. Make it easy for them to reply.' : 'Continue the conversation naturally based on the last messages.'}
- Reference real, specific details when it helps (their role, company, recent moves, shared history, interests).
- Give three options with clearly different vibes so the user can pick.
- Avoid clichés like "Hope you are well", "Long time no see", or "Just circling back".`

  const enrichmentBlock =
    body.enrichment && body.enrichment.length > 0
      ? `\n\nRecent news you can reference (only if it fits naturally — don't force it or sound like you've been researching them):\n${body.enrichment
          .map((e) => `- ${e}`)
          .join('\n')}`
      : ''

  const prompt = `Write 3 different text messages I could send to ${body.name} (${body.relationship}).

What's going on: ${body.context}
Things they care about: ${body.interests.join(', ')}
Days since we last talked: ${body.daysSinceContact}

Recent conversation:
${transcript || '(no messages yet)'}${enrichmentBlock}`

  try {
    const output = await withRetry(async () => {
      const result = await generateText({
        model: TEXT_MODEL,
        system,
        prompt,
        output: Output.object({ schema: suggestionsSchema }),
      })
      return result.output
    })

    return Response.json(output)
  } catch (error) {
    logServerError('[v0] Suggest route failed', error)
    return Response.json(
      { error: 'Could not generate suggestions right now.' },
      { status: 500 },
    )
  }
}
