'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'

const NAV_ITEMS = [
  { label: 'Home', href: '/' },
  { label: 'Settings', href: '/settings' },
]

export function AppNavigation({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { account, signOut } = useAccountContext()

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-700">
      <aside className="fixed inset-y-0 left-0 w-56 border-r border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800/50 dark:bg-white/[0.12]">
        <div className="mb-6 px-2 text-lg font-semibold text-zinc-900 dark:text-white">{{PROJECT_NAME}}</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm ${
                  active
                    ? 'bg-zinc-200 text-zinc-900 dark:bg-white/[0.14] dark:text-white'
                    : 'text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-white/[0.14]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="mb-2 truncate">{account?.email}</div>
          <button
            onClick={() => signOut()}
            className="text-zinc-900 hover:underline dark:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="ml-56 p-6">{children}</main>
    </div>
  )
}
