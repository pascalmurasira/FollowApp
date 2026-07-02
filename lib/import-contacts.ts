import { inferCompanyFromEmail, type NewContactInput } from '@/lib/contacts-store'

/**
 * Dependency-free contact import. Parses CSV exports (LinkedIn, Google
 * Contacts, or a generic fallback) and free-typed text into a list of
 * `ParsedContact`s the user can review before saving. No third-party parser —
 * the CSV reader below handles quoting, embedded commas, and newlines.
 */

export interface ParsedContact {
  name: string
  /** Role + company, pre-combined for the `title` field. */
  title?: string
  company?: string
  position?: string
  email?: string
  phone?: string
}

/** Detected shape of an imported file, surfaced in the review UI. */
export type ImportSource = 'linkedin' | 'google' | 'generic' | 'text'

export interface ParseResult {
  source: ImportSource
  contacts: ParsedContact[]
}

/**
 * Minimal RFC-4180-ish CSV parser. Returns rows of string cells. Handles
 * double-quoted fields, escaped quotes (""), and CR/LF line endings.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      // Consume \r\n as a single break.
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      // Skip fully blank lines.
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      cell += char
    }
  }
  // Flush trailing cell/row.
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

/** Normalize a header cell for matching: lowercase, trimmed, no punctuation. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Find the index of the first header matching any of the candidate names. */
function findCol(headers: string[], candidates: string[]): number {
  const normalized = headers.map(normHeader)
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand)
    if (idx !== -1) return idx
  }
  // Loose contains-match as a fallback.
  for (let i = 0; i < normalized.length; i++) {
    if (candidates.some((c) => normalized[i].includes(c))) return i
  }
  return -1
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()

function combineTitle(position?: string, company?: string): string | undefined {
  const p = position?.trim()
  const c = company?.trim()
  if (p && c) return `${p} · ${c}`
  return p || c || undefined
}

/**
 * Locate the real header row. LinkedIn prepends a "Notes:" preamble before the
 * actual columns, so scan the first several rows for one that looks like a
 * header (contains a name/email/company-style column).
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const norm = rows[i].map(normHeader)
    const hasName = norm.some((h) =>
      ['first name', 'name', 'given name', 'full name'].includes(h),
    )
    const hasSignal = norm.some((h) =>
      ['email address', 'e mail 1 value', 'company', 'position', 'organization 1 name'].some(
        (s) => h.includes(s.split(' ')[0]),
      ),
    )
    if (hasName || hasSignal) return i
  }
  return 0
}

/** Map parsed CSV rows into contacts, auto-detecting the export format. */
export function parseContactsCsv(text: string): ParseResult {
  const rows = parseCsv(text)
  if (rows.length === 0) return { source: 'generic', contacts: [] }

  const headerIdx = findHeaderRow(rows)
  const headers = rows[headerIdx]
  const body = rows.slice(headerIdx + 1)
  const norm = headers.map(normHeader)

  const isLinkedIn =
    norm.includes('first name') &&
    (norm.includes('company') || norm.includes('position'))
  const isGoogle = norm.some((h) => h.startsWith('e mail 1')) || norm.includes('given name')
  const source: ImportSource = isLinkedIn ? 'linkedin' : isGoogle ? 'google' : 'generic'

  const firstNameCol = findCol(headers, ['first name', 'given name'])
  const lastNameCol = findCol(headers, ['last name', 'family name'])
  const fullNameCol = findCol(headers, ['name', 'full name', 'display name'])
  const emailCol = findCol(headers, ['email address', 'e mail 1 value', 'email', 'e mail'])
  const phoneCol = findCol(headers, ['phone 1 value', 'phone', 'mobile', 'tel'])
  const companyCol = findCol(headers, ['company', 'organization 1 name', 'organization'])
  const positionCol = findCol(headers, ['position', 'organization 1 title', 'title', 'job title'])

  const at = (row: string[], idx: number) => (idx >= 0 ? (row[idx] ?? '').trim() : '')

  const seen = new Set<string>()
  const contacts: ParsedContact[] = []

  for (const row of body) {
    if (row.every((c) => !c.trim())) continue

    let name = ''
    if (firstNameCol >= 0 || lastNameCol >= 0) {
      name = `${at(row, firstNameCol)} ${at(row, lastNameCol)}`.trim()
    }
    if (!name && fullNameCol >= 0) name = at(row, fullNameCol)

    const email = at(row, emailCol)
    if (!name && email) name = titleCase(email.split('@')[0].replace(/[._]+/g, ' '))
    if (!name) continue

    const company = at(row, companyCol)
    const position = at(row, positionCol)

    // De-dupe by lowercased name + email.
    const key = `${name.toLowerCase()}|${email.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    contacts.push({
      name,
      company: company || undefined,
      position: position || undefined,
      title: combineTitle(position, company),
      email: email || undefined,
      phone: at(row, phoneCol) || undefined,
    })
  }

  return { source, contacts }
}

/**
 * Parse free-typed text: one contact per line. Supports a few loose shapes:
 *   "Maya Chen, Design Lead at Linear, maya@linear.app"
 *   "Sam Park - PM, Vercel"
 *   "Priya Nair"
 */
export function parseContactsText(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/
  const seen = new Set<string>()
  const contacts: ParsedContact[] = []

  for (const line of lines) {
    let rest = line
    let email: string | undefined
    const emailMatch = rest.match(emailRe)
    if (emailMatch) {
      email = emailMatch[0]
      rest = rest.replace(emailMatch[0], '').trim()
    }

    // Split on commas or dashes into [name, role/company...]
    const parts = rest
      .split(/[,–—-]|\bat\b/)
      .map((p) => p.trim())
      .filter(Boolean)

    let name = parts[0] ?? ''
    if (!name && email) name = titleCase(email.split('@')[0].replace(/[._]+/g, ' '))
    if (!name) continue

    const remainder = parts.slice(1).join(' · ') || undefined
    const key = `${name.toLowerCase()}|${(email ?? '').toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    contacts.push({ name, title: remainder, email })
  }

  return { source: 'text', contacts }
}

/** Convert a reviewed ParsedContact into the store's NewContactInput shape. */
export function toNewContactInput(
  c: ParsedContact,
  tier: NewContactInput['tier'] = 'network',
): NewContactInput {
  const firstName = c.name.split(' ')[0]
  // If the export gave no company/title, try to infer the company from a work
  // email domain so name-and-email-only rows still carry useful context.
  const company = c.company ?? (c.title ? undefined : inferCompanyFromEmail(c.email))
  const title = c.title ?? (company ? `Works at ${company}` : undefined)
  const context = title
    ? `${c.name} — ${title}. Imported into FollowApp to keep in touch.`
    : `You added ${firstName} to FollowApp to stay in better touch.`
  return {
    name: c.name,
    relationship: company ? `Connection at ${company}` : 'A connection worth keeping',
    title,
    tier,
    phone: c.phone,
    context,
    interests: [],
  }
}
