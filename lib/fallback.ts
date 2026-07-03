import type { Contact, TalkingPoint } from '@/lib/types'

// Deterministic, no-AI openers so the app is always useful even when the
// model is rate-limited or offline. Varied by contact so the feed never
// looks copy-pasted, and tailored using each person's context/interests.

function pick<T>(options: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return options[Math.abs(hash) % options.length]
}

export function fallbackNudge(contact: Contact): { tone: string; text: string } {
  const firstName = contact.name.split(' ')[0]
  const interest = contact.interests[0]
  const days = contact.daysSinceContact
  const seed = contact.id + firstName

  if (days >= 30) {
    const longGap = [
      {
        tone: 'reconnect',
        text: `Hey ${firstName}, you crossed my mind today and I realized it's been ages. No agenda — how have you been?`,
      },
      {
        tone: 'honest',
        text: `Okay ${firstName}, I've been meaning to message you for embarrassingly long. Consider this me finally fixing that. How's life?`,
      },
      {
        tone: 'warm',
        text: `${firstName}! It's been way too long. I keep thinking we're overdue for a proper catch-up — how are things?`,
      },
    ]
    return pick(longGap, seed)
  }

  if (interest) {
    const withInterest = [
      {
        tone: 'easy',
        text: `Hey ${firstName}! Something reminded me of you and ${interest} earlier — how's that been going lately?`,
      },
      {
        tone: 'curious',
        text: `Random ${firstName} question: are you still deep into ${interest}? Thought of you and figured I'd just ask.`,
      },
      {
        tone: 'playful',
        text: `${firstName}, I need a ${interest} update from you. It's been too quiet on that front. How are you?`,
      },
    ]
    return pick(withInterest, seed)
  }

  const generic = [
    {
      tone: 'casual',
      text: `Hey ${firstName}, no reason in particular — just wanted to check in and see how you're doing.`,
    },
    {
      tone: 'low-key',
      text: `${firstName}! You popped into my head, so here's a hello. How's everything going?`,
    },
  ]
  return pick(generic, seed)
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

// A simulated reply from the friend for when the model is unavailable, so
// the demo conversation always continues naturally.
export function fallbackFriendReply(contact: Contact): string {
  const firstName = (contact.name.split(' ')[0] || 'there').toLowerCase()
  const interest = contact.interests[0]
  const options = [
    `aw this honestly means a lot, thank you. i've missed you too`,
    `omg hi!! perfect timing, i was just thinking about you`,
    interest
      ? `ha yes still very much into ${interest}. we really need to catch up properly`
      : `we really need to catch up properly. how have YOU been??`,
    `okay we are NOT letting it go this long again. call this weekend?`,
  ]
  let hash = 0
  const seed = contact.id + contact.messages.length
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  void firstName
  return options[Math.abs(hash) % options.length]
}
