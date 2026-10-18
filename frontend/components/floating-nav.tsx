'use client'

import { usePathname } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { useAccountContext } from '@/components/account-provider'
import { CONSOLE_DOCK_LANE_LEFT_CENTER } from '@/lib/console-dock-layout'
import styles from './floating-nav.module.css'

export function FloatingNav() {
  const pathname = usePathname()
  const { user } = useAccountContext()
  if (!user) return null
  return <FloatingNavFrame onGalaxy={pathname === '/'} />
}

/** One cross-view action; account controls live in the workspace's existing settings. */
export function FloatingNavFrame({ onGalaxy }: { onGalaxy: boolean }) {
  return <nav aria-label="Galaxy navigation" className={`fixed ${CONSOLE_DOCK_LANE_LEFT_CENTER} left-4 z-50 ${styles.navigation}`} data-testid="floating-nav">
    <Button outline href="/" data-testid="nav-home" aria-current={onGalaxy ? 'page' : undefined}>Galaxy</Button>
  </nav>
}
