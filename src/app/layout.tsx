import '@/styles/tailwind.css'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import { getEvents } from '@/data'
import { ApplicationLayout } from './application-layout'
import { AuthProvider } from '@/contexts/AuthContext'
import { ColonyProvider } from '@/contexts/ColonyContext'

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
        <AuthProvider>
          <ColonyProvider>
            <ApplicationLayout events={events}>{children}</ApplicationLayout>
          </ColonyProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
