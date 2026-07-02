import { describe, it, expect, vi } from 'vitest'

/**
 * Firebase module tests
 *
 * Note: Firebase is globally mocked in vitest.setup.ts for all tests.
 * These tests verify the mock is properly configured and the module
 * can be imported correctly in the test environment.
 */
describe('firebase module', () => {
  describe('mock configuration', () => {
    it('provides auth mock with currentUser', async () => {
      // The global mock in vitest.setup.ts provides auth with currentUser
      const { auth } = await import('@/lib/firebase')

      expect(auth).toBeDefined()
      expect(auth).toHaveProperty('currentUser')
    })

    it('auth.currentUser is null by default', async () => {
      const { auth } = await import('@/lib/firebase')

      expect(auth.currentUser).toBeNull()
    })
  })

  describe('firebase/app mock', () => {
    it('initializeApp is mocked', async () => {
      const { initializeApp } = await import('firebase/app')

      expect(initializeApp).toBeDefined()
      expect(vi.isMockFunction(initializeApp)).toBe(true)
    })

    it('getApps is mocked', async () => {
      const { getApps } = await import('firebase/app')

      expect(getApps).toBeDefined()
      expect(vi.isMockFunction(getApps)).toBe(true)
    })
  })

  describe('firebase/auth mock', () => {
    it('getAuth is mocked', async () => {
      const { getAuth } = await import('firebase/auth')

      expect(getAuth).toBeDefined()
      expect(vi.isMockFunction(getAuth)).toBe(true)
    })

    it('onAuthStateChanged is mocked', async () => {
      const { onAuthStateChanged } = await import('firebase/auth')

      expect(onAuthStateChanged).toBeDefined()
      expect(vi.isMockFunction(onAuthStateChanged)).toBe(true)
    })

    it('signInWithEmailAndPassword is mocked', async () => {
      const { signInWithEmailAndPassword } = await import('firebase/auth')

      expect(signInWithEmailAndPassword).toBeDefined()
      expect(vi.isMockFunction(signInWithEmailAndPassword)).toBe(true)
    })

    it('signOut is mocked', async () => {
      const { signOut } = await import('firebase/auth')

      expect(signOut).toBeDefined()
      expect(vi.isMockFunction(signOut)).toBe(true)
    })
  })

  describe('firebase/firestore mock', () => {
    it('getFirestore is mocked', async () => {
      const { getFirestore } = await import('firebase/firestore')

      expect(getFirestore).toBeDefined()
      expect(vi.isMockFunction(getFirestore)).toBe(true)
    })

    it('collection is mocked', async () => {
      const { collection } = await import('firebase/firestore')

      expect(collection).toBeDefined()
      expect(vi.isMockFunction(collection)).toBe(true)
    })

    it('doc is mocked', async () => {
      const { doc } = await import('firebase/firestore')

      expect(doc).toBeDefined()
      expect(vi.isMockFunction(doc)).toBe(true)
    })
  })
})
