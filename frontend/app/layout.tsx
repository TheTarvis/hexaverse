import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import { LayoutWrapper } from '@/components/layout-wrapper'
import { Toaster } from 'sonner'
import './globals.css'
import '@/components/hud/hud-type.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

// Keep device width/zoom and expose iOS safe-area insets to the full-screen HUD.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export const metadata: Metadata = {
  title: 'Hexaverse',
  description: 'Hexaverse application',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-zinc-100 dark:bg-zinc-700">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="system"
          toastOptions={{ duration: 4000 }}
        />
      </body>
    </html>
  )
}
