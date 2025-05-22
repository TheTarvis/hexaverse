/**
 * WebSocket Message Types
 * 
 * This file defines the types and interfaces for WebSocket communication
 * between client and server.
 */

import { Tile } from '@/types/tiles';
import { Colony } from '@/types/colony';
import { Unit } from '@/types/units';

export interface WebSocketMessage<T = any> {}

// Base type for all WebSocket messages
export interface ColonyWebSocketMessage<T = any> extends WebSocketMessage{
  type: string;
  timestamp: number;
  userId: string;
  colonyId?: string;
  payloadType: PayloadType;
  payload: T;
}

export interface DrawingEventsWebsocketMessage<T = any> extends Tile, WebSocketMessage {}

// Available payload types
export type PayloadType = 'tile' | 'colony' | 'unit' | 'building' | 'event' | 'notification';

// For tile payloads, use the existing Tile type
export type TilePayload = Tile;

// For colony payloads, use the existing Colony type
export type ColonyPayload = Colony;

// Simple ping/pong message for connection testing
export interface PingPongMessage {
  type: 'ping' | 'pong';
  timestamp: number;
  data?: any;
}

export const createPingMessage = (): PingPongMessage => ({
  type: 'ping',
  timestamp: Date.now()
});

// Type guard functions
export const isTileMessage = (
  message: ColonyWebSocketMessage
): message is ColonyWebSocketMessage<TilePayload> => {
  return message.payloadType === 'tile';
};

export const isColonyMessage = (
  message: ColonyWebSocketMessage
): message is ColonyWebSocketMessage<ColonyPayload> => {
  return message.payloadType === 'colony';
};
