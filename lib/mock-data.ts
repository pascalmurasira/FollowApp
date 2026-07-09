import type { Contact } from './types'

export const CURRENT_USER = {
  name: 'You',
  /** A little about you, so the AI writes in a voice that fits. */
  voice:
    'Warm but direct. Keeps messages short and genuine. Professional without being stiff — no corporate jargon, no fake enthusiasm.',
}

export const DEMO_CONTACT_IDS = new Set([
  'maya',
  'david',
  'priya',
  'theo',
  'grace',
  'jordan',
])

export const CONTACTS: Contact[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    relationship: 'Former teammate',
    title: 'Product Designer · Linear',
    phone: '+14155550101',
    email: 'maya.chen@example.com',
    avatarHue: 'coral',
    tier: 'network',
    daysSinceContact: 23,
    context:
      'You shipped two products together at your last company before she left for Linear. Easy to talk to and great taste. You keep meaning to catch up properly but it always slips.',
    interests: ['design systems', 'her move to Linear', 'side projects', 'the team you both miss'],
    messages: [],
  },
  {
    id: 'david',
    name: 'David Okafor',
    relationship: 'Former manager',
    title: 'VP Engineering · Stripe',
    phone: '+14155550102',
    email: 'david.okafor@example.com',
    avatarHue: 'amber',
    tier: 'key',
    daysSinceContact: 11,
    context:
      'He was the best manager you ever had and still sends you the occasional article. He has opened doors for you before and genuinely roots for your career. Worth staying close to.',
    interests: ['scaling teams', 'the article he sent', 'your career', 'where he is hiring'],
    messages: [],
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    relationship: 'Ex-colleague, now founder',
    title: 'Co-founder · Loop',
    phone: '+14155550103',
    email: 'priya.nair@example.com',
    avatarHue: 'teal',
    tier: 'key',
    daysSinceContact: 47,
    context:
      'You worked together for three years and got lunch every week. She just raised a seed round for her startup. The longer it goes the more awkward it feels to reach out, but she is exactly the kind of person you want to stay close to.',
    interests: ['her seed raise', 'building Loop', 'hiring', 'the lunch you always meant to schedule'],
    messages: [],
  },
  {
    id: 'theo',
    name: 'Theo Almeida',
    relationship: 'Met at a conference',
    title: 'Eng Manager · Figma',
    phone: '+14155550104',
    email: 'theo@almeida.studio',
    avatarHue: 'rose',
    tier: 'network',
    daysSinceContact: 5,
    context:
      'You hit it off at a conference talk and swapped numbers, then traded a couple of messages. There is a real connection to build on here if you follow up before it goes cold.',
    interests: ['the talk you both saw', 'developer tooling', 'his team at Figma', 'grabbing coffee'],
    messages: [],
  },
  {
    id: 'grace',
    name: 'Grace Lin',
    relationship: 'Mentor',
    title: 'Partner · Amplify Ventures',
    phone: '+14155550105',
    email: 'grace.lin@example.com',
    avatarHue: 'sage',
    tier: 'key',
    daysSinceContact: 18,
    context:
      'She has mentored you for years and always makes time when you ask. She invests in early-stage founders and likes hearing what you are working on. A quick, thoughtful check-in goes a long way.',
    interests: ['what you are building', 'the founders she is backing', 'her advice on your next move', 'her garden'],
    messages: [],
  },
  {
    id: 'jordan',
    name: 'Jordan Reyes',
    relationship: 'Potential collaborator',
    title: 'Head of Growth · Notion',
    phone: '+14155550106',
    email: 'jordan.reyes@example.com',
    avatarHue: 'coral',
    tier: 'casual',
    daysSinceContact: 31,
    context:
      'You both keep saying "we should find a way to work together" and then nothing happens. There is a real opportunity here if someone actually proposes something concrete.',
    interests: ['growth experiments', 'a possible collaboration', 'his work at Notion', 'the intro you offered'],
    messages: [],
  },
]
