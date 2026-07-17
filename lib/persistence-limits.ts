/** Shared client/server limits so an accepted optimistic write round-trips intact. */
export const CONTACT_LIMITS = {
  id: 160,
  name: 120,
  relationship: 180,
  title: 180,
  phone: 80,
  email: 254,
  context: 2_000,
  interest: 80,
  interests: 20,
  group: 120,
  groups: 50,
  daysSinceContact: 3_650,
} as const

export const PROFILE_LIMITS = {
  name: 200,
  photoUrl: 500_000,
  title: 300,
  company: 300,
  phone: 100,
  email: 320,
} as const
