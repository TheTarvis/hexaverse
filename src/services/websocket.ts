'use client'

import { getAuthToken } from '@/services/auth';

const WEBSOCKET_BASE_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;

/**
 * Get the WebSocket endpoint URL
 * @returns The complete WebSocket URL with protocol and path
 */
export const getWebSocketEndpoint = async (): Promise<string> => {
  if (!WEBSOCKET_BASE_URL) {
    throw new Error('WebSocket URL not configured in environment variables');
  }

  try {
    // Get the user's Firebase token for authentication
    const token = await getAuthToken();
    
    // Log token info for debugging
    if (token) {
      console.log(`Token available for WebSocket auth (length: ${token.length})`);
    } else {
      console.warn('No authentication token available for WebSocket connection');
    }
    
    // Format the token parameter
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    
    // Determine the correct protocol based on the environment
    // Use wss:// for production server and ws:// for localhost
    const isLocalhost = WEBSOCKET_BASE_URL.includes('localhost');
    const protocol = isLocalhost ? 'ws' : 'wss';
    
    const endpoint = `${protocol}://${WEBSOCKET_BASE_URL}/ws${tokenParam}`;
    
    console.log(`WebSocket endpoint: ${endpoint.substring(0, endpoint.includes('token') ? 50 : endpoint.length)}${endpoint.includes('token') ? '...' : ''}`);
    
    return endpoint;
  } catch (error) {
    console.error('Error generating WebSocket endpoint:', error);
    // Return non-authenticated endpoint as fallback
    const isLocalhost = WEBSOCKET_BASE_URL.includes('localhost');
    const protocol = isLocalhost ? 'ws' : 'wss';
    return `${protocol}://${WEBSOCKET_BASE_URL}/ws`;
  }
};

/**
 * Get the health check endpoint URL
 * @returns The complete health check URL with protocol and path
 */
export const getHealthCheckEndpoint = (): string => {
  if (!WEBSOCKET_BASE_URL) {
    throw new Error('WebSocket URL not configured in environment variables');
  }
  const isLocalhost = WEBSOCKET_BASE_URL.includes('localhost');
  const protocol = isLocalhost ? 'http' : 'https';
  return `${protocol}://${WEBSOCKET_BASE_URL}/health`;
};

/**
 * Check the health of the WebSocket server
 * @returns Promise that resolves to true if server is healthy
 */
export const checkHealth = async (): Promise<boolean> => {
  try {
    const endpoint = getHealthCheckEndpoint();
    console.log(`Checking health at ${endpoint}`);
    const response = await fetch(endpoint);
    const isHealthy = response.ok;
    console.log(`Health check result: ${isHealthy ? 'healthy' : 'unhealthy'}`);
    return isHealthy;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
};

/**
 * Test authentication token with the server
 * This can help diagnose issues with WebSocket authentication
 * @returns Promise that resolves to true if authentication is successful
 */
export const testAuthentication = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const token = await getAuthToken();
    if (!token) {
      return { 
        success: false, 
        message: 'No authentication token available' 
      };
    }
    
    // Try to make a direct authenticated request to check token validity
    const endpoint = getHealthCheckEndpoint();
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return { 
      success: response.ok, 
      message: response.ok ? 'Authentication successful' : `Auth test failed (${response.status}: ${response.statusText})` 
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, message: `Authentication test error: ${message}` };
  }
}; 