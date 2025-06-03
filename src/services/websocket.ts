'use client'

import { getAuthToken } from '@/services/auth'
import logger from '@/utils/logger'

// More specific environment variables for different websocket servers
export const COLONY_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_COLONY_WEBSOCKET_URL || 'localhost:8081'

export const DRAWING_WEBSOCKET_URL =
  process.env.NEXT_PUBLIC_DRAWING_WEBSOCKET_URL || 'localhost:8081'

/**
 * Add authentication to a WebSocket URL
 * @param baseUrl The base WebSocket URL to authenticate
 * @param requireAuth Whether authentication is required
 * @returns The WebSocket URL with authentication token added (if required)
 */
export const addAuth = async (baseUrl: string, requireAuth: boolean = true): Promise<string> => {
  try {
    // Create URL object to properly handle query parameters
    logger.debug('Base URL: ' + baseUrl)
    const wsUrl = new URL(baseUrl)

    // Only add auth if required
    if (requireAuth) {
      // Get the user's Firebase token for authentication
      const token = await getAuthToken()

      // Log token info for debugging
      if (token) {
        logger.debug(`Token available for WebSocket auth (length: ${token.length})`)
        wsUrl.searchParams.append('token', token)
      } else {
        logger.warn('No authentication token available for WebSocket connection')
      }
    } else {
      logger.debug('Authentication not required for WebSocket connection')
    }

    const endpoint = wsUrl.toString()

    logger.debug(
      `${requireAuth ? 'Authenticated' : 'Unauthenticated'} WebSocket endpoint: ${endpoint.substring(0, endpoint.includes('token') ? 50 : endpoint.length)}${endpoint.includes('token') ? '...' : ''}`
    )

    return endpoint
  } catch (error) {
    logger.error('Error adding authentication to WebSocket URL:', error)
    // Return original URL as fallback
    return baseUrl
  }
}

/**
 * Get the WebSocket endpoint URL
 * @param baseUrl The base WebSocket URL
 * @param requireAuth Whether authentication is required (default: true)
 * @returns The complete WebSocket URL with protocol and path
 */
export const getWebSocketEndpoint = async (baseUrl: string, requireAuth: boolean = true): Promise<string> => {
  if (!baseUrl) {
    throw new Error('WebSocket URL not configured in environment variables')
  }
  // Determine the correct protocol based on the environment
  // Use wss:// for production server and ws:// for localhost
  const isLocalhost = baseUrl.includes('localhost')
  const protocol = isLocalhost ? 'ws' : 'wss'

  const baseEndpoint = `${protocol}://${baseUrl}/ws`

  // Use the addAuth function with requireAuth parameter
  return await addAuth(baseEndpoint, requireAuth)
}

/**
 * Get the health check endpoint URL
 * @returns The complete health check URL with protocol and path
 */
export const getHealthCheckEndpoint = (baseUrl: string): string => {
  if (!baseUrl) {
    throw new Error('WebSocket URL not configured in environment variables')
  }
  const isLocalhost = baseUrl.includes('localhost')
  const protocol = isLocalhost ? 'http' : 'https'
  return `${protocol}://${baseUrl}/health`
}

/**
 * Check the health of the WebSocket server
 * @returns Promise that resolves to true if server is healthy
 */
export const checkHealth = async (baseUrl: string): Promise<boolean> => {
  try {
    const endpoint = getHealthCheckEndpoint(baseUrl)
    logger.debug(`Checking health at ${endpoint}`)
    const response = await fetch(endpoint)
    const isHealthy = response.ok
    logger.info(`Health check result: ${isHealthy ? 'healthy' : 'unhealthy'}`)
    return isHealthy
  } catch (error) {
    logger.error('Health check failed:', error)
    return false
  }
}

/**
 * Test authentication token with the server
 * This can help diagnose issues with WebSocket authentication
 * @returns Promise that resolves to true if authentication is successful
 */
export const testAuthentication = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const token = await getAuthToken()
    if (!token) {
      return {
        success: false,
        message: 'No authentication token available',
      }
    }

    // Try to make a direct authenticated request to check token validity
    const endpoint = getHealthCheckEndpoint(COLONY_WEBSOCKET_URL)
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    return {
      success: response.ok,
      message: response.ok
        ? 'Authentication successful'
        : `Auth test failed (${response.status}: ${response.statusText})`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message: `Authentication test error: ${message}` }
  }
}