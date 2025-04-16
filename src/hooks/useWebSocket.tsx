'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketEndpoint } from '@/services/websocket';
import { WebSocketMessage, PayloadType, PingPongMessage } from '@/types/websocket';

// Create a singleton instance that can be shared across renders
let globalWsInstance: WebSocket | null = null;
let globalWsConnecting = false;
let globalLastConnectionAttempt = 0;
const CONNECTION_COOLDOWN_MS = 5000; // 5 second cooldown between connection attempts

interface WebSocketHookOptions {
  onMessage?: <T = any>(data: WebSocketMessage<T>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  autoReconnect?: boolean;
  autoConnect?: boolean;
  token?: string | null;
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
  token = null,
}: WebSocketHookOptions = {}): WebSocketHookReturn => {
  // Use the global instance instead of creating a new one per component
  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<string>(ConnectionState.INITIAL);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const connectingRef = useRef(false);
  const lastConnectionAttemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  
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
      setIsConnected(true);
      setConnectionState(ConnectionState.CONNECTED);
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
      
      if (!token) {
        console.log('No authentication token available, cannot connect to WebSocket');
        setConnectionState(ConnectionState.DISCONNECTED);
        return;
      }

      // Check if we already have a working connection
      if (globalWsInstance?.readyState === WebSocket.OPEN) {
        console.log('Global WebSocket already connected, reusing connection');
        ws.current = globalWsInstance;
        setIsConnected(true);
        setConnectionState(ConnectionState.CONNECTED);
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
      setConnectionState(ConnectionState.CONNECTING);

      const endpoint = await getWebSocketEndpoint();
      console.log(`Connecting to WebSocket at ${endpoint} with token...`);
      
      // Append token as query parameter
      const wsUrl = new URL(endpoint);
      wsUrl.searchParams.append('token', token);
      
      globalWsInstance = new WebSocket(wsUrl.toString());
      ws.current = globalWsInstance;

      globalWsInstance.onopen = () => {
        console.log(`WebSocket connected successfully to ${endpoint}`);
        setIsConnected(true);
        setConnectionState(ConnectionState.CONNECTED);
        reconnectCount.current = 0;
        connectingRef.current = false;
        globalWsConnecting = false;
        onConnectRef.current?.();
      };

      globalWsInstance.onclose = (event) => {
        console.log(`WebSocket disconnected with code: ${event.code}, reason: ${event.reason || 'No reason provided'}`);
        setIsConnected(false);
        setConnectionState(ConnectionState.DISCONNECTED);
        connectingRef.current = false;
        globalWsConnecting = false;
        globalWsInstance = null;
        onDisconnectRef.current?.();

        // Retry logic disabled - no need to modify this section since autoReconnect is false by default
        if (autoReconnect && reconnectCount.current < reconnectAttempts) {
          console.log('Auto-reconnect is disabled');
        }
      };

      globalWsInstance.onerror = (error) => {
        console.error('WebSocket error occurred:', error);
        setConnectionState(ConnectionState.ERROR);
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
      setConnectionState(ConnectionState.ERROR);
      connectingRef.current = false;
      globalWsConnecting = false;
      
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
    }
  }, [token, autoReconnect, reconnectAttempts]);

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
    setIsConnected(false);
    setConnectionState(ConnectionState.DISCONNECTED);
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
    if (autoConnect && token) {
      console.log('Auto-connecting to WebSocket with token...');
      connect();
    } else if (!token) {
      console.log('Waiting for authentication token before connecting to WebSocket');
    } else {
      console.log('Auto-connect is disabled, waiting for manual connection');
    }

    return () => {
      console.log('Component unmounting, but keeping WebSocket connection for other subscribers');
    };
  }, [connect, autoConnect, token]);

  return {
    sendMessage,
    isConnected,
    disconnect,
    connect,
    connectionState,
  };
}; 