import { z } from 'zod'
import {
  CONTACT_LIMITS,
  ENCOUNTER_LIMITS,
  PROFILE_LIMITS,
} from '../persistence-limits.ts'

const optionalText = (max: number) => z.string().max(max).optional()
export const dateOnlyInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  })

export const messageInputSchema = z.object({
  id: z.string().trim().min(1).max(200),
  sender: z.enum(['me', 'them']),
  text: z.string().trim().min(1).max(4_000),
  minutesAgo: z.number().finite().min(0).max(10_000_000),
  sentAt: z.string().datetime().optional(),
  sentOn: dateOnlyInputSchema.optional(),
  channel: z.enum(['whatsapp', 'email']).optional(),
  system: z.boolean().optional(),
})

export const confirmedOutreachInputSchema = messageInputSchema.extend({
  sender: z.literal('me'),
  sentAt: z.string().datetime(),
  // Optional for messages written by older app versions. New confirmations
  // always send this field and the server falls back to sentAt when absent.
  sentOn: dateOnlyInputSchema.optional(),
  channel: z.enum(['whatsapp', 'email']),
})

export const profileInputSchema = z.object({
  name: z.string().max(PROFILE_LIMITS.name),
  photoUrl: optionalText(PROFILE_LIMITS.photoUrl),
  title: optionalText(PROFILE_LIMITS.title),
  company: optionalText(PROFILE_LIMITS.company),
  phone: optionalText(PROFILE_LIMITS.phone),
  email: optionalText(PROFILE_LIMITS.email),
})

const encounterEventSchema = z.object({
  id: z.string().trim().min(1).max(ENCOUNTER_LIMITS.eventId),
  name: z.string().trim().min(1).max(ENCOUNTER_LIMITS.eventName),
  date: dateOnlyInputSchema.optional(),
  location: optionalText(ENCOUNTER_LIMITS.location),
})

const encounterNextStepSchema = z.object({
  kind: z.enum([
    'send-deck',
    'send-quote',
    'make-introduction',
    'book-meeting',
    'send-sample',
    'application',
    'follow-up',
    'custom',
  ]),
  label: z.string().trim().min(1).max(ENCOUNTER_LIMITS.nextStepLabel),
  owner: z.enum(['me', 'them', 'shared']),
  dueOn: dateOnlyInputSchema.optional(),
  status: z.enum(['open', 'done', 'dismissed']),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
})

export const encounterInputSchema = z.object({
  version: z.literal(1),
  captureMethod: z.enum([
    'card-scan',
    'qr-scan',
    'manual',
    'contact-import',
  ]),
  capturedAt: z.string().datetime(),
  event: encounterEventSchema.optional(),
  memorySeed: optionalText(ENCOUNTER_LIMITS.memorySeed),
  nextStep: encounterNextStepSchema.optional(),
  reviewState: z.enum(['pending', 'reviewed']),
  disposition: z.enum(['important', 'later', 'none']).optional(),
  reviewedAt: z.string().datetime().optional(),
})

export const contactInputSchema = z.object({
  id: z.string().trim().min(1).max(CONTACT_LIMITS.id),
  name: z.string().trim().min(1).max(CONTACT_LIMITS.name),
  relationship: z.string().max(CONTACT_LIMITS.relationship).default(''),
  title: optionalText(CONTACT_LIMITS.title),
  tier: z.enum(['key', 'network', 'casual']).optional(),
  phone: optionalText(CONTACT_LIMITS.phone),
  email: optionalText(CONTACT_LIMITS.email),
  avatarHue: z
    .enum(['coral', 'teal', 'amber', 'rose', 'sage'])
    .default('coral'),
  photoUrl: optionalText(500_000),
  daysSinceContact: z
    .number()
    .finite()
    .min(0)
    .max(CONTACT_LIMITS.daysSinceContact)
    .default(0),
  lastContactedAt: dateOnlyInputSchema.nullable().optional(),
  context: z.string().max(CONTACT_LIMITS.context).default(''),
  interests: z
    .array(z.string().max(CONTACT_LIMITS.interest))
    .max(CONTACT_LIMITS.interests)
    .default([]),
  encounters: z
    .array(encounterInputSchema)
    .max(ENCOUNTER_LIMITS.encounters)
    .optional(),
  groups: z
    .array(z.string().max(CONTACT_LIMITS.group))
    .max(CONTACT_LIMITS.groups)
    .optional(),
  messages: z.array(messageInputSchema).max(100).default([]),
})

export const contactUpdateInputSchema = z.object({
  name: optionalText(CONTACT_LIMITS.name),
  relationship: optionalText(CONTACT_LIMITS.relationship),
  title: optionalText(CONTACT_LIMITS.title),
  tier: z.enum(['key', 'network', 'casual']).optional(),
  phone: optionalText(CONTACT_LIMITS.phone),
  email: optionalText(CONTACT_LIMITS.email),
  context: optionalText(CONTACT_LIMITS.context),
  interests: z
    .array(z.string().max(CONTACT_LIMITS.interest))
    .max(CONTACT_LIMITS.interests)
    .optional(),
  encounters: z
    .array(encounterInputSchema)
    .max(ENCOUNTER_LIMITS.encounters)
    .nullable()
    .optional(),
  lastContactedAt: dateOnlyInputSchema.nullable().optional(),
})
