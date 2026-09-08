'use client'

// /dev/login — sign the browser in as a LOCAL EMULATOR user from a custom
// token carried in the URL fragment (`#token=…`). The token is minted by
// `npm run users -- login-url` (e2e/cli/users.ts) and is unsigned, which the
// Auth emulator accepts and real Firebase Auth rejects outright — so this
// route can only ever sign into an emulator, and it exists only in
// development builds (`notFound()` everywhere else; Next inlines NODE_ENV
// at build time, so production never ships a working page here).
//
// WHY A ROUTE. The Firebase JS SDK keeps its session in IndexedDB in its own
// format; there is no sane way to hand a session to a running browser from
// outside except through the SDK itself. This is the smallest surface that
// does that — a fragment in, `signInWithCustomToken`, then home — and it
// means driving the dev stack (a Claude session, a teammate, a demo) never
// has to type a password into the real login form.
//
// IT LEAVES BY A HARD NAVIGATION, not the router: the account provider and
// React Query hold the PREVIOUS user's account in memory, and a client-side
// route change carries that cache along — the nav kept showing the old
// email and the new user's account bootstrap never ran. A full page load
// starts every provider from the SDK's persisted session, which is now the
// new user.

import { useEffect, useState } from 'react'
import { notFound } from 'next/navigation'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
}

export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('token')
  return token && token.length > 0 ? token : null
}

export default function DevLoginPage() {
  if (!devLoginEnabled()) notFound()
  return <DevLogin />
}

/** Leave for home with a FULL page load (see the header note). */
export function leaveForHome(): void {
  window.location.replace('/')
}

function DevLogin() {
  const [status, setStatus] = useState<'pending' | 'error'>('pending')
  const [message, setMessage] = useState('Signing in…')

  useEffect(() => {
    const token = tokenFromHash(window.location.hash)
    if (!token) {
      setStatus('error')
      setMessage('No token in the URL fragment. Mint one with: npm run users -- login-url')
      return
    }
    let cancelled = false
    signInWithCustomToken(auth, token).then(
      () => {
        if (cancelled) return
        // Drop the token from history before leaving.
        window.history.replaceState(null, '', window.location.pathname)
        leaveForHome()
      },
      (err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setMessage(`Sign-in failed: ${(err as { code?: string }).code ?? 'unknown error'}`)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 dark:bg-zinc-700">
      <div
        data-testid="dev-login"
        data-status={status}
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-sm text-zinc-600 dark:border-zinc-800/50 dark:bg-white/[0.12] dark:text-zinc-400"
      >
        <p className="font-mono text-[11px] uppercase tracking-wide text-zinc-500">dev · emulator sign-in</p>
        <p className="mt-2" role="status" aria-live="polite">
          {message}
        </p>
      </div>
    </div>
  )
}
