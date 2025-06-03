'use client'

import { createContext, useContext, ReactNode } from 'react';
import { useWebSocketConnection, ConnectionState } from '@/hooks/useWebSocketConnection';
import { ColonyWebSocketMessage } from '@/types/websocket';

interface WebSocketContextType {
  isConnected: boolean;
  connectionState: ConnectionState;
  sendMessage: (data: any) => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  setServerUrl: (url: string) => void;
  serverUrl: string | null;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

/**
 * WebSocket Provider component that manages WebSocket connections for the application
 * 
 * @param children - React children components
 * @param initialServerUrl - Initial WebSocket server URL (optional)
 * @param autoConnect - Whether to automatically connect on mount (default: true)
 * @param autoReconnect - Whether to automatically reconnect on connection loss (default: true)
 * @param reconnectAttempts - Number of reconnection attempts (default: 5)
 * @param reconnectInterval - Interval between reconnection attempts in ms (default: 3000)
 * @param requireAuth - Whether user authentication is required for WebSocket connection (default: true)
 * 
 * @example
 * // Require authentication (default behavior)
 * <WebSocketProvider requireAuth={true}>
 *   <App />
 * </WebSocketProvider>
 * 
 * @example
 * // Allow connections without authentication
 * <WebSocketProvider requireAuth={false}>
 *   <PublicApp />
 * </WebSocketProvider>
 */
export function WebSocketProvider({ 
  children,
  initialServerUrl = null,
  autoConnect = true,
  autoReconnect = true,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  requireAuth = true,
}: { 
  children: ReactNode;
  initialServerUrl?: string | null;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  requireAuth?: boolean;
}) {
  const { 
    isConnected, 
    connectionState, 
    sendMessage,
    connect,
    disconnect,
    setServerUrl,
    serverUrl
  } = useWebSocketConnection({
    initialServerUrl,
    autoConnect,
    autoReconnect,
    reconnectAttempts,
    reconnectInterval,
    requireAuth,
  });

  return (
    <WebSocketContext.Provider value={{
      isConnected,
      connectionState,
      sendMessage,
      connect,
      disconnect,
      setServerUrl,
      serverUrl
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook to use the WebSocket context
export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
} 