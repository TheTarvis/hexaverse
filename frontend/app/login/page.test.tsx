import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from './page'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

vi.mock('@/components/account-provider', () => ({
  useAccountContext: vi.fn(),
}))

import { useSearchParams } from 'next/navigation'
import { useAccountContext } from '@/components/account-provider'

function mockAccountContext(overrides: Record<string, unknown> = {}) {
  const context = {
    user: null,
    authLoading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithGoogle: vi.fn(),
    ...overrides,
  }
  vi.mocked(useAccountContext).mockReturnValue(
    context as unknown as ReturnType<typeof useAccountContext>
  )
  return context
}

function fillCredentials(email = 'user@example.com', password = 'secret123') {
  fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } })
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: password } })
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as unknown as ReturnType<typeof useSearchParams>
    )
  })

  it('signs in with email and password in the default mode', async () => {
    const { signIn } = mockAccountContext()

    render(<LoginPage />)

    expect(screen.getByText('Sign in to Hexaverse')).toBeInTheDocument()
    expect(screen.queryByText('Confirm password')).not.toBeInTheDocument()

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('user@example.com', 'secret123')
    })
  })

  it('toggles to sign-up mode showing the confirm password field', () => {
    mockAccountContext()

    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(screen.getByText('Create your Hexaverse account')).toBeInTheDocument()
    expect(screen.getByText('Confirm password')).toBeInTheDocument()
    expect(screen.getByTestId('login-submit')).toHaveTextContent('Create account')
  })

  it('starts in sign-up mode when the signUp query param is set', () => {
    mockAccountContext()
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('signUp=true') as unknown as ReturnType<typeof useSearchParams>
    )

    render(<LoginPage />)

    expect(screen.getByText('Create your Hexaverse account')).toBeInTheDocument()
  })

  it('shows an error and does not sign up when passwords do not match', async () => {
    const { signUp } = mockAccountContext()

    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    fillCredentials()
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'different' },
    })
    fireEvent.click(screen.getByTestId('login-submit'))

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('signs up when passwords match', async () => {
    const { signUp } = mockAccountContext()

    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    fillCredentials('new@example.com', 'secret123')
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith('new@example.com', 'secret123')
    })
  })

  it('displays the error message when sign-in fails', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(new Error('Invalid credentials')),
    })

    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })

  it('signs in with Google via the Google button', async () => {
    const { signInWithGoogle } = mockAccountContext()

    render(<LoginPage />)

    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }))

    await waitFor(() => {
      expect(signInWithGoogle).toHaveBeenCalledTimes(1)
    })
  })

  it('redirects an already-authenticated user to the redirect target', () => {
    mockAccountContext({ user: { uid: 'u1' } })
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('redirect=/settings') as unknown as ReturnType<typeof useSearchParams>
    )

    render(<LoginPage />)

    expect(mockPush).toHaveBeenCalledWith('/settings')
  })
})
