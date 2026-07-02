import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFirebaseProjects, useFirestoreDatabases } from './use-firebase'
import { apiClient } from '@/lib/api-client'

// Mock dependencies
vi.mock('@/lib/api-client')

// Test wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  Wrapper.displayName = 'TestWrapper'
  return Wrapper
}

describe('useFirebase hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('useFirebaseProjects', () => {
    it('should fetch Firebase projects successfully', async () => {
      const mockProjects = [
        {
          projectId: 'my-project-1',
          displayName: 'My First Project',
          projectNumber: '123456789',
          state: 'ACTIVE',
        },
        {
          projectId: 'my-project-2',
          displayName: 'My Second Project',
          projectNumber: '987654321',
          state: 'ACTIVE',
        },
      ]

      const mockGet = vi.mocked(apiClient.get)
      mockGet.mockResolvedValue({
        data: { projects: mockProjects },
        status: 200,
        headers: new Headers()
      })

      const { result } = renderHook(
        () => useFirebaseProjects('org-123', 'conn-456'),
        { wrapper: createWrapper() }
      )

      // Initially loading
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify results
      expect(result.current.data).toEqual(mockProjects)
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/organizations/org-123/connections/conn-456/firebase/projects'
      )
      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch projects')

      const mockGet = vi.mocked(apiClient.get)
      mockGet.mockRejectedValue(mockError)

      const { result } = renderHook(
        () => useFirebaseProjects('org-123', 'conn-456'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toEqual(mockError)
      expect(result.current.data).toBeUndefined()
    })

    it('should not fetch when organizationId is missing', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirebaseProjects(undefined, 'conn-456'),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should not fetch when connectionId is missing', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirebaseProjects('org-123', undefined),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should respect enabled option', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirebaseProjects('org-123', 'conn-456', { enabled: false }),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  describe('useFirestoreDatabases', () => {
    it('should fetch Firestore databases successfully', async () => {
      const mockDatabases = [
        {
          databaseId: '(default)',
          name: 'projects/my-project/databases/(default)',
          type: 'FIRESTORE_NATIVE',
          locationId: 'us-central',
        },
        {
          databaseId: 'my-other-db',
          name: 'projects/my-project/databases/my-other-db',
          type: 'FIRESTORE_NATIVE',
          locationId: 'us-east1',
        },
      ]

      const mockGet = vi.mocked(apiClient.get)
      mockGet.mockResolvedValue({
        data: { databases: mockDatabases },
        status: 200,
        headers: new Headers()
      })

      const { result } = renderHook(
        () => useFirestoreDatabases('org-123', 'conn-456', 'my-project'),
        { wrapper: createWrapper() }
      )

      // Initially loading
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()

      // Wait for query to complete
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify results
      expect(result.current.data).toEqual(mockDatabases)
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/organizations/org-123/connections/conn-456/firestore/databases?projectId=my-project'
      )
      expect(mockGet).toHaveBeenCalledTimes(1)
    })

    it('should handle fetch error', async () => {
      const mockError = new Error('Failed to fetch databases')

      const mockGet = vi.mocked(apiClient.get)
      mockGet.mockRejectedValue(mockError)

      const { result } = renderHook(
        () => useFirestoreDatabases('org-123', 'conn-456', 'my-project'),
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toEqual(mockError)
      expect(result.current.data).toBeUndefined()
    })

    it('should not fetch when organizationId is missing', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirestoreDatabases(undefined, 'conn-456', 'my-project'),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should not fetch when connectionId is missing', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirestoreDatabases('org-123', undefined, 'my-project'),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should not fetch when projectId is missing', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirestoreDatabases('org-123', 'conn-456', undefined),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })

    it('should respect enabled option', () => {
      const mockGet = vi.mocked(apiClient.get)

      const { result } = renderHook(
        () => useFirestoreDatabases('org-123', 'conn-456', 'my-project', { enabled: false }),
        { wrapper: createWrapper() }
      )

      // Should not be loading or call service
      expect(result.current.isLoading).toBe(false)
      expect(result.current.fetchStatus).toBe('idle')
      expect(mockGet).not.toHaveBeenCalled()
    })
  })
})
