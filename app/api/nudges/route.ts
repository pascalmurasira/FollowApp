import { generateText, Output } from 'ai'
import { z } from 'zod'
import { withRetry } from '@/lib/with-retry'
import { TEXT_MODEL } from '@/lib/ai'
import { protectExpensiveRequest } from '@/lib/server/api-protection'
import { logServerError } from '@/lib/server/error-metadata'

export const maxDuration = 30

const nudgesSchema = z.object({
  nudges: z.array(
    z.object({
      contactId: z.string().describe('The id of the contact this is for'),
      tone: z
        .string()
        .describe('One or two words for the vibe, e.g. "warm", "playful", "low-key"'),
      text: z
        .string()
        .describe('A ready-to-send opening message, casual and human'),
    }),
  ),
})

interface ReqContact {
  id: string
  name: string
  relationship: string
  context: string
  interests: string[]
  daysSinceContact: number
  lastMessage?: string
  eventName?: string
  memorySeed?: string
  nextStep?: string
}

const requestSchema = z.object({
  voice: z.string().trim().min(1).max(500),
  contacts: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(200),
        relationship: z.string().max(500),
        context: z.string().max(4_000),
        interests: z.array(z.string().max(300)).max(30),
        daysSinceContact: z.number().finite().min(0).max(100_000),
        lastMessage: z.string().max(2_000).optional(),
        eventName: z.string().max(120).optional(),
        memorySeed: z.string().max(280).optional(),
        nextStep: z.string().max(280).optional(),
      }),
    )
    .max(50),
})

export async function POST(req: Request) {
  const blocked = await protectExpensiveRequest(req, 'nudges', {
    limit: 20,
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
  const { contacts, voice } = parsed.data as {
    contacts: ReqContact[]
    voice: string
  }

  if (!contacts?.length) {
    return Response.json({ nudges: [] })
  }

  const system = [
    'You help a busy, slightly avoidant person restart conversations with people they care about.',
    'For EACH contact, write ONE short opening message they can send right now to break the ice.',
    'Rules for every message:',
    '- Sound like a real human texting, not a greeting card. No "Hope this finds you well".',
    '- Reference something specific about the person (their context or interests) so it feels personal.',
    '- If a confirmed next step is supplied, make that commitment the natural purpose of the message.',
    '- A memory clue is private grounding. Use it only when socially appropriate; never copy sensitive wording or claim certainty beyond it.',
    '- Acknowledge the gap lightly only when it has been a long time, and never guilt-trip.',
    '- Keep it to 1-2 sentences. Easy to send with zero editing.',
    `- Match this desired voice: "${voice}".`,
    'Return exactly one nudge per contact, using their contactId.',
  ].join('\n')

  const prompt = contacts
    .map((c) =>
      [
        `Contact id: ${c.id}`,
        `Name: ${c.name}`,
        `Relationship: ${c.relationship}`,
        `Context: ${c.context}`,
        `Interests: ${c.interests.join(', ')}`,
        `Days since last contact: ${c.daysSinceContact}`,
        c.eventName ? `Where we met: ${c.eventName}` : 'No event supplied.',
        c.memorySeed ? `Private memory clue: ${c.memorySeed}` : 'No memory clue supplied.',
        c.nextStep ? `Confirmed next step: ${c.nextStep}` : 'No promised next step supplied.',
        c.lastMessage ? `Their last message: "${c.lastMessage}"` : 'No prior messages.',
      ].join('\n'),
    )
    .join('\n\n---\n\n')

  try {
    const output = await withRetry(async () => {
      const result = await generateText({
        model: TEXT_MODEL,
        system,
        prompt,
        output: Output.object({ schema: nudgesSchema }),
      })
      return result.output
    })

    return Response.json(output)
  } catch (error) {
    logServerError('[v0] Nudges route failed', error)
    return Response.json(
      { error: 'Could not generate nudges right now.' },
      { status: 500 },
    )
  }
}
