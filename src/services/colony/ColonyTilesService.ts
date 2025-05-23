import { Tile } from '@/types/tiles';
import { HttpsCallableResult } from 'firebase/functions';
import { invalidateColonyCache, updateColonyCacheWithNewTile } from './colony';
import { auth } from '@/config/firebase';
import { makeWarmupable, createWarmupableRegistry } from '@/utils/functionUtils';
import { CACHE_TYPES } from '@/utils/tileCache';
import {
  AddTileRequest,
  AddTileResponse,
  FetchTilesByIdsRequest,
  FetchTilesByIdsResponse,
  TileCacheManager,
  handleTileAdditionError,
  createTileFunction
} from '../TilesBaseService';
import logger from '@/utils/logger';

// Create cache manager instance
const colonyTileCacheManager = new TileCacheManager(CACHE_TYPES.COLONY);

// Create callable function references
const addColonyTileFunction = createTileFunction<AddTileRequest, AddTileResponse>('addColonyTile');
const fetchColonyTilesByIdsFunction = createTileFunction<FetchTilesByIdsRequest, FetchTilesByIdsResponse>('fetchColonyTilesByIds');

/**
 * Fetch tiles by their IDs
 * @param tileIds - Array of tile IDs to fetch
 * @param options - Optional parameters for controlling fetch behavior
 * @returns Array of tile objects
 */
export async function fetchTiles(
  tileIds: string[],
  options?: {
    forceRefresh?: boolean;
  }
): Promise<Tile[]> {
  if (!tileIds.length) return [];

  let foundTiles: Tile[] = [];
  let missingTileIds: string[] = [];

  // Check cache for individual tiles if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    // Use the cache manager to get tiles
    const cacheResult = colonyTileCacheManager.getTilesFromCache(tileIds);
    foundTiles = cacheResult.foundTiles;
    missingTileIds = cacheResult.missingTileIds;

    logger.debug(`Found ${foundTiles.length} tiles in individual cache. Missing ${missingTileIds.length}.`);

    // If all tiles were found in cache, return them
    if (missingTileIds.length === 0) {
      return foundTiles;
    }
  } else {
    // If forcing refresh, all IDs are considered missing
    missingTileIds = [...tileIds];
  }

  // Fetch missing tiles from Cloud Function
  try {
    let fetchedTiles: Tile[] = [];
    
    if (missingTileIds.length > 0) {
      logger.debug(`Fetching ${missingTileIds.length} tiles using fetchTilesByIds cloud function...`);
      
      // Call the cloud function with all missing tile IDs
      const result = await fetchColonyTilesByIdsFunction({ tileIds: missingTileIds });
      
      if (result.data.success) {
        // Add the fetched tiles
        const fetchedExistingTiles = result.data.tiles;
        
        // Process the response
        logger.debug(`Received ${fetchedExistingTiles.length} tiles from server, ${missingTileIds.length - fetchedExistingTiles.length} not found`);
        
        // Keep track of what tiles were found
        const foundTileIds = new Set(fetchedExistingTiles.map(tile => tile.id));
        
        // For tiles that don't exist in Firestore, create default 'unexplored' representations
        missingTileIds.forEach(tileId => {
          if (!foundTileIds.has(tileId)) {
            // Create default tile
            const parts = tileId.split('#');
            if (parts.length === 3) {
              const q = parseInt(parts[0], 10);
              const r = parseInt(parts[1], 10);
              const s = parseInt(parts[2], 10);
              
              // Check if parsing was successful (q+r+s === 0 is a good sanity check)
              if (!isNaN(q) && !isNaN(r) && !isNaN(s) && q + r + s === 0) {
                const defaultTile: Tile = {
                  id: tileId,
                  q: q,
                  r: r,
                  s: s,
                  controllerUid: "",
                  updatedAt: new Date().toISOString()
                };
                fetchedExistingTiles.push(defaultTile);
              } else {
                logger.warn(`Failed to parse coordinates from non-existent tile ID: ${tileId}`);
              }
            } else {
              logger.warn(`Invalid format for non-existent tile ID: ${tileId}`);
            }
          }
        });
        
        fetchedTiles = fetchedExistingTiles;
      } else {
        logger.error('Error fetching tiles:', result.data);
      }
      
      // Cache the newly fetched tiles
      if (fetchedTiles.length > 0) {
        updateTileCache(fetchedTiles);
      }
    }

    // Combine cached and newly fetched tiles
    return [...foundTiles, ...fetchedTiles];

  } catch (error) {
    logger.error('Error fetching missing tiles:', error);
    // Return whatever we found in the cache, or empty array if refresh was forced/error occurred early
    return foundTiles; 
  }
}

/**
 * Clear all colony tile cache entries
 * Use this when you want to completely reset the colony tile cache
 */
export function clearAllTileCache(): void {
  colonyTileCacheManager.clearCache();
}

/**
 * Update the colony tile cache with new tile data
 * @param tile Tile or array of tiles to update in the cache
 */
export function updateTileCache(tile: Tile): void;
export function updateTileCache(tiles: Tile[]): void;
export function updateTileCache(arg: Tile | Tile[]): void {
  colonyTileCacheManager.updateCache(arg);
}

/**
 * Add a tile to the user's colony
 * @param q Q coordinate (axial coordinate system)
 * @param r R coordinate (axial coordinate system)
 * @param s S coordinate (axial coordinate system)
 * @returns Object containing success status and the new tile if successful
 */
export async function addColonyTile(
  q: number, 
  r: number, 
  s: number
): Promise<AddTileResponse> {
  const coordinates = { q, r, s };
  
  try {
    logger.debug(`Sending addColonyTile request for coords: q=${q}, r=${r}, s=${s}`);
    
    // Call the Firebase function
    const result = await addColonyTileFunction(coordinates);
    
    // Process successful response
    if (result.data.success) {
      handleSuccessfulTileAddition(result);
    } else {
      logger.error('Add colony tile failed:', result.data.message);
    }
    
    return result.data;
  } catch (error: any) {
    return handleTileAdditionError(error, coordinates, 'colony');
  }
}

/**
 * Handle successful tile addition by invalidating relevant caches
 */
function handleSuccessfulTileAddition(result: HttpsCallableResult<AddTileResponse>): void {
  logger.success(`Added colony tile succeeded`);

  // Get the current user ID
  const uid = auth.currentUser?.uid;
  
  // If we captured a tile from another colony, invalidate that colony's cache too
  if (result.data.captured && result.data.previousColony) {
    logger.info(`Captured tile from colony: ${result.data.previousColony}, invalidating its cache`);
    invalidateColonyCache(result.data.previousColony);
  }

  // Update the tile cache with the new data
  if (result.data.tile) {
    logger.debug(`Updating cache for tile: ${result.data.tile.id}`);
    updateTileCache(result.data.tile);
    
    // Update the colony cache with the new tile ID
    if (uid && typeof window !== 'undefined') {
      updateColonyCacheWithNewTile(uid, result.data.tile.id);
    }
  }
}

/**
 * Collection of warmupable cloud functions
 */
export const WarmupableFunctions = createWarmupableRegistry({
  addColonyTile: makeWarmupable('addColonyTile', addColonyTileFunction)
});

// Direct export of the warmup function
export const warmupAddColonyTile = WarmupableFunctions.addColonyTile.warmup;

// For backward compatibility - will be deprecated
export const addTile = addColonyTile;