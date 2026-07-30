'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { accountService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { Account } from '@/lib/types/account'
import type { User } from 'firebase/auth'

interface AccountContextValue {
  // Account data
  account: Account | null | undefined
  isLoading: boolean
  isCreating: boolean
  error: Error | null
  // D6/task 2.2 — additive retry affordance for a failed account *lookup*
  // (no change to what triggers auto-creation or what it sends). Optional at
  // the type level only (always provided at runtime) so existing test
  // doubles that predate this field keep type-checking.
  refetchAccount?: () => void
  // Auth data (to avoid other components calling useAuth)
  user: User | null
  authLoading: boolean
  isAdmin: boolean
  isCheckingAdmin: boolean
  // D13/M1 — additive passthrough of use-auth.ts's redirectError so
  // app/login/page.tsx can read it via useAccountContext() (this frontend's
  // convention against calling useAuth() directly from a component). Optional
  // at the type level for the same reason as refetchAccount above.
  redirectError?: Error | null
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined)

export function useAccountContext() {
  const context = useContext(AccountContext)
  if (context === undefined) {
    throw new Error('useAccountContext must be used within AccountProvider')
  }
  return context
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const {
    user,
    loading: authLoading,
    isAdmin,
    isCheckingAdmin,
    redirectError,
    signOut,
    signIn,
    signUp,
    signInWithGoogle
  } = useAuth()
  
  const queryClient = useQueryClient()
  
  // Direct account query to avoid circular dependency with useCurrentAccount
  const { 
    data: account, 
    isLoading: accountLoading, 
    error: accountError,
    refetch: refetchAccount 
  } = useQuery({
    queryKey: queryKeys.accounts.current(),
    queryFn: () => accountService.getCurrentAccount(),
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if ((error as { status?: number }).status === 404) return false
      return failureCount < 3
    }
  })
  
  // Direct create account mutation to avoid circular dependency
  const createAccountMutation = useMutation({
    mutationFn: (data: Parameters<typeof accountService.createAccount>[0]) => accountService.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.current() })
    }
  })
  const [hasTriedCreation, setHasTriedCreation] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    // console.log('🔍 [AccountProvider] Account check:', {
    //   hasUser: !!user,
    //   authLoading,
    //   accountLoading,
    //   hasTriedCreation,
    //   isCreating,
    //   errorStatus: accountError?.status,
    //   accountData: account
    // })
    
    // Only try to create account once per session when we get a 404
    if (
      user && 
      !authLoading && 
      !accountLoading && 
      !hasTriedCreation &&
      !isCreating &&
      (accountError as { status?: number })?.status === 404
    ) {
      // console.log('🔧 [AccountProvider] No account found, creating with demo data...')
      setHasTriedCreation(true)
      setIsCreating(true)
      
      // Create account with Firebase user data
      createAccountMutation.mutate(
        {
          name: user.displayName || user.email?.split('@')[0] || 'User',
          nickname: user.displayName?.toLowerCase().replace(/\s+/g, '_') || user.email?.split('@')[0] || 'user',
          email: user.email || '',
          email_verified: user.emailVerified || false,
          picture: user.photoURL || undefined
        },
        {
          onSuccess: () => {
            // console.log('✅ [AccountProvider] Account created successfully:', newAccount)
            // Refetch to update the current account data
            refetchAccount()
            setIsCreating(false)
          },
          onError: (error) => {
            console.error('❌ [AccountProvider] Failed to create account:', error)
            setIsCreating(false)
          }
        }
      )
    }
  }, [
    user, 
    authLoading, 
    accountLoading, 
    accountError, 
    hasTriedCreation,
    isCreating,
    createAccountMutation, 
    refetchAccount
  ])

  // Reset creation flag when user changes
  useEffect(() => {
    if (!user) {
      setHasTriedCreation(false)
      setIsCreating(false)
    }
  }, [user])

  const contextValue: AccountContextValue = {
    // Account data
    account: account ?? null,
    isLoading: authLoading || accountLoading || isCreating,
    isCreating,
    error: (accountError as { status?: number })?.status === 404 && !hasTriedCreation ? null : accountError,
    refetchAccount: () => {
      refetchAccount()
    },
    // Auth data
    user,
    authLoading,
    isAdmin,
    isCheckingAdmin,
    redirectError: redirectError ?? null,
    signOut,
    signIn: async (email: string, password: string) => {
      await signIn(email, password)
    },
    signUp: async (email: string, password: string) => {
      await signUp(email, password)
    },
    signInWithGoogle: async () => {
      await signInWithGoogle()
    }
  }

  return (
    <AccountContext.Provider value={contextValue}>
      {children}
    </AccountContext.Provider>
  )
}