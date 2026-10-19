'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { GameMusicProvider } from './GameMusicProvider'

export function AppMusicProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const inGame = pathname === '/' || /^\/systems\/[^/]+\/?$/.test(pathname ?? '')
  return <GameMusicProvider enabled={inGame}>{children}</GameMusicProvider>
}
