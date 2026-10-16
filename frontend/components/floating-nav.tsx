'use client'

// The app's floating chrome (spec #0002 canvas model): the whole app is
// full-bleed canvas with floating cards — there is NO sidebar shell. This card
// carries the cross-view navigation + account controls, floating bottom-left
// over whatever canvas is mounted (the galaxy or a system board). It mirrors the
// other floating panels through the shared HudPanel presentation.
//
// Raised clear of the system view's console dock (openspec
// `add-console-dock`): the nav follows the dock's published height through
// the left-and-centre lane of `lib/console-dock-layout`, and falls back to
// 4.5rem where no dock is mounted (the galaxy route), so this floating panel
// — mounted on every route, including the system view — never lands on top
// of the strip's fleet cell and its chevron.

import Link from 'next/link'
import { HudPanel } from '@/components/hud/GameHud'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { useAccountContext } from '@/components/account-provider'
import { CONSOLE_DOCK_LANE_LEFT_CENTER } from '@/lib/console-dock-layout'
import { useState } from 'react'
import styles from './floating-nav.module.css'

export function FloatingNav() {
  const pathname = usePathname()
  const { user, account, signOut } = useAccountContext()
  const [accountOpen, setAccountOpen] = useState(false)
  if (!user) return null

  const onGalaxy = pathname === '/'

  return (
    <HudPanel as="div" tone="navigation" className={`fixed ${CONSOLE_DOCK_LANE_LEFT_CENTER} left-4 z-50 flex flex-col gap-1.5 p-3 ${styles.navigation}`} data-testid="floating-nav">
      <Link
        href="/"
        data-testid="nav-home"
        aria-current={onGalaxy ? 'page' : undefined}
        className={`text-sm ${onGalaxy ? 'font-medium text-white' : 'text-zinc-300 hover:text-white'}`}
      >
        ◄ Galaxy
      </Link>
      <Button plain className={styles.accountToggle} aria-expanded={accountOpen} onClick={() => setAccountOpen(open => !open)}>Account</Button>
      <div data-open={accountOpen} className={`mt-1 flex items-center gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800/50 ${styles.account}`}>
        <span className="max-w-[12rem] truncate text-xs text-zinc-300">
          {account?.email ?? user.email}
        </span>
        <Button
          plain
          onClick={() => signOut()}
          data-testid="sign-out-button"
          className="!text-xs !text-white"
        >
          Sign out
        </Button>
      </div>
    </HudPanel>
  )
}
