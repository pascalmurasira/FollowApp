import type { Metadata } from 'next'
import { PublicCard } from '@/components/public-card'

export const metadata: Metadata = {
  title: 'Contact card · FollowApp',
  description: 'Save this contact and stay close with FollowApp.',
  referrer: 'no-referrer',
}

/**
 * The client reads new card payloads from the URL fragment so personal fields
 * never reach the web server. `initialToken` preserves old ?c= links already
 * shared by earlier versions.
 */
export default async function CardPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams
  return <PublicCard initialToken={c} />
}
