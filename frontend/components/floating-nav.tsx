'use client'

// The app's floating chrome (spec #0002 canvas model): the whole app is
// full-bleed canvas with floating cards — there is NO sidebar shell. This card
// carries the cross-view navigation + account controls, floating bottom-left
// over whatever canvas is mounted (the galaxy or a system board). It mirrors the
// other floating panels' look (the shared PANEL treatment).
//
// Raised clear of the system view's console dock (openspec
// `add-console-dock`): the nav follows the dock's published height through
// the left-and-centre lane of `lib/console-dock-layout`, and falls back to
// 4.5rem where no dock is mounted (the galaxy route), so this floating panel
// — mounted on every route, including the system view — never lands on top
// of the strip's fleet cell and its chevron.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { useAccountContext } from '@/components/account-provider'
import { CONSOLE_DOCK_LANE_LEFT_CENTER } from '@/lib/console-dock-layout'

const PANEL =
  'pointer-events-auto rounded-xl border border-zinc-200 bg-zinc-50/90 shadow-lg backdrop-blur dark:border-zinc-800/50 dark:bg-white/[0.12]'

export function FloatingNav() {
  const pathname = usePathname()
  const { user, account, signOut } = useAccountContext()
  if (!user) return null

  const onGalaxy = pathname === '/'

  return (
    <div className={`${PANEL} fixed ${CONSOLE_DOCK_LANE_LEFT_CENTER} left-4 z-50 flex flex-col gap-1.5 p-3`} data-testid="floating-nav">
      <Link
        href="/"
        data-testid="nav-home"
        aria-current={onGalaxy ? 'page' : undefined}
        className={`text-sm ${onGalaxy ? 'font-medium text-white' : 'text-zinc-300 hover:text-white'}`}
      >
        ◄ Galaxy
      </Link>
      <div className="mt-1 flex items-center gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800/50">
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
    </div>
  )
}
