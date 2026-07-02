import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

interface FirebaseProject {
  projectId: string
  displayName: string
  projectNumber: string
  state: string
}

interface FirebaseProjectsResponse {
  projects: FirebaseProject[]
}

interface FirestoreDatabase {
  databaseId: string
  name: string
  type: string
  locationId: string
}

interface FirestoreDatabasesResponse {
  databases: FirestoreDatabase[]
}

/**
 * Hook to fetch Firebase projects for a connection
 *
 * Firebase projects are a subset of Google Cloud projects with Firebase-specific
 * configuration. This is different from GCP projects because:
 * - Firebase has its own Management API
 * - Firebase projects include Firebase-specific features (Auth, Firestore, etc.)
 * - Users typically select Firebase projects when working with Firebase services
 */
export function useFirebaseProjects(
  organizationId: string | undefined,
  connectionId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['firebase', 'projects', organizationId, connectionId],
    queryFn: async () => {
      if (!organizationId || !connectionId) {
        throw new Error('Organization ID and Connection ID are required')
      }

      const response = await apiClient.get<FirebaseProjectsResponse>(
        `/v1/organizations/${organizationId}/connections/${connectionId}/firebase/projects`
      )

      return response.data.projects
    },
    enabled: options?.enabled !== false && !!organizationId && !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook to fetch Firestore databases for a connection and project
 *
 * Most Firebase projects only have the default database "(default)", but
 * some projects may have multiple databases for different purposes.
 */
export function useFirestoreDatabases(
  organizationId: string | undefined,
  connectionId: string | undefined,
  projectId: string | undefined,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['firestore', 'databases', organizationId, connectionId, projectId],
    queryFn: async () => {
      if (!organizationId || !connectionId || !projectId) {
        throw new Error('Organization ID, Connection ID, and Project ID are required')
      }

      const response = await apiClient.get<FirestoreDatabasesResponse>(
        `/v1/organizations/${organizationId}/connections/${connectionId}/firestore/databases?projectId=${projectId}`
      )

      return response.data.databases
    },
    enabled: options?.enabled !== false && !!organizationId && !!connectionId && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
