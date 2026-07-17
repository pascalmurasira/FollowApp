import { z } from 'zod'

const optionalText = (max: number) => z.string().max(max).optional()

export const profileInputSchema = z.object({
  name: z.string().max(200),
  photoUrl: optionalText(500_000),
  title: optionalText(300),
  company: optionalText(300),
  phone: optionalText(100),
  email: optionalText(320),
})

export const contactInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  relationship: z.string().max(500).default(''),
  title: optionalText(300),
  tier: z.enum(['key', 'network', 'casual']).optional(),
  phone: optionalText(100),
  email: optionalText(320),
  avatarHue: z
    .enum(['coral', 'teal', 'amber', 'rose', 'sage'])
    .default('coral'),
  photoUrl: optionalText(500_000),
  daysSinceContact: z.number().finite().min(0).max(100_000).default(0),
  lastContactedAt: z.string().max(10).nullable().optional(),
  context: z.string().max(4_000).default(''),
  interests: z.array(z.string().max(300)).max(30).default([]),
  groups: z.array(z.string().max(120)).max(50).optional(),
  // Messages are not persisted for imported contacts, but accepting a bounded
  // array keeps this schema compatible with the client-side Contact shape.
  messages: z.array(z.unknown()).max(100).default([]),
})

export const contactUpdateInputSchema = z.object({
  name: optionalText(200),
  relationship: optionalText(500),
  title: optionalText(300),
  tier: z.enum(['key', 'network', 'casual']).optional(),
  phone: optionalText(100),
  email: optionalText(320),
  context: optionalText(4_000),
  interests: z.array(z.string().max(300)).max(30).optional(),
  lastContactedAt: z.string().max(10).nullable().optional(),
})
