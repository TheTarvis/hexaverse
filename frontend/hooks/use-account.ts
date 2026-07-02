'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { accountService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from './use-auth'
import type { ApiError } from '@/lib/api-client'
import type { Account, CreateAccountRequest } from '@/lib/types/account'

// GET /v1/accounts/firestore — current authenticated user's account.
export function useCurrentAccount(
  options?: Omit<UseQueryOptions<Account, ApiError>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth()

  return useQuery<Account, ApiError>({
    queryKey: queryKeys.accounts.current(),
    queryFn: () => accountService.getCurrentAccount(),
    enabled: !!user && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.status === 404) return false
      return failureCount < 3
    },
    ...options,
  })
}

// GET /v1/accounts/{accountId}.
export function useAccount(
  accountId: string,
  options?: Omit<UseQueryOptions<Account, ApiError>, 'queryKey' | 'queryFn'>
) {
  const { user } = useAuth()

  return useQuery<Account, ApiError>({
    queryKey: queryKeys.accounts.detail(accountId),
    queryFn: () => accountService.getAccountById(accountId),
    enabled: !!user && !!accountId && (options?.enabled ?? true),
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}

// POST /v1/accounts.
export function useCreateAccount(
  options?: UseMutationOptions<Account, ApiError, CreateAccountRequest>
) {
  const queryClient = useQueryClient()

  return useMutation<Account, ApiError, CreateAccountRequest>({
    mutationFn: (data) => accountService.createAccount(data),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.accounts.current(), data)
      queryClient.setQueryData(queryKeys.accounts.detail(data.id), data)
    },
    ...options,
  })
}
