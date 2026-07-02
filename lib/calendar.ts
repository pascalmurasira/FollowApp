// Calendar helpers — build and download a standards-compliant .ics file so an
// appointment opens in any calendar app (Google, Outlook, Apple) with no auth.
// Everything is client-side; nothing is stored or sent to a server.

export interface CalendarEvent {
  title: string
  /** Local date in YYYY-MM-DD form (from a <input type="date">). */
  date: string
  /** Local time in HH:MM (24h) form (from a <input type="time">). */
  time: string
  /** Event length in minutes. */
  durationMinutes: number
  location?: string
  notes?: string
}

/** Escape a value for an ICS text field per RFC 5545 (commas, semicolons, etc.). */
function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Format a Date as a UTC ICS timestamp: YYYYMMDDTHHMMSSZ. */
function toICSDateUTC(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  )
}

/** Combine a local date + time string into a real Date in the user's timezone. */
export function combineDateTime(date: string, time: string): Date {
  // `new Date('YYYY-MM-DDTHH:MM')` is parsed as local time, which is what we
  // want — the user picked wall-clock values; we convert to UTC on output.
  return new Date(`${date}T${time || '09:00'}`)
}

/** Build the full VCALENDAR/VEVENT text for the given event. */
export function buildICS(event: CalendarEvent): string {
  const start = combineDateTime(event.date, event.time)
  const end = new Date(start.getTime() + event.durationMinutes * 60_000)
  const uid = `${start.getTime()}-${Math.random().toString(36).slice(2)}@followapp`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FollowApp//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDateUTC(new Date())}`,
    `DTSTART:${toICSDateUTC(start)}`,
    `DTEND:${toICSDateUTC(end)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    event.notes ? `DESCRIPTION:${escapeICS(event.notes)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  // RFC 5545 requires CRLF line breaks.
  return lines.join('\r\n')
}

/** Trigger a download of the event as a .ics file. */
export function downloadICS(event: CalendarEvent): void {
  const ics = buildICS(event)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const safeName = event.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName || 'appointment'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Release the object URL on the next tick so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A sensible default appointment title from a contact's name. */
export function defaultEventTitle(contactName?: string): string {
  const first = contactName?.split(' ')[0]
  return first ? `Coffee with ${first}` : 'Follow-up'
}

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

/** Local YYYY-MM-DD for a Date (respects the user's timezone). */
export function toDateInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Guess a default date from free text (e.g. a plan message that says
 * "how about Thursday?"). Recognizes "today", "tomorrow", and weekday names,
 * always resolving to the *next* matching day. Falls back to tomorrow so the
 * modal never opens on a past date.
 */
export function guessDateFromText(text?: string): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (!text) return toDateInputValue(tomorrow)

  const lower = text.toLowerCase()

  if (/\btoday\b/.test(lower)) return toDateInputValue(new Date())
  if (/\btomorrow\b/.test(lower)) return toDateInputValue(tomorrow)

  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b${WEEKDAYS[i]}\\b`)
    if (re.test(lower)) {
      const now = new Date()
      const current = now.getDay()
      let add = (i - current + 7) % 7
      if (add === 0) add = 7 // "next" occurrence, not today
      const target = new Date(now)
      target.setDate(now.getDate() + add)
      return toDateInputValue(target)
    }
  }

  return toDateInputValue(tomorrow)
}
