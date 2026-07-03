import type { Contact } from './types'

export const CURRENT_USER = {
  name: 'You',
  /** A little about you, so the AI writes in a voice that fits. */
  voice:
    'Warm but direct. Keeps messages short and genuine. Professional without being stiff — no corporate jargon, no fake enthusiasm.',
}

export const CONTACTS: Contact[] = [
  {
    id: 'maya',
    name: 'Maya Chen',
    relationship: 'Former teammate',
    title: 'Product Designer · Linear',
    phone: '+493012345670',
    email: 'maya.chen@hey.com',
    avatarHue: 'coral',
    tier: 'network',
    daysSinceContact: 23,
    context:
      'You shipped two products together at your last company before she left for Linear. Easy to talk to and great taste. You keep meaning to catch up properly but it always slips.',
    interests: ['design systems', 'her move to Linear', 'side projects', 'the team you both miss'],
    messages: [
      { id: 'm1', sender: 'them', text: 'just shipped the new onboarding flow, finally', minutesAgo: 33120 },
      { id: 'm2', sender: 'me', text: 'huge, congrats! would love to see it', minutesAgo: 33100 },
      { id: 'm3', sender: 'them', text: 'will send a link. we should properly catch up sometime', minutesAgo: 33090 },
    ],
  },
  {
    id: 'dad',
    name: 'David Okafor',
    relationship: 'Former manager',
    title: 'VP Engineering · Stripe',
    phone: '+14155550142',
    email: 'david.okafor@stripe.com',
    avatarHue: 'amber',
    tier: 'key',
    daysSinceContact: 11,
    context:
      'He was the best manager you ever had and still sends you the occasional article. He has opened doors for you before and genuinely roots for your career. Worth staying close to.',
    interests: ['scaling teams', 'the article he sent', 'your career', 'where he is hiring'],
    messages: [
      { id: 'd1', sender: 'them', text: 'Saw this piece on eng leadership, made me think of our old debates', minutesAgo: 15840 },
      { id: 'd2', sender: 'them', text: 'Hope things are going well on your end', minutesAgo: 15835 },
    ],
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    relationship: 'Ex-colleague, now founder',
    title: 'Co-founder · Loop',
    phone: '+14155550178',
    email: 'priya.nair@gmail.com',
    avatarHue: 'teal',
    tier: 'key',
    daysSinceContact: 47,
    context:
      'You worked together for three years and got lunch every week. She just raised a seed round for her startup. The longer it goes the more awkward it feels to reach out, but she is exactly the kind of person you want to stay close to.',
    interests: ['her seed raise', 'building Loop', 'hiring', 'the lunch you always meant to schedule'],
    messages: [
      { id: 'p1', sender: 'me', text: 'last day today — we HAVE to stay in touch', minutesAgo: 67680 },
      { id: 'p2', sender: 'them', text: 'obviously!! lunch soon, im booking it', minutesAgo: 67670 },
    ],
  },
  {
    id: 'theo',
    name: 'Theo Almeida',
    relationship: 'Met at a conference',
    title: 'Eng Manager · Figma',
    phone: '+14155550195',
    email: 'theo@almeida.studio',
    avatarHue: 'rose',
    tier: 'network',
    daysSinceContact: 5,
    context:
      'You hit it off at a conference talk and swapped numbers, then traded a couple of messages. There is a real connection to build on here if you follow up before it goes cold.',
    interests: ['the talk you both saw', 'developer tooling', 'his team at Figma', 'grabbing coffee'],
    messages: [
      { id: 't1', sender: 'them', text: 'great running into you at the conf — that talk was 🔥', minutesAgo: 7200 },
      { id: 't2', sender: 'me', text: 'right? we should grab coffee while youre in town', minutesAgo: 7150 },
      { id: 't3', sender: 'them', text: 'yes lets do it. im around till friday', minutesAgo: 7140 },
    ],
  },
  {
    id: 'gran',
    name: 'Grace Lin',
    relationship: 'Mentor',
    title: 'Partner · Amplify Ventures',
    phone: '+14155550111',
    email: 'grace.lin@gmail.com',
    avatarHue: 'sage',
    tier: 'key',
    daysSinceContact: 18,
    context:
      'She has mentored you for years and always makes time when you ask. She invests in early-stage founders and likes hearing what you are working on. A quick, thoughtful check-in goes a long way.',
    interests: ['what you are building', 'the founders she is backing', 'her advice on your next move', 'her garden'],
    messages: [
      { id: 'g1', sender: 'them', text: 'Saw your name on that panel lineup — proud of you', minutesAgo: 25920 },
      { id: 'g2', sender: 'them', text: 'Let me know if you ever want to talk through the next step', minutesAgo: 25910 },
    ],
  },
  {
    id: 'jordan',
    name: 'Jordan Reyes',
    relationship: 'Potential collaborator',
    title: 'Head of Growth · Notion',
    phone: '+14155550133',
    email: 'jordan.reyes@gmail.com',
    avatarHue: 'coral',
    tier: 'casual',
    daysSinceContact: 31,
    context:
      'You both keep saying "we should find a way to work together" and then nothing happens. There is a real opportunity here if someone actually proposes something concrete.',
    interests: ['growth experiments', 'a possible collaboration', 'his work at Notion', 'the intro you offered'],
    messages: [
      { id: 'j1', sender: 'me', text: 'we really should find a way to work together', minutesAgo: 44640 },
      { id: 'j2', sender: 'them', text: 'agreed. lets actually make it happen this quarter', minutesAgo: 44600 },
      { id: 'j3', sender: 'me', text: 'def. ill put some thoughts together', minutesAgo: 44590 },
    ],
  },
]
