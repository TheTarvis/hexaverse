'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccountContext } from '@/components/account-provider'
import { AppNavigation } from '@/components/app-navigation'

// Routes that should NOT have the dashboard layout (e.g. login, OAuth callbacks).
const PUBLIC_ROUTES = ['/login', '/oauth']

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, authLoading, account, isLoading: accountLoading } = useAccountContext()

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route))

  useEffect(() => {
    if (!authLoading && !user && !isPublicRoute) {
      router.push('/login')
    }
  }, [authLoading, user, isPublicRoute, router])

  if (isPublicRoute) {
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
