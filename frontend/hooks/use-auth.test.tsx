import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import * as firebaseAuth from 'firebase/auth'
import { useAuth } from './use-auth'

// D13/task 8.1 — the redirect-initiation marker's sessionStorage key. This is
// an internal implementation detail of use-auth.ts, but the red-phase suite
// needs a concrete, stable name to assert against; the dev implementing 8.1
// MUST use this exact key (or the test stays red forever for the wrong
// reason). See the SDET handoff notes for the full testid/key contract.
const GOOGLE_REDIRECT_MARKER_KEY = 'hexaverse:google-redirect-pending'

const ORIGINAL_USER_AGENT = window.navigator.userAgent

function setMobileUserAgent() {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    configurable: true,
  })
}

function restoreUserAgent() {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ORIGINAL_USER_AGENT,
    configurable: true,
  })
}

// Test wrapper with React Query
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
  return Wrapper
}

describe('useAuth', () => {
  let wrapper: ReturnType<typeof createWrapper>
  const mockUser = {
    uid: 'test-user-id',
    email: 'test@example.com',
    getIdToken: vi.fn().mockResolvedValue('mock-jwt-token'),
    getIdTokenResult: vi.fn().mockResolvedValue({
      token: 'mock-jwt-token',
      expirationTime: new Date(Date.now() + 3600000).toISOString(),
      claims: {},
    }),
  } as unknown as User

  const mockAdminUser = {
    uid: 'admin-user-id',
    email: 'admin@example.com',
    getIdToken: vi.fn().mockResolvedValue('mock-admin-jwt-token'),
    getIdTokenResult: vi.fn().mockResolvedValue({
      token: 'mock-admin-jwt-token',
      expirationTime: new Date(Date.now() + 3600000).toISOString(),
      claims: { admin: true },
    }),
  } as unknown as User

  beforeEach(() => {
    wrapper = createWrapper()
    vi.clearAllMocks()
    
    // Setup default mock behavior
    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
      setTimeout(() => {
        if (typeof callback === 'function') {
          callback(null)
        }
      }, 0)
      return vi.fn() // unsubscribe function
    })
  })

  describe('Basic Authentication State', () => {
    it('should initialize with loading true and no user', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      expect(result.current.loading).toBe(true)
      expect(result.current.user).toBe(null)
      expect(result.current.tokenLoading).toBe(false)
    })

    it('should set loading false after auth state check', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })
    })

    it('should set user when authenticated', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
        expect(result.current.loading).toBe(false)
      })
    })
  })

  describe('Token Management', () => {
    it('should return null token when no user is authenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const token = await result.current.getIdToken()
      expect(token).toBe(null)
    })

    it('should fetch token for authenticated user', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      const token = await result.current.getIdToken()
      expect(token).toBe('mock-jwt-token')
    })

    it('should force refresh token when requested', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Force refresh should call Firebase getIdToken
      await result.current.getIdToken(true)
      expect(mockUser.getIdToken).toHaveBeenCalled()
    })
  })

  describe('Authentication Methods', () => {
    it('should call signInWithEmailAndPassword', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      
      await result.current.signIn('test@example.com', 'password')
      
      expect(firebaseAuth.signInWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password'
      )
    })

    it('should call createUserWithEmailAndPassword', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      
      await result.current.signUp('test@example.com', 'password')
      
      expect(firebaseAuth.createUserWithEmailAndPassword).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        'password'
      )
    })

    it('should call signOut', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      
      await result.current.signOut()
      
      expect(firebaseAuth.signOut).toHaveBeenCalledWith(expect.anything())
    })

    it('should call sendPasswordResetEmail', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      
      await result.current.resetPassword('test@example.com')
      
      expect(firebaseAuth.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com'
      )
    })

    it('should call signInWithPopup for Google auth', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      
      await result.current.signInWithGoogle()
      
      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything() // GoogleAuthProvider instance
      )
    })
  })

  describe('Loading States', () => {
    it('should provide tokenLoading state', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      expect(typeof result.current.tokenLoading).toBe('boolean')
    })
  })

  describe('Admin Functionality', () => {
    it('should detect regular user as non-admin', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser)
      })

      // Wait for admin status check to complete
      await waitFor(() => {
        expect(result.current.isCheckingAdmin).toBe(false)
      })

      expect(result.current.isAdmin).toBe(false)
      expect(mockUser.getIdTokenResult).toHaveBeenCalledWith(false) // Use cached token
    })

    it('should detect admin user correctly', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockAdminUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockAdminUser)
      })

      // Wait for admin status check to complete
      await waitFor(() => {
        expect(result.current.isCheckingAdmin).toBe(false)
      })

      expect(result.current.isAdmin).toBe(true)
      expect(mockAdminUser.getIdTokenResult).toHaveBeenCalledWith(false) // Use cached token
    })

    it('should provide isCheckingAdmin loading state', async () => {
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      expect(typeof result.current.isCheckingAdmin).toBe('boolean')
    })

    it('should handle admin check errors gracefully', async () => {
      const mockUserWithError = {
        ...mockUser,
        getIdTokenResult: vi.fn().mockRejectedValue(new Error('Token error'))
      }

      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockUserWithError)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUserWithError)
      })

      // Wait for admin status check to complete
      await waitFor(() => {
        expect(result.current.isCheckingAdmin).toBe(false)
      })

      expect(result.current.isAdmin).toBe(false) // Should default to false on error
    })

    it('should reset admin status on sign out', async () => {
      let authCallback: ((user: User | null) => void) | null = null

      // First sign in as admin
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        if (typeof callback === 'function') {
          authCallback = callback
        }
        setTimeout(() => {
          if (typeof callback === 'function') {
            callback(mockAdminUser)
          }
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAdmin).toBe(true)
      })

      // Simulate sign out by calling the callback with null
      await act(async () => {
        if (authCallback) {
          authCallback(null)
        }
      })

      await waitFor(() => {
        expect(result.current.user).toBe(null)
        expect(result.current.isAdmin).toBe(false)
        expect(result.current.isCheckingAdmin).toBe(false)
      })
    })
  })

  // --- D13/M2: a silent mobile Google-redirect sign-in failure must surface ---
  describe('Google redirect sign-in (D13)', () => {
    beforeEach(() => {
      sessionStorage.clear()
      // Default: getRedirectResult resolves null (no pending redirect) unless
      // a test below overrides it.
      vi.mocked(firebaseAuth.getRedirectResult).mockResolvedValue(null)
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') callback(null)
        }, 0)
        return vi.fn()
      })
    })

    afterEach(() => {
      restoreUserAgent()
    })

    it('Scenario: signInWithGoogle persists a redirect-initiated marker before navigating away', async () => {
      setMobileUserAgent()

      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY)).toBeNull()

      await result.current.signInWithGoogle()

      // Mobile UA -> the redirect branch, not the popup branch.
      expect(firebaseAuth.signInWithRedirect).toHaveBeenCalled()
      expect(firebaseAuth.signInWithPopup).not.toHaveBeenCalled()
      // The marker must be durable (written before the browser navigates
      // away) so the return trip can tell "a redirect was pending" apart
      // from "no redirect was ever initiated" (getRedirectResult resolves
      // null in both cases).
      expect(sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY)).not.toBeNull()
    })

    it('Scenario: A successful Google redirect result surfaces no error and clears the marker', async () => {
      sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      vi.mocked(firebaseAuth.getRedirectResult).mockResolvedValue({
        user: mockUser,
      } as unknown as firebaseAuth.UserCredential)
      vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((auth, callback) => {
        setTimeout(() => {
          if (typeof callback === 'function') callback(mockUser)
        }, 0)
        return vi.fn()
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.user).toEqual(mockUser))
      expect((result.current as unknown as { redirectError: unknown }).redirectError).toBeFalsy()
      // The defect this scenario guards: today nothing ever clears the
      // marker, so a stale marker from a genuinely successful redirect could
      // leak into a later, unrelated page load.
      expect(sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY)).toBeNull()
    })

    it('Scenario: A rejected redirect result surfaces redirectError', async () => {
      sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      vi.mocked(firebaseAuth.getRedirectResult).mockRejectedValue(new Error('redirect failed'))

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(
          (result.current as unknown as { redirectError: unknown }).redirectError
        ).toBeTruthy()
      })
      expect(sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY)).toBeNull()
    })

    it('Scenario: A rejected redirect result does not leak the raw provider error', async () => {
      // D13/task 8.5 — a rejected getRedirectResult (identity-provider error,
      // e.g. account-exists-with-different-credential or a transient
      // network failure) must surface as the SAME neutral, provider-agnostic
      // copy the cancelled/denied path already uses — never the raw
      // FirebaseError message/code, which would leak provider internals and
      // (via account-exists-with-different-credential) an account-existence
      // signal into the inline login error.
      sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      const providerError = Object.assign(
        new Error('Firebase: Error (auth/account-exists-with-different-credential).'),
        { code: 'auth/account-exists-with-different-credential' }
      )
      vi.mocked(firebaseAuth.getRedirectResult).mockRejectedValue(providerError)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(
          (result.current as unknown as { redirectError: Error | null }).redirectError
        ).toBeTruthy()
      })

      const message = (result.current as unknown as { redirectError: Error }).redirectError
        .message

      // Same neutral copy the hook already uses for the cancelled/denied
      // branch (line ~95) — one consistent message for every flavor of
      // "the redirect didn't produce a signed-in user".
      expect(message).toBe('Google sign-in did not complete.')
      expect(message).not.toMatch(/auth\//)
      expect(message).not.toMatch(/Firebase/i)
    })

    // SDET-added: a second provider error code (a transient/non-identity
    // failure rather than an identity-conflict one) — pins that the leak
    // guard isn't accidentally keyed to one specific error code.
    it('SDET-added: a network-request-failed redirect rejection also shows neutral copy', async () => {
      sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      const providerError = Object.assign(
        new Error('Firebase: Error (auth/network-request-failed).'),
        { code: 'auth/network-request-failed' }
      )
      vi.mocked(firebaseAuth.getRedirectResult).mockRejectedValue(providerError)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(
          (result.current as unknown as { redirectError: Error | null }).redirectError
        ).toBeTruthy()
      })

      const message = (result.current as unknown as { redirectError: Error }).redirectError
        .message

      expect(message).toBe('Google sign-in did not complete.')
      expect(message).not.toMatch(/auth\//)
      expect(message).not.toMatch(/Firebase/i)
    })

    it('Scenario: A redirect result with no user but a pending marker is a cancelled/denied redirect', async () => {
      // getRedirectResult resolves null both for "no redirect was ever
      // pending" and for "the user cancelled" — the marker is what tells
      // these apart.
      sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      vi.mocked(firebaseAuth.getRedirectResult).mockResolvedValue(null)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(
          (result.current as unknown as { redirectError: unknown }).redirectError
        ).toBeTruthy()
      })
      expect(sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY)).toBeNull()
    })

    it('Scenario: An ordinary page load with no redirect initiated shows no error', async () => {
      // No marker present, getRedirectResult resolves null — an everyday
      // page load, not a returning redirect.
      sessionStorage.removeItem(GOOGLE_REDIRECT_MARKER_KEY)
      vi.mocked(firebaseAuth.getRedirectResult).mockResolvedValue(null)

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect((result.current as unknown as { redirectError: unknown }).redirectError).toBeFalsy()
    })
  })
})