'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccountContext } from '@/components/account-provider'
import { AppNavigation } from '@/components/app-navigation'

// Routes that should NOT have the dashboard layout (e.g. login, OAuth callbacks).
// `/spike` stays here for the remaining hex-board/audio spikes (the galaxy-3d
// spike was retired at M2; `/` is now the public galaxy landing, handled below).
const PUBLIC_ROUTES = ['/login', '/oauth', '/spike']

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, authLoading, account, isLoading: accountLoading } = useAccountContext()

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route))
  // The home route is the galaxy view (spec #0002): the logged-out landing AND
  // the primary authed screen. Public to signed-out visitors (no /login
  // redirect), but authed users still get the app shell around it.
  const isHome = pathname === '/'

  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute && !isHome) {
      router.push('/login')
    }
  }, [authLoading, user, isPublicRoute, isHome, router])

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (authLoading || accountLoading) {
    return null
  }

  // Logged-out visitor on the home galaxy view: render it bare (no dashboard
  // shell). The sign-in prompt lives inside the view, at the gated boundary.
  if (!user) {
    return isHome ? <>{children}</> : null
  }

  if (!account) {
    return null
  }

  return <AppNavigation>{children}</AppNavigation>
}
