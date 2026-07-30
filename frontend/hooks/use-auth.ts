'use client'

import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

// Mobile browsers (especially iOS Safari) kill OAuth popups mid-flow,
// surfacing as auth/popup-closed-by-user. Use redirect there instead.
function shouldUseRedirectForOAuth(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

// D13/M2 — getRedirectResult(auth) resolves null both for "no redirect was
// ever pending" and for "the user cancelled at Google". This durable marker,
// written before signInWithRedirect navigates away, is what tells the two
// apart on return.
const GOOGLE_REDIRECT_MARKER_KEY = 'hexaverse:google-redirect-pending'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true)
  const [redirectError, setRedirectError] = useState<Error | null>(null)
  const queryClient = useQueryClient()
  const lastCheckedUserIdRef = useRef<string | null>(null)

  // Check if the user has admin claim
  const checkAdminStatus = async (user: User | null) => {
    // Skip if we've already checked this user
    if (user && lastCheckedUserIdRef.current === user.uid) {
      return
    }

    setIsCheckingAdmin(true)

    if (!user) {
      setIsAdmin(false)
      setIsCheckingAdmin(false)
      lastCheckedUserIdRef.current = null
      return
    }

    try {
      // Use cached token first, only refresh if necessary
      const token = await user.getIdTokenResult(false)
      const adminClaim = token.claims.admin === true
      setIsAdmin(adminClaim)
      lastCheckedUserIdRef.current = user.uid
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Error checking admin status:', error)
      }
      setIsAdmin(false)
      lastCheckedUserIdRef.current = null
    } finally {
      setIsCheckingAdmin(false)
    }
  }

  useEffect(() => {
    let hasProcessedInitialAuth = false

    // Complete any pending Google sign-in redirect. onAuthStateChanged will
    // fire separately with the resulting user; this classifies the redirect
    // result itself (D13/M2) so a cancelled/denied/failed redirect surfaces
    // as `redirectError` instead of a silent, unremarkable return to /login.
    getRedirectResult(auth)
      .then((result) => {
        const hadPendingRedirect = sessionStorage.getItem(GOOGLE_REDIRECT_MARKER_KEY) !== null
        sessionStorage.removeItem(GOOGLE_REDIRECT_MARKER_KEY)

        if (result?.user) {
          // Success — no error to surface.
          setRedirectError(null)
          return
        }

        if (hadPendingRedirect) {
          // A redirect was initiated and produced no user: cancelled, denied,
          // or otherwise failed at the provider.
          setRedirectError(new Error('Google sign-in did not complete.'))
          return
        }

        // No redirect was ever pending — an ordinary page load.
        setRedirectError(null)
      })
      .catch((error) => {
        sessionStorage.removeItem(GOOGLE_REDIRECT_MARKER_KEY)
        if (process.env.NODE_ENV !== 'test') {
          console.error('Error completing redirect sign-in:', error)
        }
        setRedirectError(new Error('Google sign-in did not complete.'))
      })

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const userUid = user?.uid || null

      // Prevent duplicate processing during initial auth state settling
      if (hasProcessedInitialAuth && userUid === lastCheckedUserIdRef.current) {
        return
      }

      hasProcessedInitialAuth = true

      // Only check admin status if user actually changed
      if (userUid !== lastCheckedUserIdRef.current) {
        checkAdminStatus(user)
      }

      setUser(user)
      setLoading(false)

      if (!user) {
        // User signed out - clear ALL cached data to prevent data leaking between users
        queryClient.clear()
        // Clear organization context from localStorage
        localStorage.removeItem('active-organization-context')
      }
    })

    return () => {
      unsubscribe()
    }
  }, [queryClient])

  const {
    data: idToken,
    isLoading: tokenLoading,
    refetch: refetchToken,
  } = useQuery({
    queryKey: ['idToken', user?.uid],
    queryFn: async () => {
      if (!user) {
        return null
      }

      const token = await user.getIdToken()
      return token
    },
    enabled: !!user,
    staleTime: 50 * 60 * 1000, // 50 minutes (tokens expire after 1 hour)
    gcTime: 55 * 60 * 1000, // 55 minutes
    refetchOnWindowFocus: false,
    retry: 3,
  })

  const getIdToken = async (forceRefresh = false): Promise<string | null> => {
    if (!user) {
      return null
    }

    if (forceRefresh) {
      const result = await refetchToken()
      return result.data || null
    }

    return idToken || null
  }

  const signIn = async (email: string, password: string) => {
    return signInWithEmailAndPassword(auth, email, password)
  }

  const signUp = async (email: string, password: string) => {
    return createUserWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
    // Clear ALL React Query cache on logout to prevent data leaking between users
    queryClient.clear()
    // Clear organization context from localStorage
    localStorage.removeItem('active-organization-context')
    return firebaseSignOut(auth)
  }

  const resetPassword = async (email: string) => {
    return sendPasswordResetEmail(auth, email)
  }

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    if (shouldUseRedirectForOAuth()) {
      // Persist the marker BEFORE navigating away — the return trip needs it
      // to tell "a redirect was pending" apart from "no redirect was ever
      // initiated" (getRedirectResult resolves null in both cases, D13/M2).
      try {
        sessionStorage.setItem(GOOGLE_REDIRECT_MARKER_KEY, '1')
      } catch {
        // sessionStorage may be unavailable (private mode) — non-fatal; the
        // redirect still proceeds, just without the cancelled-detection marker.
      }
      // Returns void on success — page navigates to Google and back.
      // getRedirectResult() in the init effect picks up the result on return.
      return signInWithRedirect(auth, provider)
    }
    return signInWithPopup(auth, provider)
  }

  const result = {
    user,
    loading,
    tokenLoading,
    isAdmin,
    isCheckingAdmin,
    redirectError,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithGoogle,
    getIdToken,
  }
  // `redirectError` is new (D13) and additive — widen it to optional at the
  // type level (it is always present at runtime) so existing test doubles
  // that construct a useAuth() return value without it keep type-checking.
  return result as Omit<typeof result, 'redirectError'> & { redirectError?: Error | null }
}
