'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { AccountProvider } from './account-provider'
import { CorporationProvider } from './corporation-provider'
import { AppMusicProvider } from './audio/AppMusicProvider'
import { LocalTuningProvider } from './tuning/LocalTuningContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <LocalTuningProvider><CorporationProvider><AppMusicProvider>{children}</AppMusicProvider></CorporationProvider></LocalTuningProvider>
      </AccountProvider>
    </QueryClientProvider>
  )
}
