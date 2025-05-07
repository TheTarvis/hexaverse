'use client'

import { useEffect } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { WebSocketMessage } from '@/types/websocket';
import { addMessageListener, removeMessageListener } from './useWebSocketConnection';

interface WebSocketSubscriptionOptions<T = any> {
  onMessage?: (data: WebSocketMessage<T>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const useWebSocketSubscription = <T = any>({
  onMessage,
  onConnect,
  onDisconnect,
}: WebSocketSubscriptionOptions<T> = {}) => {
  const { isConnected, connectionState, sendMessage, setServerUrl, serverUrl } = useWebSocketContext();

  // Handle messages
  useEffect(() => {
    if (!onMessage) return;

    const handleMessage = (data: any) => {
      onMessage(data);
    };

    addMessageListener(handleMessage);
    return () => removeMessageListener(handleMessage);
  }, [onMessage]);

  // Handle connection state changes
  useEffect(() => {
    if (isConnected && onConnect) {
      onConnect();
    } else if (!isConnected && onDisconnect && connectionState !== 'INITIAL') {
      onDisconnect();
    }
  }, [isConnected, connectionState, onConnect, onDisconnect]);

  return {
    isConnected,
    connectionState,
    sendMessage,
    setServerUrl,
    serverUrl,
  };
}; 