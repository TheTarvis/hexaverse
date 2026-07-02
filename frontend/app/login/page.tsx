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

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { signIn, signUp, signInWithGoogle, user, authLoading } = useAccountContext()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signUp') === 'true')

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
      setError(err instanceof Error ? err.message : 'Authentication failed.')
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
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 dark:bg-zinc-700">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-8 dark:border-zinc-800/50 dark:bg-white/[0.12]">
        <Heading>{isSignUp ? 'Create your {{PROJECT_NAME}} account' : 'Sign in to {{PROJECT_NAME}}'}</Heading>
        <Text className="mt-1">
          {isSignUp ? 'Create an account to get started.' : 'Welcome back.'}
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
              />
            </Field>
          )}
          {error && <Text className="text-red-600 dark:text-red-400">{error}</Text>}
          <Button type="submit" color="dark" disabled={loading}>
            {loading ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          OR
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <Button outline onClick={handleGoogle} disabled={loading} className="w-full">
          <GoogleIcon className="size-5" /> Continue with Google
        </Button>

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
