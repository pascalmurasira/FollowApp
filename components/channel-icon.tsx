import { Mail } from 'lucide-react'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import type { ChannelId } from '@/lib/channels'

/** Renders the brand/channel glyph for a given delivery channel. */
export function ChannelIcon({
  channel,
  className,
}: {
  channel: ChannelId
  className?: string
}) {
  if (channel === 'whatsapp') return <WhatsAppIcon className={className} />
  return <Mail className={className} />
}
