import type { Metadata, Viewport } from 'next'
import { NativeAuthLinkHandler } from '@/components/native-auth-link-handler'
import { ProductAnalytics } from '@/components/product-analytics'
import { SystemTheme } from '@/components/system-theme'
import './globals.css'

const systemThemeBootstrap = `(() => {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})()`

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
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: systemThemeBootstrap }} />
      </head>
      <body className="font-sans antialiased">
        <SystemTheme />
        <NativeAuthLinkHandler />
        {children}
        <ProductAnalytics />
      </body>
    </html>
  )
}
