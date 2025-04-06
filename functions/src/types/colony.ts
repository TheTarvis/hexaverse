/**
 * Types for colony management - shared between web app and Firebase functions
 */

// Basic colony tile type matching server model
export interface ColonyTile {
  id: string;
  q: number;  // Cube coordinate X
  r: number;  // Cube coordinate Y
  s: number;  // Cube coordinate Z
  type: string;
  resources?: {
    [key: string]: number;
  };
  buildings?: {
    id: string;
    type: string;
    level: number;
  }[];
}

// Colony data structure
export interface Colony {
  id: string;
  uid: string;  // Firebase user ID
  name: string;
  createdAt: Date | number;
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tiles: ColonyTile[];
}

// Colony creation request type
export interface CreateColonyRequest {
  name: string;
  uid: string;
}

// Colony creation response type
export interface CreateColonyResponse {
  id: string;
  name: string;
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tiles: ColonyTile[];
} 