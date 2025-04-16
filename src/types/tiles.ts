/**
 * Types for tile management - UI specific models
 */

// Basic tile type matching server model
export interface Tile {
  id: string;
  q: number;  // Cube coordinate X
  r: number;  // Cube coordinate Y
  s: number;  // Cube coordinate Z
  type: string;
  controllerUid: string;  // Firebase user ID of the controller
  visibility: 'visible' | 'unexplored'; // TODO TW: Discuss unexplored
  resourceDensity?: number; // Value from 0-1 indicating resource richness
  resources?: {
    [key: string]: number;
  };
  color?: string;  // Color for rendering, used by UI only
} 