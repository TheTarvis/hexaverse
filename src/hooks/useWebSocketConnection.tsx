'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketEndpoint, checkHealth } from '@/services/websocket';
import { useAuth } from '@/contexts/AuthContext';

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
}

export const useWebSocketConnection = ({
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  autoReconnect = false,
  autoConnect = true,
}: WebSocketConnectionOptions = {}) => {
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [connectionState, setConnectionState] = useState<ConnectionState>(globalConnectionState);
  const reconnectCount = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const hasAttemptedInitialConnection = useRef(false);

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
      // Don't attempt connection if auth is still loading
      if (isAuthLoading) {
        console.log('Auth is still loading, waiting before connection attempt');
        return;
      }

      // Don't attempt connection if no user
      if (!user) {
        console.log('No user available, cannot connect to WebSocket');
        updateGlobalState(false, ConnectionState.DISCONNECTED);
        return;
      }

      // Use global variables for connection state to prevent multiple connections
      if (globalWsConnecting) {
        console.log('Connection attempt already in progress globally, skipping');
        return;
      }
      
      // Add cooldown between connection attempts to prevent spam
      const now = Date.now();
      if (now - globalLastConnectionAttempt < CONNECTION_COOLDOWN_MS) {
        console.log(`Connection attempt throttled globally. Try again in ${Math.ceil((CONNECTION_COOLDOWN_MS - (now - globalLastConnectionAttempt)) / 1000)}s`);
        return;
      }
      
      globalLastConnectionAttempt = now;

      // Check if we already have a working connection
      if (globalWsInstance?.readyState === WebSocket.OPEN) {
        console.log('Global WebSocket already connected, reusing connection');
        updateGlobalState(true, ConnectionState.CONNECTED);
        return;
      }
      
      // Clean up any existing connection
      if (globalWsInstance) {
        console.log('Closing existing global WebSocket connection');
        globalWsInstance.close();
        globalWsInstance = null;
      }
      
      globalWsConnecting = true;
      updateGlobalState(false, ConnectionState.CONNECTING);

      const endpoint = await getWebSocketEndpoint();
      console.log(`Connecting to WebSocket at ${endpoint} with token...`);
      
      // Append token as query parameter
      const wsUrl = new URL(endpoint);
      wsUrl.searchParams.append('token', await user.getIdToken())
      
      globalWsInstance = new WebSocket(wsUrl.toString());

      globalWsInstance.onopen = () => {
        console.log(`WebSocket connected successfully to ${endpoint}`);
        updateGlobalState(true, ConnectionState.CONNECTED);
        reconnectCount.current = 0;
        globalWsConnecting = false;
        hasAttemptedInitialConnection.current = true;
      };

      globalWsInstance.onclose = (event) => {
        console.log(`WebSocket disconnected with code: ${event.code}, reason: ${event.reason || 'No reason provided'}`);
        updateGlobalState(false, ConnectionState.DISCONNECTED);
        globalWsConnecting = false;
        globalWsInstance = null;
      };

      globalWsInstance.onerror = (error) => {
        console.error('WebSocket error occurred:', error);
        updateGlobalState(false, ConnectionState.ERROR);
        globalWsConnecting = false;
        
        if (typeof error === 'object' && error !== null && 'message' in error) {
          console.error('Error details:', (error as any).message);
        }
      };

      globalWsInstance.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.debug('WebSocket message received:', data);
          messageListeners.forEach(listener => listener(data));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          console.debug('Raw message content:', event.data);
          messageListeners.forEach(listener => listener(event.data));
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      updateGlobalState(false, ConnectionState.ERROR);
      globalWsConnecting = false;
      
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    }
  }, [user, isAuthLoading]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      console.log('Clearing reconnect timeout');
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (globalWsInstance) {
      console.log('Closing WebSocket connection...');
      globalWsInstance.close();
      globalWsInstance = null;
    }
    
    updateGlobalState(false, ConnectionState.DISCONNECTED);
    globalWsConnecting = false;
  }, []);

  // Auto-connect effect
  useEffect(() => {
    if (!autoConnect || isAuthLoading || hasAttemptedInitialConnection.current) {
      return;
    }

    if (user) {
      console.log('Auto-connecting to WebSocket...');
      connect();
    }

    return () => {
      console.debug('Component unmounting, but keeping WebSocket connection for other subscribers');
    };
  }, [connect, autoConnect, user, isAuthLoading]);

  // Periodic health check and reconnect when disconnected or error
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    
    // Only start polling if:
    // 1. We're disconnected or in error state
    // 2. Auto-connect is enabled
    // 3. We have a user
    // 4. Auth is not loading
    // 5. We've attempted initial connection
    if (
      (connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR) && 
      autoConnect && 
      user && 
      !isAuthLoading &&
      hasAttemptedInitialConnection.current
    ) {
      pollInterval = setInterval(async () => {
        if (reconnectCount.current < reconnectAttempts) {
          if (autoReconnect) {
            console.log('Auto-reconnect enabled, attempting reconnect...');
            reconnectCount.current += 1;
            connect();
          } else {
            const healthy = await checkHealth();
            if (healthy) {
              console.log('WebSocket health check passed, attempting reconnect...');
              reconnectCount.current += 1;
              connect();
            } else {
              console.log('WebSocket health check failed, will retry...');
            }
          }
        } else {
          console.warn('Max reconnect attempts reached, stopping further attempts.');
        }
      }, reconnectInterval);
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionState, autoConnect, autoReconnect, connect, reconnectAttempts, reconnectInterval, user, isAuthLoading]);

  return {
    isConnected,
    connectionState,
    connect,
    disconnect,
    sendMessage: useCallback((data: any) => {
      if (!globalWsInstance || globalWsInstance.readyState !== WebSocket.OPEN) {
        console.warn(`WebSocket is not connected. Current state: ${globalWsInstance ? globalWsInstance.readyState : 'null'}`);
        return;
      }

      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        console.debug('Sending WebSocket message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));
        globalWsInstance.send(message);
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
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