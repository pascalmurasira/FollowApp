import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FollowApp — keep your professional relationships warm',
  description:
    'The follow-up app for busy professionals. FollowApp tells you who to reach and writes the opener — so staying in touch fits your schedule.',
  applicationName: 'FollowApp',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FollowApp',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Extend under the notch / home indicator so the env(safe-area-inset-*)
  // padding used throughout the app actually resolves to real values.
  viewportFit: 'cover',
  // Shrink the layout (not just the visual viewport) when the on-screen
  // keyboard opens, keeping the bottom-anchored composers above it.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#172033' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
