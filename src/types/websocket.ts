/**
 * WebSocket Message Types
 * 
 * This file defines the types and interfaces for WebSocket communication
 * between client and server.
 */

import { Tile } from '@/types/tiles';
import { Colony } from '@/types/colony';
import { Unit } from '@/types/units';

// Base type for all WebSocket messages
export interface WebSocketMessage<T = any> {
  type: string;
  timestamp: number;
  userId: string;
  colonyId?: string;
  payloadType: PayloadType;
  payload: T;
}

// Available payload types
export type PayloadType = 'tile' | 'colony' | 'unit' | 'building' | 'event' | 'notification';

// For tile payloads, use the existing Tile type
export type TilePayload = Tile;

// For colony payloads, use the existing Colony type
export type ColonyPayload = Colony;

// For unit payloads, use the existing Unit type
export type UnitPayload = Unit;

// Building payload interface
export interface BuildingPayload {
  id: string;
  type: string;
  ownerId: string;
  colonyId: string;
  tileId: string;
  level?: number;
  status?: string;
  production?: Record<string, number>;
}

// Notification payload interface
export interface NotificationPayload {
  message: string;
  severity?: 'info' | 'warning' | 'error' | 'success';
  clientTime?: string;
  data?: any;
}

// Simple ping/pong message for connection testing
export interface PingPongMessage {
  type: 'ping' | 'pong';
  timestamp: number;
  data?: any;
}

// Strongly typed message creators
export const createTileMessage = (
  tileData: TilePayload,
  userId: string,
  colonyId: string
): WebSocketMessage<TilePayload> => ({
  type: 'TILE_UPDATED',
  timestamp: Date.now(),
  userId,
  colonyId,
  payloadType: 'tile',
  payload: tileData
});

export const createColonyMessage = (
  colonyData: ColonyPayload,
  userId: string
): WebSocketMessage<ColonyPayload> => ({
  type: 'COLONY_UPDATED',
  timestamp: Date.now(),
  userId,
  colonyId: colonyData.id,
  payloadType: 'colony',
  payload: colonyData
});

export const createPingMessage = (): PingPongMessage => ({
  type: 'ping',
  timestamp: Date.now()
});

// Type guard functions
export const isTileMessage = (
  message: WebSocketMessage
): message is WebSocketMessage<TilePayload> => {
  return message.payloadType === 'tile';
};

export const isColonyMessage = (
  message: WebSocketMessage
): message is WebSocketMessage<ColonyPayload> => {
  return message.payloadType === 'colony';
};

export const isUnitMessage = (
  message: WebSocketMessage
): message is WebSocketMessage<UnitPayload> => {
  return message.payloadType === 'unit';
};

export const createNotificationMessage = (
  message: string,
  userId: string,
  severity: NotificationPayload['severity'] = 'info',
  colonyId?: string
): WebSocketMessage<NotificationPayload> => ({
  type: 'NOTIFICATION',
  timestamp: Date.now(),
  userId,
  colonyId,
  payloadType: 'notification',
  payload: {
    message,
    severity,
    clientTime: new Date().toISOString()
  }
}); 