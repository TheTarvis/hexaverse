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
  tiles: ColonyTile[];
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
  name: string;
  startCoordinates: {
    q: number;
    r: number;
    s: number;
  };
  tiles: ColonyTile[];
  units: Unit[];
  unplacedUnits: UnplacedUnit[];
  territoryScore: number;
  visibilityRadius: number;
} 