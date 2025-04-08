/**
 * Types for colony management - shared between web app and Firebase functions
 */
import { Unit, UnplacedUnit } from './units';
import { TileType } from '../utils/noise';

// Basic colony tile type matching server model
export interface ColonyTile {
  id: string;
  q: number;
  r: number;  
  s: number;  
  type: TileType; // Tile type based on noise value
  controllerUid: string;  // Firebase user ID of the controller
  visibility: 'visible' | 'fogged' | 'unexplored';
  resourceDensity?: number; // Value from 0-1 indicating resource richness
  resources?: {
    [key: string]: number;
  };
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
  tileIds: string[]; // References to tiles in the 'tiles' collection
  units: Unit[];
  unplacedUnits: UnplacedUnit[];
  // Territory metrics
  territoryScore: number;
  visibilityRadius: number;
}

// Colony creation request type
export interface CreateColonyRequest {
  name: string;
  uid: string;
}

// Colony creation response type
export interface CreateColonyResponse {
  id: string;
  uid: string;  // Firebase user ID
  name: string;
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tileIds: string[]; // References to tiles in the 'tiles' collection
  tiles: ColonyTile[]; // Include full tile data in response for initial setup
  units: Unit[];
  unplacedUnits: UnplacedUnit[];
  territoryScore: number;
  visibilityRadius: number;
} 