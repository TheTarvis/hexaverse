'use client'

import { auth } from './firebase'

export interface ApiResponse<T = unknown> {
  data: T
  status: number
  headers: Headers
}

export interface ApiError extends Error {
  status: number
  response?: Response
  data?: unknown
}

export interface ApiClientConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

export class ApiClient {
  private baseURL: string
  private timeout: number
  private defaultHeaders: Record<string, string>

  constructor(config: ApiClientConfig = {}) {
    const baseURL = config.baseURL || (process.env.NEXT_PUBLIC_PHONE_PREVIEW === 'true' ? '/api' : process.env.NEXT_PUBLIC_API_URL)
    if (!baseURL) {
      throw new Error('NEXT_PUBLIC_API_URL environment variable is required. Set it in your .env.local file.')
    }
    this.baseURL = baseURL
    this.timeout = config.timeout || 120000 // 2 minutes default, matches most backend operations
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    }
  }

  private async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser
    if (!user) {
      return null
    }

    try {
      // Get token result which includes expiration info
      const tokenResult = await user.getIdTokenResult()
      const expirationTime = new Date(tokenResult.expirationTime).getTime()
      const now = Date.now()

      // If token expires within 5 minutes, force refresh
      const fiveMinutes = 5 * 60 * 1000
      const shouldRefresh = expirationTime - now < fiveMinutes

      if (shouldRefresh) {
        // Force refresh to get a fresh token
        return await user.getIdToken(true)
      }

      // Use cached token if it's still fresh
      return tokenResult.token
    } catch (error) {
      console.error('Failed to get ID token:', error)
      return null
    }
  }

  private createApiError(response: Response, data?: unknown): ApiError {
    // Try to extract a meaningful error message from the response
    let errorMessage = `API Error: ${response.status} ${response.statusText}`
    
    if (data) {
      // Check for common error message formats in the response
      if (typeof data === 'object' && data !== null) {
        const dataObj = data as Record<string, unknown>
        
        // Check for various common error message fields
        if (dataObj.message && typeof dataObj.message === 'string') {
          errorMessage = dataObj.message
        } else if (dataObj.error && typeof dataObj.error === 'string') {
          errorMessage = dataObj.error
        } else if (dataObj.errors) {
          // Handle array of errors
          if (Array.isArray(dataObj.errors) && dataObj.errors.length > 0) {
            if (typeof dataObj.errors[0] === 'string') {
              errorMessage = dataObj.errors.join(', ')
            } else if (typeof dataObj.errors[0] === 'object' && dataObj.errors[0].message) {
              errorMessage = dataObj.errors.map((e: unknown) => {
                if (typeof e === 'object' && e !== null && 'message' in e) {
                  return (e as { message: string }).message
                }
                return String(e)
              }).join(', ')
            }
          } else if (typeof dataObj.errors === 'string') {
            errorMessage = dataObj.errors
          }
        } else if (dataObj.detail && typeof dataObj.detail === 'string') {
          errorMessage = dataObj.detail
        }
      } else if (typeof data === 'string' && data.trim()) {
        // If the response is a plain string, use it if it's not empty
        errorMessage = data
      }
    }
    
    const error = new Error(errorMessage) as ApiError
    error.status = response.status
    error.response = response
    error.data = data
    return error
  }

  async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`
    const token = await this.getAuthToken()
    
    // Removed console.log for lint

    const headers = new Headers({
      ...this.defaultHeaders,
      ...options.headers,
    })

    // Remove Content-Type header if body is FormData
    // Browser will set it automatically with the correct boundary
    if (options.body instanceof FormData) {
      headers.delete('Content-Type')
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
        redirect: 'follow', // Explicitly follow redirects
        credentials: 'include', // Send fw_aid cookie for anonymous tracking
      })

      clearTimeout(timeoutId)

      let data: unknown
      const contentType = response.headers.get('content-type')

      // Handle 204 No Content responses (common for DELETE)
      if (response.status === 204) {
        data = undefined
      } else if (contentType?.includes('application/json')) {
        // Only try to parse JSON if there's actually content
        const text = await response.text()
        data = text ? JSON.parse(text) : undefined
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        // Handle 401 specifically for token refresh
        if (response.status === 401 && auth.currentUser) {
          console.error('401 received, attempting token refresh...')
          const refreshedToken = await auth.currentUser.getIdToken(true)
          
          if (refreshedToken) {
            // Retry the request with refreshed token
            headers.set('Authorization', `Bearer ${refreshedToken}`)
            const retryResponse = await fetch(url, {
              ...options,
              headers,
              credentials: 'include',
            })

            let retryData: unknown
            const retryContentType = retryResponse.headers.get('content-type')

            // Handle 204 No Content responses (common for DELETE)
            if (retryResponse.status === 204) {
              retryData = undefined
            } else if (retryContentType?.includes('application/json')) {
              const retryText = await retryResponse.text()
              retryData = retryText ? JSON.parse(retryText) : undefined
            } else {
              retryData = await retryResponse.text()
            }

            if (!retryResponse.ok) {
              throw this.createApiError(retryResponse, retryData)
            }

            return {
              data: retryData as T,
              status: retryResponse.status,
              headers: retryResponse.headers,
            }
          }
        }

        throw this.createApiError(response, data)
      }

      return {
        data: data as T,
        status: response.status,
        headers: response.headers,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout')
      }

      throw error
    }
  }

  async get<T = unknown>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    // Handle FormData specially - don't JSON.stringify it
    let body: BodyInit | undefined
    if (data) {
      if (data instanceof FormData) {
        body = data
      } else {
        body = JSON.stringify(data)
      }
    }
    
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body,
    })
  }

  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    // Handle FormData specially - don't JSON.stringify it
    let body: BodyInit | undefined
    if (data) {
      if (data instanceof FormData) {
        body = data
      } else {
        body = JSON.stringify(data)
      }
    }
    
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body,
    })
  }

  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<ApiResponse<T>> {
    // Handle FormData specially - don't JSON.stringify it
    let body: BodyInit | undefined
    if (data) {
      if (data instanceof FormData) {
        body = data
      } else {
        body = JSON.stringify(data)
      }
    }
    
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body,
    })
  }

  async delete<T = unknown>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }

  /**
   * Make a streaming request that returns the raw Response object.
   * Use this for SSE or other streaming endpoints where you need to read from the body stream.
   * Handles authentication and token refresh automatically.
   */
  async stream(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseURL}${endpoint}`
    const token = await this.getAuthToken()

    const headers = new Headers({
      ...this.defaultHeaders,
      ...options.headers,
    })

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    })

    if (!response.ok) {
      // Handle 401 specifically for token refresh
      if (response.status === 401 && auth.currentUser) {
        console.error('401 received on stream request, attempting token refresh...')
        const refreshedToken = await auth.currentUser.getIdToken(true)

        if (refreshedToken) {
          // Retry the request with refreshed token
          headers.set('Authorization', `Bearer ${refreshedToken}`)
          const retryResponse = await fetch(url, {
            ...options,
            headers,
            credentials: 'include',
          })

          if (!retryResponse.ok) {
            const errorText = await retryResponse.text()
            throw this.createApiError(retryResponse, errorText)
          }

          return retryResponse
        }
      }

      const errorText = await response.text()
      throw this.createApiError(response, errorText)
    }

    return response
  }
}

// Default instance for main API
export const apiClient = new ApiClient()

// Lazy-initialized Agent API client for Claude Agent service
let _agentApiClient: ApiClient | null = null

/**
 * Get the Agent API client for Claude Agent service (uses NEXT_PUBLIC_CLAUDE_AGENT_URL).
 * Throws if the environment variable is not configured.
 */
export function getAgentApiClient(): ApiClient {
  if (!_agentApiClient) {
    const baseURL = process.env.NEXT_PUBLIC_CLAUDE_AGENT_URL
    if (!baseURL) {
      throw new Error('NEXT_PUBLIC_CLAUDE_AGENT_URL environment variable is required for agent API')
    }
    _agentApiClient = new ApiClient({ baseURL })
  }
  return _agentApiClient
}

// Utility function for React Query integration
export const createQueryFn = <T = unknown>(endpoint: string, options?: RequestInit) => {
  return async (): Promise<T> => {
    const response = await apiClient.get<T>(endpoint, options)
    return response.data
  }
}

// Utility function for mutations
export const createMutationFn = <TData = unknown, TVariables = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST'
) => {
  return async (variables: TVariables): Promise<TData> => {
    const response = await apiClient.request<TData>(endpoint, {
      method,
      body: method !== 'DELETE' ? JSON.stringify(variables) : undefined,
    })
    return response.data
  }
}