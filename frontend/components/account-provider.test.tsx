import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountProvider, useAccountContext } from './account-provider'
import { useAuth } from '@/hooks/use-auth'
import { accountService } from '@/lib/services'
import type { User } from 'firebase/auth'

// Mock the hooks and services
vi.mock('@/hooks/use-auth')
vi.mock('@/lib/services')

// Test component to access context
function TestComponent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = useAccountContext() as any
  return (
    <div>
      <div data-testid="account-email">{context.account?.email}</div>
      <div data-testid="account-name">{context.account?.name}</div>
      <div data-testid="account-nickname">{context.account?.nickname}</div>
      <div data-testid="is-creating">{context.isCreating.toString()}</div>
      <div data-testid="has-refetch-account">
        {String(typeof context.refetchAccount === 'function')}
      </div>
      <div data-testid="redirect-error">
        {context.redirectError ? context.redirectError.message : 'none'}
      </div>
    </div>
  )
}

function baseUseAuthMock(overrides: Record<string, unknown> = {}) {
  return {
    user: null,
    loading: false,
    tokenLoading: false,
    isAdmin: false,
    isCheckingAdmin: false,
    signOut: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    signInWithGoogle: vi.fn(),
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
    ...overrides,
  }
}

describe('AccountProvider', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    vi.clearAllMocks()
  })

  it('should use Firebase user data when creating account, not hardcoded values', async () => {
    // Mock Firebase user with specific data from the auth response
    const mockUser: Partial<User> = {
      uid: '5T7WxDYQTpfnbqL9fixWLPQvZkpV',
      displayName: 'Olive Chicken',
      email: 'olive.chicken.715@example.com',
      emailVerified: true
    }

    // Mock useAuth to return our Firebase user
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as User,
      loading: false,
      tokenLoading: false,
      isAdmin: false,
      isCheckingAdmin: false,
      signOut: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
      signInWithGoogle: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    })

    // Mock getCurrentAccount to return 404 (no account exists)
    const mockGetCurrentAccount = vi.fn().mockRejectedValue({ status: 404 })
    vi.mocked(accountService).getCurrentAccount = mockGetCurrentAccount

    // Mock createAccount to capture the data being sent
    const mockCreateAccount = vi.fn().mockResolvedValue({
      id: 'account-123',
      name: 'Olive Chicken',
      nickname: 'olive_chicken',
      email: 'olive.chicken.715@example.com',
      email_verified: true
    })
    vi.mocked(accountService).createAccount = mockCreateAccount

    // Render the provider with test component
    render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    // Wait for the account creation to be triggered
    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledWith({
        name: 'Olive Chicken',
        nickname: 'olive_chicken',
        email: 'olive.chicken.715@example.com',
        email_verified: true
      })
    })

    // Verify it was NOT called with hardcoded values
    expect(mockCreateAccount).not.toHaveBeenCalledWith({
      name: 'Panda Grass',
      nickname: 'grass_panda',
      email: 'panda.grass.109@example.com',
      email_verified: true
    })
  })

  it('should handle user without displayName by using email prefix', async () => {
    // Mock Firebase user without displayName
    const mockUser: Partial<User> = {
      uid: 'test-uid',
      displayName: null,
      email: 'john.doe@example.com',
      emailVerified: false
    }

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as User,
      loading: false,
      tokenLoading: false,
      isAdmin: false,
      isCheckingAdmin: false,
      signOut: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
      signInWithGoogle: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    })

    // Mock getCurrentAccount to return 404
    vi.mocked(accountService).getCurrentAccount = vi.fn().mockRejectedValue({ status: 404 })

    // Mock createAccount
    const mockCreateAccount = vi.fn().mockResolvedValue({
      id: 'account-456',
      name: 'john.doe',
      nickname: 'john.doe',
      email: 'john.doe@example.com',
      email_verified: false
    })
    vi.mocked(accountService).createAccount = mockCreateAccount

    render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    // Wait for account creation with fallback values
    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledWith({
        name: 'john.doe',
        nickname: 'john.doe',
        email: 'john.doe@example.com',
        email_verified: false
      })
    })
  })

  it('should handle Google SSO user with screenName format', async () => {
    // Mock Firebase user from Google SSO with typical format
    const mockUser: Partial<User> = {
      uid: '2665420848364617923721855434201810434709',
      displayName: 'Test User Name',
      email: 'test.user.123@example.com',
      emailVerified: true
    }

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as User,
      loading: false,
      tokenLoading: false,
      isAdmin: false,
      isCheckingAdmin: false,
      signOut: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
      signInWithGoogle: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    })

    // Mock getCurrentAccount to return 404
    vi.mocked(accountService).getCurrentAccount = vi.fn().mockRejectedValue({ status: 404 })

    // Mock createAccount
    const mockCreateAccount = vi.fn().mockResolvedValue({
      id: 'account-789',
      name: 'Test User Name',
      nickname: 'test_user_name',
      email: 'test.user.123@example.com',
      email_verified: true
    })
    vi.mocked(accountService).createAccount = mockCreateAccount

    render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    // Verify nickname is properly formatted from displayName
    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledWith({
        name: 'Test User Name',
        nickname: 'test_user_name',
        email: 'test.user.123@example.com',
        email_verified: true
      })
    })
  })

  it('should not create account if one already exists', async () => {
    // Mock Firebase user
    const mockUser: Partial<User> = {
      uid: 'existing-user',
      displayName: 'Existing User',
      email: 'existing@example.com',
      emailVerified: true
    }

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as User,
      loading: false,
      tokenLoading: false,
      isAdmin: false,
      isCheckingAdmin: false,
      signOut: vi.fn(),
      signIn: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
      signInWithGoogle: vi.fn(),
      getIdToken: vi.fn().mockResolvedValue('mock-token')
    })

    // Mock getCurrentAccount to return existing account
    vi.mocked(accountService).getCurrentAccount = vi.fn().mockResolvedValue({
      id: 'existing-account',
      name: 'Existing User',
      nickname: 'existing_user',
      email: 'existing@example.com',
      email_verified: true
    })

    // Mock createAccount (should not be called)
    const mockCreateAccount = vi.fn()
    vi.mocked(accountService).createAccount = mockCreateAccount

    render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    // Wait and verify createAccount was never called
    await waitFor(() => {
      expect(mockCreateAccount).not.toHaveBeenCalled()
    })
  })

  // --- D6/task 2.2: an additive retry affordance for a failed account lookup ---

  it('Scenario: exposes refetchAccount for a user-triggered retry', async () => {
    const mockUser: Partial<User> = {
      uid: 'lookup-fail-user',
      displayName: 'Lookup Fail',
      email: 'lookup.fail@example.com',
      emailVerified: true,
    }
    vi.mocked(useAuth).mockReturnValue(baseUseAuthMock({ user: mockUser as User }) as ReturnType<
      typeof useAuth
    >)

    // A non-404 failure (a genuine lookup failure, not "no account yet") —
    // must not trigger auto-create, and the provider must expose a retry.
    vi.mocked(accountService).getCurrentAccount = vi.fn().mockRejectedValue({ status: 500 })

    const { getByTestId } = render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(getByTestId('has-refetch-account')).toHaveTextContent('true')
    })
  })

  // --- D13/M1/task 8.1b: redirectError passthrough from useAuth ---

  it("Scenario: threads useAuth's redirectError through AccountContextValue", async () => {
    vi.mocked(useAuth).mockReturnValue(
      baseUseAuthMock({
        redirectError: new Error('Google sign-in did not complete.'),
      }) as ReturnType<typeof useAuth>
    )
    vi.mocked(accountService).getCurrentAccount = vi.fn().mockResolvedValue(null)

    const { getByTestId } = render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <TestComponent />
        </AccountProvider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(getByTestId('redirect-error')).toHaveTextContent('Google sign-in did not complete.')
    })
  })
})