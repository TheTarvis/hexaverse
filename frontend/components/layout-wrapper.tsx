'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccountContext } from '@/components/account-provider'
import { AppNavigation } from '@/components/app-navigation'

// Routes that should NOT have the dashboard layout (e.g. login, OAuth callbacks).
// `/spike` stays here for the remaining audio spike (galaxy-3d retired at M2,
// hex-board at M7 — the production /systems/[id] board replaced it; `/` is now
// the public galaxy landing, handled below).
const PUBLIC_ROUTES = ['/login', '/oauth', '/spike']

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, authLoading, account, isLoading: accountLoading } = useAccountContext()

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route))
  // The home route is the galaxy view (spec #0002): the logged-out landing AND
  // the primary authed screen. It is full-bleed in BOTH auth states — the canvas
  // IS the window and its panels float over it — so it never gets the dashboard
  // sidebar shell. Authed nav/account controls float within the view instead.
  const isHome = pathname === '/'

  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute && !isHome) {
      router.push('/login')
    }
  }, [authLoading, user, isPublicRoute, isHome, router])

  // Public routes and the immersive home galaxy view render bare (no shell).
  if (isPublicRoute || isHome) {
    return <>{children}</>
  }

  if (authLoading || accountLoading) {
    return null
  }

  if (!user || !account) {
    return null
  }

  return <AppNavigation>{children}</AppNavigation>
}
