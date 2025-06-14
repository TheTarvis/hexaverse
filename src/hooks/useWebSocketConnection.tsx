'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import {getWebSocketEndpoint, checkHealth, addAuth, COLONY_WEBSOCKET_URL} from '@/services/websocket';
import { useAuth } from '@/contexts/AuthContext';
import logger from '@/utils/logger';

// WebSocket connection states
export const enum ConnectionState {
  INITIAL = 'INITIAL',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

// Global state management
let globalWsInstance: WebSocket | null = null;
let globalWsConnecting = false;
let globalLastConnectionAttempt = 0;
const CONNECTION_COOLDOWN_MS = 5000; // 5 second cooldown between connection attempts
let globalServerUrl: string = COLONY_WEBSOCKET_URL;

let globalIsConnected = false;
let globalConnectionState = ConnectionState.INITIAL;
const messageListeners = new Set<(data: any) => void>();
const connectionListeners = new Set<() => void>();
const disconnectionListeners = new Set<() => void>();

const updateGlobalState = (isConnected: boolean, state: ConnectionState) => {
  globalIsConnected = isConnected;
  globalConnectionState = state;
  
  if (isConnected) {
    connectionListeners.forEach(listener => listener());
  } else if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
    disconnectionListeners.forEach(listener => listener());
  }
};

interface WebSocketConnectionOptions {
  reconnectAttempts?: number;
  reconnectInterval?: number;
  autoReconnect?: boolean;
  autoConnect?: boolean;
  initialServerUrl?: string | null;
  requireAuth?: boolean;
}

export const useWebSocketConnection = ({
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  autoReconnect = false,
  autoConnect = true,
  initialServerUrl = null,
  requireAuth = true,
}: WebSocketConnectionOptions = {}) => {
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [connectionState, setConnectionState] = useState<ConnectionState>(globalConnectionState);
  const [serverUrl, setServerUrlState] = useState<string | null>(initialServerUrl || globalServerUrl);
  const reconnectCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const hasAttemptedInitialConnection = useRef(false);

  // Initialize global server URL if provided and not already set
  useEffect(() => {
    if (initialServerUrl && !globalServerUrl) {
      globalServerUrl = initialServerUrl;
    }
  }, [initialServerUrl]);

  // Function to update the server URL
  const setServerUrl = useCallback((url: string) => {
    logger.info(`Setting WebSocket server URL to: ${url}`);
    globalServerUrl = url;
    setServerUrlState(url);
    
    // If already connected, disconnect and reconnect with new URL
    if (globalWsInstance) {
      logger.info('Reconnecting to new server URL...');
      disconnect();
      // Short delay to ensure disconnect completes before reconnecting
      setTimeout(() => connect(), 300);
    }
  }, []);

  // Subscribe to global state changes
  useEffect(() => {
    const updateLocalState = () => {
      setIsConnected(globalIsConnected);
      setConnectionState(globalConnectionState);
    };
    
    connectionListeners.add(updateLocalState);
    disconnectionListeners.add(updateLocalState);
    
    return () => {
      connectionListeners.delete(updateLocalState);
      disconnectionListeners.delete(updateLocalState);
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      // Auth checks only if required
      if (requireAuth) {
        // Don't attempt connection if auth is still loading
        if (isAuthLoading) {
          logger.info('Auth is still loading, waiting before connection attempt');
          return;
        }

        // Don't attempt connection if no user
        if (!user) {
          logger.info('No user available, cannot connect to WebSocket (auth required)');
          updateGlobalState(false, ConnectionState.DISCONNECTED);
          return;
        }
      } else {
        logger.info('Auth not required for WebSocket connection');
      }

      // Use global variables for connection state to prevent multiple connections
      if (globalWsConnecting) {
        logger.info('Connection attempt already in progress globally, skipping');
        return;
      }
      
      // Add cooldown between connection attempts to prevent spam
      const now = Date.now();
      if (now - globalLastConnectionAttempt < CONNECTION_COOLDOWN_MS) {
        logger.info(`Connection attempt throttled globally. Try again in ${Math.ceil((CONNECTION_COOLDOWN_MS - (now - globalLastConnectionAttempt)) / 1000)}s`);
        return;
      }
      
      globalLastConnectionAttempt = now;

      // Check if we already have a working connection
      if (globalWsInstance?.readyState === WebSocket.OPEN) {
        logger.info('Global WebSocket already connected, reusing connection');
        updateGlobalState(true, ConnectionState.CONNECTED);
        return;
      }
      
      // Clean up any existing connection
      if (globalWsInstance) {
        logger.info('Closing existing global WebSocket connection');
        globalWsInstance.close();
        globalWsInstance = null;
      }
      
      globalWsConnecting = true;
      updateGlobalState(false, ConnectionState.CONNECTING);

      // Add authentication to the provided URL (will handle no-auth case)
      let endpoint = await getWebSocketEndpoint(globalServerUrl, requireAuth);
      logger.info(`Connecting to ${requireAuth ? 'authenticated' : 'unauthenticated'} WebSocket at ${endpoint.substring(0, endpoint.includes('token') ? 50 : endpoint.length)}${endpoint.includes('token') ? '...' : ''}`);
      
      globalWsInstance = new WebSocket(endpoint);

      globalWsInstance.onopen = () => {
        logger.info(`WebSocket connected successfully to ${endpoint}`);
        updateGlobalState(true, ConnectionState.CONNECTED);
        reconnectCount.current = 0;
        globalWsConnecting = false;
        hasAttemptedInitialConnection.current = true;
      };

      globalWsInstance.onclose = (event) => {
        logger.info(`WebSocket disconnected with code: ${event.code}, reason: ${event.reason || 'No reason provided'}`);
        updateGlobalState(false, ConnectionState.DISCONNECTED);
        globalWsConnecting = false;
        globalWsInstance = null;
      };

      globalWsInstance.onerror = (error) => {
        logger.error('WebSocket error occurred:', error);
        updateGlobalState(false, ConnectionState.ERROR);
        globalWsConnecting = false;
        
        if (typeof error === 'object' && error !== null && 'message' in error) {
          logger.error('Error details:', (error as any).message);
        }
      };

      globalWsInstance.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          logger.debug('WebSocket message received:', data);
          messageListeners.forEach(listener => listener(data));
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
          logger.debug('Raw message content:', event.data);
          messageListeners.forEach(listener => listener(event.data));
        }
      };
    } catch (error) {
      logger.error('Error creating WebSocket connection:', error);
      updateGlobalState(false, ConnectionState.ERROR);
      globalWsConnecting = false;
      
      if (error instanceof Error) {
        logger.error('Error message:', error.message);
        logger.error('Error stack:', error.stack);
      }
    }
  }, [user, isAuthLoading, requireAuth]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      logger.info('Clearing reconnect timeout');
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (globalWsInstance) {
      logger.info('Closing WebSocket connection...');
      globalWsInstance.close();
      globalWsInstance = null;
    }
    
    updateGlobalState(false, ConnectionState.DISCONNECTED);
    globalWsConnecting = false;
  }, []);

  // Auto-connect effect
  useEffect(() => {
    if (!autoConnect || hasAttemptedInitialConnection.current) {
      return;
    }

    // If auth is required, wait for it to complete and ensure user exists
    if (requireAuth) {
      if (isAuthLoading) {
        return; // Wait for auth to complete
      }
      if (user) {
        logger.info('Auto-connecting to WebSocket with authentication...');
        connect();
      }
    } else {
      // If auth is not required, connect immediately
      logger.info('Auto-connecting to WebSocket without authentication...');
      connect();
    }

    return () => {
      logger.debug('Component unmounting, but keeping WebSocket connection for other subscribers');
    };
  }, [connect, autoConnect, user, isAuthLoading, requireAuth]);

  // Periodic health check and reconnect when disconnected or error
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Only start polling if:
    // 1. We're disconnected or in error state
    // 2. Auto-connect is enabled
    // 3. We've attempted initial connection
    // 4. If auth is required: we have a user and auth is not loading
    // 5. If auth is not required: always try to reconnect
    const shouldPoll = (connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR) && 
      autoConnect && 
      hasAttemptedInitialConnection.current &&
      (requireAuth ? (user && !isAuthLoading) : true);
    
    if (shouldPoll) {
      pollInterval = setInterval(async () => {
        if (reconnectCount.current < reconnectAttempts) {
          if (autoReconnect) {
            logger.info('Auto-reconnect enabled, attempting reconnect...');
            reconnectCount.current += 1;
            connect();
          } else {
            const healthy = await checkHealth(globalServerUrl);
            if (healthy) {
              logger.info('WebSocket health check passed, attempting reconnect...');
              reconnectCount.current += 1;
              connect();
            } else {
              logger.info('WebSocket health check failed, will retry...');
            }
          }
        } else {
          logger.warn('Max reconnect attempts reached, stopping further attempts.');
        }
      }, reconnectInterval);
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionState, autoConnect, autoReconnect, connect, reconnectAttempts, reconnectInterval, user, isAuthLoading, requireAuth]);

  return {
    isConnected,
    connectionState,
    connect,
    disconnect,
    serverUrl,
    setServerUrl,
    sendMessage: useCallback((data: any) => {
      if (!globalWsInstance || globalWsInstance.readyState !== WebSocket.OPEN) {
        logger.warn(`WebSocket is not connected. Current state: ${globalWsInstance ? globalWsInstance.readyState : 'null'}`);
        return;
      }

      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        logger.debug('Sending WebSocket message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));
        globalWsInstance.send(message);
      } catch (error) {
        logger.error('Error sending WebSocket message:', error);
        if (error instanceof Error) {
          logger.error('Error message:', error.message);
        }
      }
    }, []),
  };
};

// Export functions to manage global listeners
export const addMessageListener = (listener: (data: any) => void) => {
  messageListeners.add(listener);
};

export const removeMessageListener = (listener: (data: any) => void) => {
  messageListeners.delete(listener);
};

export const addConnectionListener = (listener: () => void) => {
  connectionListeners.add(listener);
};

export const removeConnectionListener = (listener: () => void) => {
  connectionListeners.delete(listener);
};

export const addDisconnectionListener = (listener: () => void) => {
  disconnectionListeners.add(listener);
};

export const removeDisconnectionListener = (listener: () => void) => {
  disconnectionListeners.delete(listener);
}; 