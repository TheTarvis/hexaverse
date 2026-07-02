'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketEndpoint, checkHealth } from '@/services/websocket';
import { ColonyWebSocketMessage, PayloadType, PingPongMessage } from '@/types/websocket';
import {useAuth} from "@/contexts/AuthContext";
import { useWebSocketSubscription } from './useWebSocketSubscription';

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
  onMessage?: <T = any>(data: ColonyWebSocketMessage<T>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  autoReconnect?: boolean;
  autoConnect?: boolean;
}

interface WebSocketHookReturn {
  sendMessage: (data: ColonyWebSocketMessage<any> | PingPongMessage | any) => void;
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
