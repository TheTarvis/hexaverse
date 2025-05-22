import { Tile } from '@/types/tiles';
import { getFromCache, saveToCache, clearCacheByPrefix, DEFAULT_CACHE_EXPIRY } from './cacheUtils';

/**
 * Cache type constants to differentiate between different tile types
 */
export const CACHE_TYPES = {
  COLONY: 'colony',
  DRAWING: 'drawing'
};

/**
 * Get a tile from cache by ID
 * @param tileId Tile ID
 * @param type Cache type (colony or drawing)
 * @param expiryTime Optional expiry time in ms
 * @returns Tile object or null if not found
 */
export function getTileFromCache(tileId: string, type: string, expiryTime?: number): Tile | null {
  return getFromCache<Tile>(`tile_${tileId}`, type, expiryTime);
}

/**
 * Save a tile to cache
 * @param tile Tile to save
 * @param type Cache type (colony or drawing)
 * @param expiryTime Optional expiry time in ms
 */
export function saveTileToCache(tile: Tile, type: string, expiryTime?: number): void {
  if (tile?.id) {
    saveToCache(`tile_${tile.id}`, type, tile);
  }
}

/**
 * Get tiles from cache by batch ID
 * @param tileIds Array of tile IDs
 * @param type Cache type (colony or drawing)
 * @param expiryTime Optional expiry time in ms
 * @returns Array of tiles found in cache
 */
export function getTilesFromCache(tileIds: string[], type: string, expiryTime?: number): { 
  foundTiles: Tile[]; 
  missingTileIds: string[];
} {
  const foundTiles: Tile[] = [];
  const missingTileIds: string[] = [];

  if (typeof window === 'undefined') {
    return { foundTiles: [], missingTileIds: tileIds };
  }

  tileIds.forEach(id => {
    const cachedTile = getTileFromCache(id, type, expiryTime);
    if (cachedTile) {
      foundTiles.push(cachedTile);
    } else {
      missingTileIds.push(id);
    }
  });

  return { foundTiles, missingTileIds };
}

/**
 * Update the tile cache with new tile data
 * @param arg Tile or array of tiles to update in the cache
 * @param type Cache type (colony or drawing)
 * @param expiryTime Optional expiry time in ms
 * @returns Number of tiles updated
 */
export function updateTileCache(arg: Tile | Tile[], type: string, expiryTime?: number): number {
  if (typeof window === 'undefined') return 0;
  
  const tilesToUpdate = Array.isArray(arg) ? arg : [arg];
  
  if (tilesToUpdate.length === 0) return 0;
  
  let updatedCount = 0;
  
  tilesToUpdate.forEach(tile => {
    if (tile?.id) {
      saveTileToCache(tile, type, expiryTime);
      updatedCount++;
    }
  });
  
  return updatedCount;
}

/**
 * Clear all tile cache entries for a specific type
 * @param type Cache type (colony or drawing)
 * @returns Number of cleared cache entries
 */
export function clearTileCache(type: string): number {
  return clearCacheByPrefix(`${type}_tile_`);
}

/**
 * Get combined cache key for batch operations
 * @param tileIds Array of tile IDs
 * @param type Cache type (colony or drawing)
 * @returns Cache key for the batch
 */
export function getTilesBatchCacheKey(tileIds: string[], type: string): string {
  return `${type}_tiles_${tileIds.sort().join('_')}`;
} 