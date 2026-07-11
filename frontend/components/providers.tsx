'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { AccountProvider } from './account-provider'
import { CorporationProvider } from './corporation-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <CorporationProvider>{children}</CorporationProvider>
      </AccountProvider>
    </QueryClientProvider>
  )
}
