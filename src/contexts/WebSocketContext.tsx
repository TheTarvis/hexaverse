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

export function WebSocketProvider({ 
  children,
  initialServerUrl = null,
  autoConnect = true,
  autoReconnect = true,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
}: { 
  children: ReactNode;
  initialServerUrl?: string | null;
  autoConnect?: boolean;
  autoReconnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
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