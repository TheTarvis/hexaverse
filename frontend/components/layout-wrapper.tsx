'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccountContext } from '@/components/account-provider'
import { useCorporationContext } from '@/components/corporation-provider'
import { WakeUpFlow } from '@/components/wake-up-flow'
import { FloatingNav } from '@/components/floating-nav'

// Routes that should NOT be gated at all (e.g. login, OAuth callbacks, spikes).
// `/spike` stays here for the remaining audio spike.
const PUBLIC_ROUTES = ['/login', '/oauth', '/spike']

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, authLoading, account, isLoading: accountLoading } = useAccountContext()
  const { needsWake, isLoading: corpLoading } = useCorporationContext()

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route))
  // The home route is the galaxy view (spec #0002): the logged-out landing AND
  // the primary authed screen.
  const isHome = pathname === '/'

  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute && !isHome) {
      router.push('/login')
    }
  }, [authLoading, user, isPublicRoute, isHome, router])

  // Public routes (login/oauth/spike) always render bare, never gated.
  if (isPublicRoute) {
    return <>{children}</>
  }

  // Wake gate (#0009): a signed-in account with no living corporation must wake
  // before it can play — this takes over the whole screen. While the corp is
  // still resolving, hold a blank frame so a corpless user never flashes the
  // live app before the wake-up flow.
  if (user && account) {
    if (corpLoading) return null
    if (needsWake) return <WakeUpFlow />
    // Woken: the WHOLE app is full-bleed canvas with floating cards — every
    // route (galaxy, system board, …) renders bare, with the floating nav/account
    // chrome over it. There is no sidebar shell (spec #0002 canvas model): the
    // window IS the canvas, and every component floats over it.
    return (
      <>
        {children}
        <FloatingNav />
      </>
    )
  }

  // Logged-out home: the galaxy start area renders bare, with its own in-view
  // sign-in prompt. Any other logged-out route is redirected by the effect above.
  if (isHome) {
    return <>{children}</>
  }

  // Auth still resolving, or a logged-out user mid-redirect — render nothing.
  if (authLoading || accountLoading) {
    return null
  }
  return null
}
