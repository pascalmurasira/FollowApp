import { generateText } from 'ai'
import { withRetry } from '@/lib/with-retry'
import { TEXT_MODEL } from '@/lib/ai'

export const maxDuration = 30

interface RequestBody {
  name: string
  relationship: string
  context: string
  interests: string[]
  recentMessages: { sender: 'me' | 'them'; text: string }[]
}

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody

  const transcript = body.recentMessages
    .map((m) => `${m.sender === 'me' ? 'Them' : body.name}: ${m.text}`)
    .join('\n')

  const system = `You are roleplaying as "${body.name}" (${body.relationship}) replying to a text message in a casual messaging app. 

Who you are: ${body.context}
Things you care about: ${body.interests.join(', ')}

Rules:
- Reply with ONE short, natural text message, as this person would actually text.
- Match their personality and the emotional tone of the conversation.
- React genuinely to what was just said. Be warm. You are happy to hear from them.
- No greetings or sign-offs. No quotation marks. Just the message text.`

  const prompt = `Here is the recent conversation. "Them" is the person texting you:
${transcript}

Write your single reply text now.`

  try {
    const text = await withRetry(async () => {
      const result = await generateText({
        model: TEXT_MODEL,
        system,
        prompt,
      })
      return result.text
    })

    return Response.json({ text: text.trim() })
  } catch (error) {
    console.error('Reply route failed:', error)
    return Response.json({ error: 'Could not generate a reply.' }, { status: 500 })
  }
}
