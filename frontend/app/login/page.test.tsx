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
    redirectError: null,
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

// A Firebase Auth SDK error looks like an Error with a `.code` and a
// provider-formatted `.message` — e.g. `Firebase: Error (auth/wrong-password).`
function firebaseError(code: string) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code })
}

// D12/task 6.4 — assert the raw provider code/message never reaches the
// rendered inline error, on any of the credential/non-credential paths.
function expectNoRawProviderLeak(text: string) {
  expect(text).not.toMatch(/auth\//)
  expect(text).not.toMatch(/Firebase/i)
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

  it('displays an inline error when sign-in fails', async () => {
    // Updated this revision (D12/task 6.1): the raw provider message is no
    // longer shown verbatim — see the "Login Failures Do Not Reveal Whether
    // an Account Exists" scenarios below for the uniform-copy contract. This
    // regression guard only pins that *an* inline error still renders.
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(new Error('Sign-in failed for some reason')),
    })

    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    const alert = await screen.findByTestId('login-error')
    expect(alert).toBeInTheDocument()
    expect(alert.textContent).not.toBe('')
  })

  it('Scenario: Submitting sign-in shows a pending state and blocks double submission', async () => {
    let resolveSignIn: () => void = () => {}
    mockAccountContext({
      signIn: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSignIn = resolve
          })
      ),
    })

    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeDisabled())

    resolveSignIn()
    await waitFor(() => expect(screen.getByTestId('login-submit')).not.toBeDisabled())
  })

  it('Scenario: Continue with Google shows a pending state', async () => {
    let resolveGoogle: () => void = () => {}
    mockAccountContext({
      signInWithGoogle: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveGoogle = resolve
          })
      ),
    })

    render(<LoginPage />)

    const googleButton = screen.getByRole('button', { name: /Continue with Google/ })
    fireEvent.click(googleButton)

    await waitFor(() => expect(googleButton).toBeDisabled())

    resolveGoogle()
    await waitFor(() => expect(googleButton).not.toBeDisabled())
  })

  it('Scenario: A failed attempt preserves entered credentials', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(new Error('boom')),
    })

    render(<LoginPage />)

    fillCredentials('keep@example.com', 'keep-me-123')
    fireEvent.click(screen.getByTestId('login-submit'))

    await screen.findByTestId('login-error')
    expect(screen.getByTestId('login-email')).toHaveValue('keep@example.com')
    expect(screen.getByTestId('login-password')).toHaveValue('keep-me-123')
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

  // --- D7: the `redirect` query param must be constrained to same-origin paths ---

  it('Scenario: An off-site redirect target is refused', () => {
    mockAccountContext({ user: { uid: 'u1' } })
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('redirect=//evil.example') as unknown as ReturnType<
        typeof useSearchParams
      >
    )

    render(<LoginPage />)

    expect(mockPush).toHaveBeenCalledWith('/')
    expect(mockPush).not.toHaveBeenCalledWith('//evil.example')
  })

  it('Scenario: A redirect value containing a backslash or control character is refused', () => {
    mockAccountContext({ user: { uid: 'u1' } })
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('redirect=' + encodeURIComponent('/\\/evil.example')) as unknown as ReturnType<
        typeof useSearchParams
      >
    )

    render(<LoginPage />)

    expect(mockPush).toHaveBeenCalledWith('/')
    expect(mockPush).not.toHaveBeenCalledWith('/\\/evil.example')
  })

  // --- D8/task 4: the login error is announced to assistive technology ---

  it('Scenario: A sign-in error is announced', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(new Error('boom')),
    })

    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    const alert = await screen.findByTestId('login-error')
    // The spec accepts either an explicit `role="alert"` or `aria-live="assertive"`.
    const isLiveRegion =
      alert.getAttribute('role') === 'alert' || alert.getAttribute('aria-live') === 'assertive'
    expect(isLiveRegion).toBe(true)
  })

  // --- D12/task 6: login failures do not reveal whether an account exists ---

  it('Scenario: A wrong password and an unknown account are indistinguishable', async () => {
    mockAccountContext({ signIn: vi.fn().mockRejectedValue(firebaseError('auth/user-not-found')) })
    const { unmount } = render(<LoginPage />)
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))
    const unknownAccountText = (await screen.findByTestId('login-error')).textContent
    unmount()

    render(<LoginPage />)
    mockAccountContext({ signIn: vi.fn().mockRejectedValue(firebaseError('auth/wrong-password')) })
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))
    const wrongPasswordText = (await screen.findByTestId('login-error')).textContent

    expect(unknownAccountText).toBeTruthy()
    expect(unknownAccountText).toBe(wrongPasswordText)
    expectNoRawProviderLeak(unknownAccountText || '')
  })

  it('Scenario: A credential failure shows the app\'s uniform copy, not the provider string', async () => {
    // Enumeration-protected Firebase returns this single code for BOTH the
    // wrong-password and unknown-account sign-in cases.
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(firebaseError('auth/invalid-credential')),
    })

    render(<LoginPage />)

    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    const alert = await screen.findByTestId('login-error')
    expectNoRawProviderLeak(alert.textContent || '')
    expect(alert.textContent).not.toBe('')
  })

  it('Scenario: A sign-up on an existing email does not confirm the account exists', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(firebaseError('auth/wrong-password')),
      signUp: vi.fn().mockRejectedValue(firebaseError('auth/email-already-in-use')),
    })

    const { unmount } = render(<LoginPage />)
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))
    const credentialUniformText = (await screen.findByTestId('login-error')).textContent
    unmount()

    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    fillCredentials('taken@example.com', 'secret123')
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByTestId('login-submit'))
    const existingEmailText = (await screen.findByTestId('login-error')).textContent

    // The known credential-failure codes (6.1/6.3) — including
    // auth/email-already-in-use — all map to the SAME uniform copy, so a
    // sign-up-on-existing-email failure is not distinguishable from any other
    // credential failure.
    expect(existingEmailText).toBeTruthy()
    expect(existingEmailText).toBe(credentialUniformText)
    expectNoRawProviderLeak(existingEmailText || '')
  })

  it('Scenario: A non-credential sign-in error is not labeled as a credential failure', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(firebaseError('auth/wrong-password')),
    })
    const { unmount } = render(<LoginPage />)
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))
    const credentialUniformText = (await screen.findByTestId('login-error')).textContent
    unmount()

    render(<LoginPage />)
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(firebaseError('auth/network-request-failed')),
    })
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))
    const neutralText = (await screen.findByTestId('login-error')).textContent

    expect(neutralText).toBeTruthy()
    // A transient/non-credential failure must NOT be reported using the
    // credential-uniform copy — that would falsely imply a wrong email/password.
    expect(neutralText).not.toBe(credentialUniformText)
    expectNoRawProviderLeak(neutralText || '')
  })

  // SDET-added: the spec names auth/too-many-requests alongside
  // auth/network-request-failed as non-credential examples — boundary probe.
  it('SDET-added: auth/too-many-requests is treated as a non-credential failure too', async () => {
    mockAccountContext({
      signIn: vi.fn().mockRejectedValue(firebaseError('auth/too-many-requests')),
    })

    render(<LoginPage />)
    fillCredentials()
    fireEvent.click(screen.getByTestId('login-submit'))

    const alert = await screen.findByTestId('login-error')
    expectNoRawProviderLeak(alert.textContent || '')
    expect(alert.textContent).not.toBe('')
  })

  // --- D13/M1/task 8.2: a failed Google redirect sign-in surfaces via context ---

  it('Scenario: A cancelled Google redirect sign-in shows an error on return', () => {
    mockAccountContext({ redirectError: new Error('Google sign-in did not complete.') })

    render(<LoginPage />)

    const alert = screen.getByTestId('login-error')
    const isLiveRegion =
      alert.getAttribute('role') === 'alert' || alert.getAttribute('aria-live') === 'assertive'
    expect(isLiveRegion).toBe(true)
  })

  it('Scenario: An ordinary page load with no redirect initiated shows no error', () => {
    mockAccountContext({ redirectError: null })

    render(<LoginPage />)

    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument()
  })
})
