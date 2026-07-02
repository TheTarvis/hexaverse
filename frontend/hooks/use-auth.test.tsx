import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import * as firebaseAuth from 'firebase/auth'
import { useAuth } from './use-auth'

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
})