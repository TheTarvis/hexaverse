import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}))

// jsdom's `location.replace` is a not-implemented stub; the page's hard
// navigation is what we assert on, so it is spied and neutralised.
const mockReplace = vi.fn()

const mockSignIn = vi.fn()
vi.mock('firebase/auth', () => ({
  signInWithCustomToken: (...args: unknown[]) => mockSignIn(...args),
}))
vi.mock('@/lib/firebase', () => ({ auth: { app: 'stub' } }))

import DevLoginPage from './page'

describe('/dev/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.location.hash = ''
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, hash: '', pathname: '/dev/login', replace: mockReplace },
    })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is not found outside a development build', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => render(<DevLoginPage />)).toThrow('NEXT_NOT_FOUND')
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('signs in with the fragment token, scrubs it, and leaves by a FULL page load', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    window.location.hash = '#token=hdr.payload.'
    mockSignIn.mockResolvedValue({})
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<DevLoginPage />)
    // A hard navigation, never a client-side route change: the previous
    // user's cached account must not survive into the new session.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
    expect(mockSignIn).toHaveBeenCalledWith({ app: 'stub' }, 'hdr.payload.')
    expect(replaceState).toHaveBeenCalledWith(null, '', '/dev/login')
  })

  it('reports a missing token without calling the SDK', () => {
    vi.stubEnv('NODE_ENV', 'development')
    render(<DevLoginPage />)
    expect(screen.getByTestId('dev-login')).toHaveAttribute('data-status', 'error')
    expect(screen.getByRole('status')).toHaveTextContent(/npm run users/)
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('surfaces a rejected token as an error state, never a redirect', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    window.location.hash = '#token=bad'
    mockSignIn.mockRejectedValue(Object.assign(new Error('x'), { code: 'auth/invalid-custom-token' }))
    render(<DevLoginPage />)
    await waitFor(() =>
      expect(screen.getByTestId('dev-login')).toHaveAttribute('data-status', 'error'),
    )
    expect(screen.getByRole('status')).toHaveTextContent('auth/invalid-custom-token')
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
