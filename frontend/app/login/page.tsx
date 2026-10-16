'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Field, Label } from '@/components/catalyst/fieldset'
import { Heading } from '@/components/catalyst/heading'
import { Input } from '@/components/catalyst/input'
import { Text } from '@/components/catalyst/text'
import { GoogleIcon } from '@/components/google-icon'
import { useAccountContext } from '@/components/account-provider'

// D7 — the `redirect` query parameter is treated as a same-origin relative
// path only: a single leading `/`, never `//`- or `/\`-prefixed, and
// containing no backslash or control/whitespace character anywhere in the
// value. Anything else falls back to `/` so the post-authentication handoff
// can never navigate to an attacker-controlled origin.
function sanitizeRedirect(raw: string | null): string {
  if (!raw) return '/'
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//')) return '/'
  if (raw.startsWith('/\\')) return '/'
  if (/[\\\x00-\x1f\x7f\s]/.test(raw)) return '/'
  return raw
}

// D12 — Firebase's wrong-credential/unknown-account/already-registered codes
// must render one identical, provider-agnostic message so /login cannot be
// used to enumerate which emails are registered. Includes
// `auth/invalid-credential`, the single code Firebase returns for both
// wrong-password and unknown-account once enumeration protection is enabled.
const CREDENTIAL_FAILURE_CODES = new Set([
  'auth/user-not-found',
  'auth/wrong-password',
  'auth/invalid-credential',
  'auth/email-already-in-use',
])

const CREDENTIAL_FAILURE_MESSAGE =
  'Unable to complete sign-in with those details. Please check and try again.'
const NEUTRAL_FAILURE_MESSAGE = 'Sign-in failed. Please try again.'

// Any other failure (network, rate-limit, disabled account, …) gets a
// distinct neutral message — never the credential copy (which would falsely
// imply a wrong email/password) and never the raw provider string.
function describeAuthError(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code
  if (code && CREDENTIAL_FAILURE_CODES.has(code)) {
    return CREDENTIAL_FAILURE_MESSAGE
  }
  return NEUTRAL_FAILURE_MESSAGE
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn, signUp, signInWithGoogle, user, authLoading, redirectError } =
    useAccountContext()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = sanitizeRedirect(searchParams.get('redirect'))
  const phonePreview = process.env.NEXT_PUBLIC_PHONE_PREVIEW === 'true'
  // Preview uses the same email and simulated Google flows against the emulator.
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signUp') === 'true')

  // D13/M1 — a failed/cancelled mobile Google-redirect sign-in surfaces here,
  // through the same inline error surface and live region as any other
  // sign-in failure, instead of a silent return to an unremarkable form.
  const displayError = error || redirectError?.message || ''

  useEffect(() => {
    setConfirmPassword('')
    setError('')
  }, [isSignUp])

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirect)
    }
  }, [authLoading, user, redirect, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(describeAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(describeAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 dark:bg-zinc-700">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800/50 dark:bg-white/[0.12]">
        <Heading>{isSignUp ? 'Create your Hexaverse account' : 'Sign in to Hexaverse'}</Heading>
        <Text className="mt-1">
          {phonePreview ? 'Use a test-only email and password for this preview.' : isSignUp ? 'Create an account to get started.' : 'Welcome back.'}
        </Text>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field>
            <Label>Email</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              data-testid="login-email"
            />
          </Field>
          <Field>
            <Label>Password</Label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              data-testid="login-password"
            />
          </Field>
          {isSignUp && (
            <Field>
              <Label>Confirm password</Label>
              <Input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                data-testid="login-confirm-password"
              />
            </Field>
          )}
          {displayError && (
            <Text
              data-testid="login-error"
              role="alert"
              aria-live="assertive"
              className="text-red-600 dark:text-red-400"
            >
              {displayError}
            </Text>
          )}
          <Button type="submit" color="dark" disabled={loading} data-testid="login-submit">
            {loading ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/50" />
          OR
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/50" />
        </div>

        <Button outline onClick={handleGoogle} disabled={loading} className="w-full">
          <GoogleIcon className="size-5" /> Continue with Google
        </Button>
        {phonePreview && <Text className="mt-2 text-center text-xs">Google opens the simulated test identity picker.</Text>}

        <Text className="mt-6 text-center">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-zinc-900 underline dark:text-white"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </Text>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
