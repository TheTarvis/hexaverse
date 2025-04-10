/**
 * Types for colony management - UI specific models
 */
import { Unit, UnplacedUnit } from './units';
import { Tile } from './tiles';

// Colony data structure
export interface Colony {
  id: string;
  uid: string;  // Firebase user ID
  name: string;
  color?: string; // Colony color for visual identification
  createdAt: Date | number;
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tileIds: string[]; // References to tiles in the 'tiles' collection
  tiles?: Tile[]; // Optional tiles array for when tiles are loaded
  units: Unit[];
  unplacedUnits: UnplacedUnit[];
  // Territory metrics
  territoryScore: number;
  visibilityRadius: number;
}

// Colony creation request type
export interface CreateColonyRequest {
  name: string;
  color?: string; // Colony color for visual identification
  uid: string;
}

// Colony creation response type
export interface CreateColonyResponse {
  id: string;
  uid: string;  // Firebase user ID
  name: string;
  color?: string; // Colony color for visual identification
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tileIds: string[]; // References to tiles in the 'tiles' collection
  tiles: Tile[]; // Include full tile data in response for initial setup
  units: Unit[];
  unplacedUnits: UnplacedUnit[];
  territoryScore: number;
  visibilityRadius: number;
} 