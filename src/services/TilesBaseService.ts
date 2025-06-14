import { Tile } from '@/types/tiles';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import { 
  updateTileCache as updateCacheTiles,
  clearTileCache,
  getTilesFromCache,
  getAllTilesFromCache,
  CACHE_TYPES
} from '@/utils/tileCache';
import { DEFAULT_CACHE_EXPIRY } from '@/utils/cacheUtils';
import logger from '@/utils/logger';

// Common Types
export interface AddTileRequest {
  q: number;
  r: number; 
  s: number;
  color?: string;
  warmup?: boolean;
}

export interface AddTileResponse {
  success: boolean;
  tile?: Tile;
  message?: string;
  captured?: boolean;
  previousOwner?: string;
  previousColony?: string;
}

export interface FetchTilesByIdsRequest {
  tileIds: string[];
}

export interface FetchTilesByIdsResponse {
  success: boolean;
  tiles: Tile[];
  count: number;
}

/**
 * Base class for tile cache management utilities
 */
export class TileCacheManager {
  constructor(
    private cacheType: string,
    private expiryTime: number = DEFAULT_CACHE_EXPIRY
  ) {}

  /**
   * Clear all tile cache entries for this cache type
   */
  clearCache(): void {
    const clearedCount = clearTileCache(this.cacheType);
    if (clearedCount > 0) {
      logger.debug(`Cleared ${clearedCount} ${this.cacheType} tile cache entries`);
    }
  }

  /**
   * Update the tile cache with new tile data
   * @param arg Tile or array of tiles to update in the cache
   */
  updateCache(arg: Tile | Tile[]): void {
    const updatedCount = updateCacheTiles(arg, this.cacheType, this.expiryTime);
    if (updatedCount > 0) {
      logger.debug(`Updated cache for ${updatedCount} ${this.cacheType} tiles`);
    }
  }

  /**
   * Fetch tiles from cache
   * @param tileIds Array of tile IDs to fetch
   * @returns Object containing found tiles and missing tile IDs
   */
  getTilesFromCache(tileIds: string[]) {
    return getTilesFromCache(tileIds, this.cacheType, this.expiryTime);
  }

  /**
   * Get all tiles from cache for this cache type
   * @returns Array of all tiles in cache
   */
  getAllFromCache(): Tile[] {
    return getAllTilesFromCache(this.cacheType, this.expiryTime);
  }
}

/**
 * Helper for handling tile addition errors
 * @param error The error object
 * @param coordinates The tile coordinates
 * @param serviceType Type of service for logging
 * @returns Standardized error response
 */
export function handleTileAdditionError(
  error: any, 
  coordinates: AddTileRequest, 
  serviceType: string
): AddTileResponse {
  const { q, r, s } = coordinates;
  logger.error(`Error adding ${serviceType} tile at [${q},${r},${s}]:`, error);
  
  // Parse the Firebase callable function error
  const errorCode = error.code || 'unknown';
  const errorMessage = error.message || `Unknown error adding ${serviceType} tile`;
  
  return {
    success: false,
    message: `Error (${errorCode}): ${errorMessage}`
  };
}

/**
 * Create Firebase callable function reference
 */
export function createTileFunction<T, R>(functionName: string) {
  return httpsCallable<T, R>(functions, functionName);
} 