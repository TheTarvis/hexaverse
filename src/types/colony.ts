/**
 * Types for colony management - UI specific models
 */
import { Unit, UnplacedUnit } from './units';

// Basic colony tile type matching server model
export interface ColonyTile {
  id: string;
  q: number;  // Cube coordinate X
  r: number;  // Cube coordinate Y
  s: number;  // Cube coordinate Z
  type: string;
  controllerUid: string;  // Firebase user ID of the controller
  visibility: 'visible' | 'fogged' | 'unexplored'; // TODO TW: Discuss unexplored
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
  tiles?: ColonyTile[]; // Optional tiles array for when tiles are loaded
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