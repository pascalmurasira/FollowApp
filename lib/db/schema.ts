import {
  bigint,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.
// `dataDeviceId` is our one addition: the canonical anonymous deviceId whose
// rows (profile, contacts, circles, memory) this account owns. It lets every
// existing deviceId-scoped query keep working while syncing across devices.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  dataDeviceId: text('dataDeviceId'),
  // Normalized (E.164-ish) phone used to match a contact to a real user for
  // in-app chat. Nullable: only set once a user verifies/saves their number.
  phone: text('phone'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

/**
 * Anonymous, per-device interaction signals. We scope every read/write by
 * `deviceId` (there is no auth / RLS here) so a device only ever sees its own
 * memory. These signals are summarized and fed back into the AI prompts so the
 * openers adapt to how each person actually texts.
 */
export const memorySignals = pgTable(
  'memory_signals',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    deviceId: text('device_id').notNull(),
    contactId: text('contact_id'),
    // 'send' | 'skip' | 'edit' | 'tone' | 'regenerate'
    kind: text('kind').notNull(),
    tone: text('tone'),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('memory_signals_device_created_idx').on(t.deviceId, t.createdAt)],
)

export type MemorySignal = typeof memorySignals.$inferSelect

/**
 * One profile row per device. Stores the display name shown on the You tab and
 * an optional small profile photo (a downscaled ~256px JPEG data URL — kept
 * tiny so it lives comfortably in a text column with no blob storage needed).
 */
export const profiles = pgTable('profiles', {
  deviceId: text('device_id').primaryKey(),
  name: text('name').notNull().default('You'),
  photoUrl: text('photo_url'),
  // Optional digital business-card fields, shown on the user's shareable card.
  title: text('title'),
  company: text('company'),
  phone: text('phone'),
  email: text('email'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ProfileRow = typeof profiles.$inferSelect

/**
 * Contacts a device adds to Nudge (the built-in demo contacts are not stored
 * here). Scoped by `deviceId`; `interests` is a JSON-encoded string array.
 */
export const userContacts = pgTable(
  'user_contacts',
  {
    id: text('id').primaryKey(),
    deviceId: text('device_id').notNull(),
    name: text('name').notNull(),
    relationship: text('relationship'),
    title: text('title'),
    tier: text('tier'),
    phone: text('phone'),
    email: text('email'),
    avatarHue: text('avatar_hue'),
    context: text('context'),
    interests: text('interests'),
    /** Versioned JSON for event, memory seed, and promised next action. */
    encounterData: text('encounter_data'),
    /** Bounded JSON array of user-confirmed external outreach events. */
    messages: text('messages').notNull().default('[]'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  },
  (t) => [
    index('user_contacts_device_idx').on(t.deviceId, t.createdAt),
    index('user_contacts_device_last_contacted_idx').on(t.deviceId, t.lastContactedAt),
  ],
)

export type UserContactRow = typeof userContacts.$inferSelect

/**
 * Circle ("group") assignment for any contact — built-in or user-added —
 * keyed by (deviceId, contactId) so every device manages its own grouping.
 * One circle per contact keeps the UI simple.
 */
export const circleTags = pgTable(
  'circle_tags',
  {
    deviceId: text('device_id').notNull(),
    contactId: text('contact_id').notNull(),
    circle: text('circle').notNull(),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.contactId] })],
)

export type CircleTagRow = typeof circleTags.$inferSelect

// --- In-app chat (FollowApp-to-FollowApp) ----------------------------------
// Two authenticated users can chat inside the app once a link request is
// accepted. `pairKey` is the two user ids sorted and joined with ':' so a pair
// has exactly one canonical key regardless of who initiated.

/**
 * A chat-link relationship between two users. Created as 'pending' by the
 * requester and flipped to 'accepted' / 'declined' by the recipient. The
 * unique `pairKey` guarantees at most one link per pair.
 */
export const contactLinks = pgTable(
  'contact_links',
  {
    id: text('id').primaryKey(),
    pairKey: text('pair_key').notNull().unique(),
    requesterUserId: text('requester_user_id').notNull(),
    recipientUserId: text('recipient_user_id').notNull(),
    // 'pending' | 'accepted' | 'declined'
    status: text('status').notNull().default('pending'),
    intro: text('intro'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    index('contact_links_recipient_idx').on(t.recipientUserId, t.status),
    index('contact_links_requester_idx').on(t.requesterUserId, t.status),
  ],
)

export type ContactLinkRow = typeof contactLinks.$inferSelect

/**
 * A single in-app message between two linked users. The monotonic `id` doubles
 * as the polling cursor — clients fetch rows with `id > lastSeenId`.
 */
export const directMessages = pgTable(
  'direct_messages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    pairKey: text('pair_key').notNull(),
    senderUserId: text('sender_user_id').notNull(),
    recipientUserId: text('recipient_user_id').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [index('direct_messages_pair_idx').on(t.pairKey, t.id)],
)

export type DirectMessageRow = typeof directMessages.$inferSelect
