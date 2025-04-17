'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketEndpoint, checkHealth } from '@/services/websocket';
import { WebSocketMessage, PayloadType, PingPongMessage } from '@/types/websocket';
import {useAuth} from "@/contexts/AuthContext";

// Create a singleton instance that can be shared across renders
let globalWsInstance: WebSocket | null = null;
let globalWsConnecting = false;
let globalLastConnectionAttempt = 0;
const CONNECTION_COOLDOWN_MS = 5000; // 5 second cooldown between connection attempts

// Global state management
type Listener = () => void;
let globalIsConnected = false;
let globalConnectionState = 'INITIAL';
const listeners = new Set<Listener>();

const updateGlobalState = (isConnected: boolean, state: string) => {
  globalIsConnected = isConnected;
  globalConnectionState = state;
  listeners.forEach(listener => listener());
};

interface WebSocketHookOptions {
  onMessage?: <T = any>(data: WebSocketMessage<T>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  autoReconnect?: boolean;
  autoConnect?: boolean;
}

interface WebSocketHookReturn {
  sendMessage: (data: WebSocketMessage<any> | PingPongMessage | any) => void;
  isConnected: boolean;
  disconnect: () => void;
  connect: () => Promise<void>;
  connectionState: string;
}

// WebSocket connection states
const enum ConnectionState {
  INITIAL = 'INITIAL',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR'
}

export const useWebSocket = ({
  onMessage,
  onConnect,
  onDisconnect,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  autoReconnect = false,
  autoConnect = true,
}: WebSocketHookOptions = {}): WebSocketHookReturn => {
  // Use the global instance instead of creating a new one per component
  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const [isConnected, setIsConnected] = useState(globalIsConnected);
  const [connectionState, setConnectionState] = useState<string>(globalConnectionState);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectingRef = useRef(false);
  const lastConnectionAttemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const { user } = useAuth()
  
  // Subscribe to global state changes
  useEffect(() => {
    const listener = () => {
      setIsConnected(globalIsConnected);
      setConnectionState(globalConnectionState);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  
  // Update refs when props change
  useEffect(() => {
    onMessageRef.current = onMessage;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
  }, [onMessage, onConnect, onDisconnect]);
  
  // Sync local state with global state when mounting
  useEffect(() => {
    // Check if we already have a connection
    if (globalWsInstance && globalWsInstance.readyState === WebSocket.OPEN) {
      ws.current = globalWsInstance;
      updateGlobalState(true, ConnectionState.CONNECTED);
      console.log('Reusing existing WebSocket connection');
    }
  }, []);

  const connect = useCallback(async () => {
    try {
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
      
      if (!user || !user.uid) {
        console.log('No authentication token available, cannot connect to WebSocket');
        updateGlobalState(false, ConnectionState.DISCONNECTED);
        return;
      }

      // Check if we already have a working connection
      if (globalWsInstance?.readyState === WebSocket.OPEN) {
        console.log('Global WebSocket already connected, reusing connection');
        ws.current = globalWsInstance;
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
      connectingRef.current = true;
      updateGlobalState(false, ConnectionState.CONNECTING);

      const endpoint = await getWebSocketEndpoint();
      console.log(`Connecting to WebSocket at ${endpoint} with token...`);
      
      // Append token as query parameter
      const wsUrl = new URL(endpoint);
      wsUrl.searchParams.append('token', await user.getIdToken())
      
      globalWsInstance = new WebSocket(wsUrl.toString());
      ws.current = globalWsInstance;

      globalWsInstance.onopen = () => {
        console.log(`WebSocket connected successfully to ${endpoint}`);
        updateGlobalState(true, ConnectionState.CONNECTED);
        reconnectCount.current = 0;
        connectingRef.current = false;
        globalWsConnecting = false;
        onConnectRef.current?.();
      };

      globalWsInstance.onclose = (event) => {
        console.log(`WebSocket disconnected with code: ${event.code}, reason: ${event.reason || 'No reason provided'}`);
        updateGlobalState(false, ConnectionState.DISCONNECTED);
        connectingRef.current = false;
        globalWsConnecting = false;
        globalWsInstance = null;
        onDisconnectRef.current?.();
      };

      globalWsInstance.onerror = (error) => {
        console.error('WebSocket error occurred:', error);
        updateGlobalState(false, ConnectionState.ERROR);
        connectingRef.current = false;
        globalWsConnecting = false;
        
        if (typeof error === 'object' && error !== null && 'message' in error) {
          console.error('Error details:', (error as any).message);
        }
      };

      globalWsInstance.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          onMessageRef.current?.(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          console.log('Raw message content:', event.data);
          onMessageRef.current?.(event.data);
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      updateGlobalState(false, ConnectionState.ERROR);
      connectingRef.current = false;
      globalWsConnecting = false;
      
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    }
  }, [autoReconnect, reconnectAttempts]);

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
    
    ws.current = null;
    updateGlobalState(false, ConnectionState.DISCONNECTED);
    globalWsConnecting = false;
  }, []);

  const sendMessage = useCallback((data: WebSocketMessage<any> | PingPongMessage | any) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket is not connected. Current state: ${ws.current ? ws.current.readyState : 'null'}`);
      return;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      console.log('Sending WebSocket message:', message.substring(0, 100) + (message.length > 100 ? '...' : ''));
      ws.current.send(message);
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
    }
  }, []);

  useEffect(() => {
    // Only connect automatically if autoConnect is true and token exists
    if (autoConnect) {
      console.log('Auto-connecting to WebSocket with token...');
      connect();
    } else {
      console.log('Auto-connect is disabled, waiting for manual connection');
    }

    return () => {
      console.log('Component unmounting, but keeping WebSocket connection for other subscribers');
    };
  }, [connect, autoConnect]);

  // Periodic health check and reconnect when disconnected or error
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    // Only poll if not connected and not currently connecting
    if ((connectionState === ConnectionState.DISCONNECTED || connectionState === ConnectionState.ERROR) && autoConnect && token) {
      pollInterval = setInterval(async () => {
        // Only attempt reconnect if we haven't exceeded max attempts
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
      }, reconnectInterval); // poll every 10 seconds
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [connectionState, autoConnect, autoReconnect, token, connect, reconnectAttempts]);

  return {
    sendMessage,
    isConnected,
    disconnect,
    connect,
    connectionState,
  };
};