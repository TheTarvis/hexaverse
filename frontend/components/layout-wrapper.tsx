'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccountContext } from '@/components/account-provider'
import { useCorporationContext } from '@/components/corporation-provider'
import { WakeUpFlow } from '@/components/wake-up-flow'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'

// Routes that should NOT be gated at all (e.g. login, OAuth callbacks, spikes).
// `/spike` stays here for the remaining audio spike.
// `/dev` holds the dev-only emulator sign-in route (`/dev/login`), which gates
// itself with `notFound()` outside development; it must render ungated, or the
// logged-out redirect below wins the race against its sign-in effect.
const PUBLIC_ROUTES = ['/login', '/oauth', '/spike', '/dev']

// D11: matching is by full path segment, never bare string prefix, so a route
// that merely starts with the same characters (e.g. `/oauth-admin`) is not
// treated as public — only the route itself or a `<route>/…` sub-path is.
function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const {
    user,
    authLoading,
    account,
    isLoading: accountLoading,
    isCreating,
    error: accountError,
    refetchAccount,
    signOut,
  } = useAccountContext()
  const {
    needsWake,
    isLoading: corpLoading,
    corporation,
    isError: corpIsError,
    error: corpError,
    refetch: refetchCorp,
  } = useCorporationContext()

  const publicRoute = isPublicRoute(pathname)
  // The home route is the galaxy view (spec #0002): the logged-out landing AND
  // the primary authed screen.
  const isHome = pathname === '/'

  useEffect(() => {
    if (!authLoading && !user && !publicRoute && !isHome) {
      router.push('/login')
    }
  }, [authLoading, user, publicRoute, isHome, router])

  // Public routes (login/oauth/spike) always render bare, never gated.
  if (publicRoute) {
    return <>{children}</>
  }

  // Wake gate (#0009): a signed-in account with no living corporation must wake
  // before it can play — this takes over the whole screen. While the corp is
  // still resolving, hold a blank frame so a corpless user never flashes the
  // live app before the wake-up flow.
  if (user && account) {
    if (corpLoading) return null

    // D6/B1 — a corp-lookup error (5xx/network) is not evidence of
    // corplessness. Only show the retriable error when no living corporation
    // is already known for the session; a background refetch failure while a
    // corporation is already resolved keeps serving the resolved app.
    if (corpIsError && corporation == null) {
      return (
        <div className="grid h-dvh w-full place-items-center bg-zinc-100 px-6 dark:bg-zinc-700">
          <div
            data-testid="gate-corp-error"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800/50 dark:bg-white/[0.12]"
          >
            <Heading>We couldn&apos;t reach your corporation</Heading>
            <Text className="mt-2">
              {corpError instanceof Error
                ? corpError.message
                : 'Something went wrong looking up your corporation. Please try again.'}
            </Text>
            <Button
              color="dark"
              className="mt-6"
              data-testid="gate-corp-retry"
              onClick={() => refetchCorp?.()}
            >
              Retry
            </Button>
          </div>
        </div>
      )
    }

    if (needsWake) return <WakeUpFlow />
    // Woken: the WHOLE app is full-bleed canvas with floating cards — every
    // route (galaxy, system board, …) renders bare, with the floating nav/account
    // chrome over it. There is no sidebar shell (spec #0002 canvas model): the
    // window IS the canvas, and every component floats over it.
    return (
      <>
        {children}
      </>
    )
  }

  // D6 — an account-lookup failure (as opposed to auto-creation merely being
  // in progress) shows a retriable error instead of an indefinite blank
  // frame. Scoped to non-home routes (home always renders its own content,
  // D2) and gated on !isCreating so an in-progress auto-creation doesn't
  // flash a false lookup-failure error.
  if (user && !account && !isHome && accountError && !isCreating) {
    const isStuckCreation = (accountError as { status?: number })?.status === 404
    return (
      <div className="grid h-dvh w-full place-items-center bg-zinc-100 px-6 dark:bg-zinc-700">
        <div
          data-testid="gate-account-error"
          className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800/50 dark:bg-white/[0.12]"
        >
          <Heading>We couldn&apos;t load your account</Heading>
          <Text className="mt-2">
            {isStuckCreation
              ? 'Setting up your account did not finish. Sign out and back in to try again.'
              : accountError instanceof Error
                ? accountError.message
                : 'Something went wrong loading your account. Please try again.'}
          </Text>
          {isStuckCreation ? (
            <Button
              color="dark"
              className="mt-6"
              data-testid="gate-account-signout"
              onClick={() => signOut()}
            >
              Sign out
            </Button>
          ) : (
            <Button
              color="dark"
              className="mt-6"
              data-testid="gate-account-retry"
              onClick={() => refetchAccount?.()}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
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
