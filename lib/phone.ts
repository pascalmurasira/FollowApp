/** WhatsApp routing is allowed only when the user supplied a country code. */
export function toInternationalWhatsAppNumber(phone?: string): string | null {
  const raw = (phone ?? '').trim()
  if (raw.startsWith('+')) {
    const digits = raw.replace(/\D/g, '')
    return digits.length >= 8 ? digits : null
  }
  if (raw.startsWith('00')) {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '')
    return digits.length >= 8 ? digits : null
  }
  return null
}
