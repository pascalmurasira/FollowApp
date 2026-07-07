import type { Contact, TalkingPoint } from '@/lib/types'

// Deterministic, no-AI openers so the app is always useful even when the
// model is rate-limited or offline. Varied by contact so the feed never
// looks copy-pasted, and tailored using each person's context/interests.

function pick<T>(options: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return options[Math.abs(hash) % options.length]
}

function fallbackTone(voice: string): 'warm' | 'direct' | 'playful' | 'low-key' {
  const lower = voice.toLowerCase()
  if (/(direct|concise|respectful|formal|professional)/.test(lower)) return 'direct'
  if (/(funny|playful|light|casual)/.test(lower)) return 'playful'
  if (/(chill|low-key|low key|calm)/.test(lower)) return 'low-key'
  return 'warm'
}

export function fallbackNudge(
  contact: Contact,
  voice = '',
): { tone: string; text: string } {
  const firstName = contact.name.split(' ')[0]
  const interest = contact.interests[0]
  const days = contact.daysSinceContact
  const seed = contact.id + firstName
  const tone = fallbackTone(voice)

  if (days >= 30) {
    const longGap: Record<typeof tone, string[]> = {
      warm: [
        `${firstName}! It's been way too long. I keep thinking we're overdue for a proper catch-up — how are things?`,
        `Hey ${firstName}, you crossed my mind today and I realized it's been ages. No agenda — how have you been?`,
      ],
      direct: [
        `Hi ${firstName}, it's been a while. I'd like to catch up and hear how things are going on your side.`,
        `${firstName}, I've been meaning to reconnect. Are you free for a quick catch-up soon?`,
      ],
      playful: [
        `Okay ${firstName}, I have been extremely bad at sending this message. How are you?`,
        `${firstName}, this is my official “too long, let's fix that” message. What's new?`,
      ],
      'low-key': [
        `Hey ${firstName}, you popped into my head today. Hope you've been well — how's life?`,
        `${firstName}, no big agenda here. Just wanted to say hi and see how you're doing.`,
      ],
    }
    return { tone, text: pick(longGap[tone], seed) }
  }

  if (interest) {
    const withInterest: Record<typeof tone, string[]> = {
      warm: [
        `Hey ${firstName}! Something reminded me of you and ${interest} earlier — how's that been going lately?`,
        `${firstName}, I thought of you when ${interest} came up today. Would love to hear how you're doing.`,
      ],
      direct: [
        `Hi ${firstName}, I thought of you when ${interest} came up. How has that been going?`,
        `${firstName}, quick check-in — are you still working on ${interest}?`,
      ],
      playful: [
        `${firstName}, I need a ${interest} update from you. It's been too quiet on that front. How are you?`,
        `Random ${firstName} question: are you still deep in ${interest}, or have we entered a new era?`,
      ],
      'low-key': [
        `Hey ${firstName}, ${interest} made me think of you today. Hope things are good on your end.`,
        `${firstName}, saw something about ${interest} and thought I'd check in. How are you?`,
      ],
    }
    return { tone, text: pick(withInterest[tone], seed) }
  }

  const generic: Record<typeof tone, string[]> = {
    warm: [
      `Hey ${firstName}, no reason in particular — just wanted to check in and see how you're doing.`,
      `${firstName}! You popped into my head, so here's a hello. How's everything going?`,
    ],
    direct: [
      `Hi ${firstName}, just checking in. How are things going?`,
      `${firstName}, I wanted to reconnect and see how you're doing.`,
    ],
    playful: [
      `${firstName}, surprise hello. What's new in your world?`,
      `Hey ${firstName}, your periodic check-in has arrived. How's everything?`,
    ],
    'low-key': [
      `Hey ${firstName}, just wanted to say hi. Hope things are good.`,
      `${firstName}, you came to mind today. How's everything going?`,
    ],
  }
  return { tone, text: pick(generic[tone], seed) }
}

// In-conversation reply suggestions for when the model is unavailable.
// Reacts to the other person's most recent message so chips feel relevant.
export function fallbackReplies(
  contact: Contact,
  lastFromThem?: string,
): { tone: string; text: string }[] {
  const firstName = contact.name.split(' ')[0]
  const interest = contact.interests[0]

  const generic = [
    {
      tone: 'warm',
      text: `That honestly made my day, ${firstName}. Tell me more?`,
    },
    {
      tone: 'curious',
      text: interest
        ? `Love that. Also — how's the ${interest} side of life going?`
        : `Love that. So what's been keeping you busy lately?`,
    },
    {
      tone: 'plan',
      text: `We're overdue for a proper catch-up. Free for a call this week?`,
    },
  ]

  if (!lastFromThem) return generic

  const lower = lastFromThem.toLowerCase()

  if (/(miss|lonely|hard|tired|stress|tough|sad)/.test(lower)) {
    return [
      {
        tone: 'caring',
        text: `Miss you too, ${firstName}. That sounds like a lot — I'm here if you want to talk it through.`,
      },
      {
        tone: 'present',
        text: `Hey, I really hear you. Want to hop on a quick call so it doesn't feel so far away?`,
      },
      generic[2],
    ]
  }

  if (/(\?|how are you|how's|hbu|you\?)/.test(lower)) {
    return [
      {
        tone: 'open',
        text: `Honestly pretty good lately! Been meaning to fill you in. How about you, really?`,
      },
      {
        tone: 'playful',
        text: `Surviving and occasionally thriving 😄 Enough about me though — what's new with you?`,
      },
      generic[2],
    ]
  }

  return generic
}

// Deterministic call talking points for when the model is unavailable. Calls
// have no message to pre-write, so instead we give the user a few specific
// things to raise — which is exactly the anxiety-killer for picking up the
// phone. Tailored from each person's context and interests.
export function fallbackTalkingPoints(contact: Contact): TalkingPoint[] {
  const firstName = contact.name.split(' ')[0]
  const interest = contact.interests[0]
  const points: TalkingPoint[] = []

  points.push({
    label: 'Open with',
    text:
      contact.daysSinceContact >= 14
        ? `Be honest that it's been a while and you just wanted to hear ${firstName}'s voice.`
        : `Tell ${firstName} they popped into your head and you felt like calling.`,
  })

  if (interest) {
    points.push({
      label: 'Ask about',
      text: `How ${interest} has been going lately — let them go into detail.`,
    })
  } else {
    points.push({
      label: 'Ask about',
      text: `What's been keeping ${firstName} busy these days.`,
    })
  }

  if (contact.context) {
    points.push({
      label: 'Check in on',
      text: `${contact.context} — show you remembered and care how it's going.`,
    })
  } else {
    points.push({
      label: 'Suggest',
      text: `Making a loose plan to see each other or talk again soon.`,
    })
  }

  return points.slice(0, 3)
}
