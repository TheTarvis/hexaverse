import { AuthProvider } from '@/contexts/AuthContext'
import { ColonyProvider } from '@/contexts/ColonyContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { WebSocketProvider } from '@/contexts/WebSocketContext'
import { getEvents } from '@/data'
import '@/styles/tailwind.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ApplicationLayout } from './application-layout'

export const metadata: Metadata = {
  title: {
    template: '%s | Hexaverse',
    default: 'Hexaverse',
  },
  description: 'Explore the Hexaverse',
}

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const events = await getEvents()

  return (
    <html
      lang="en"
      className="text-zinc-950 antialiased lg:bg-zinc-100 dark:bg-zinc-900 dark:text-white dark:lg:bg-zinc-950"
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={inter.variable}>
        <ToastProvider>
          <AuthProvider>
            <WebSocketProvider>
                <ApplicationLayout events={events}>{children}</ApplicationLayout>
            </WebSocketProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
