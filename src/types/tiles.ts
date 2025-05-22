/**
 * Types for tile management - UI specific models
 */

// Basic tile type matching server model
export interface Tile {
  id: string;
  q: number;  // Cube coordinate X
  r: number;  // Cube coordinate Y
  s: number;  // Cube coordinate Z
  controllerUid: string;  // Firebase user ID of the controller
  color?: string;  // Color for rendering, used by UI only
  updatedAt: string;  // ISO timestamp of last update
}

export interface ColonyTile extends Tile {
  type: string;
  visibility: 'visible' | 'unexplored'; // TODO TW: Discuss unexplored
  resourceDensity: number; // Value from 0-1 indicating resource richness
  resources?: {
    [key: string]: number;
  };
}

export interface TileMap {
  [key: string]: Tile;
}

export function toTileMap(tiles: Tile[]): TileMap {
  return tiles.reduce<TileMap>((map, tile) => {
    map[tile.id] = tile;
    return map;
  }, {});
}