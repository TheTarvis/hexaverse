import { Tile } from '@/types/tiles';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { invalidateColonyCache, fetchUserColony, updateColonyCacheWithNewTile } from './colony';
import { auth, functions, firestore } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// Types
export interface AddTileRequest {
  q: number;
  r: number; 
  s: number;
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

// Cache configuration
const TILES_CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes in milliseconds

// Cache keys
const getTilesCacheKey = (tileIds: string[]) => `tiles_${tileIds.sort().join('_')}`;

/**
 * Get from cache helper
 */
function getFromCache<T>(key: string, expiryTime: number): T | null {
  try {
    const cachedItem = localStorage.getItem(key);
    if (!cachedItem) return null;
    
    const { data, timestamp } = JSON.parse(cachedItem);
    const now = Date.now();
    
    if (now - timestamp > expiryTime) {
      // Cache expired
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn('Error reading from cache:', error);
    return null;
  }
}

/**
 * Save to cache helper
 */
function saveToCache<T>(key: string, data: T): void {
  try {
    const cacheItem = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheItem));
  } catch (error) {
    console.warn('Error saving to cache:', error);
  }
}

// Create callable function references
const addTileFunction = httpsCallable<AddTileRequest, AddTileResponse>(
  functions, 
  'addTile'
);

const fetchTilesByIdsFunction = httpsCallable<FetchTilesByIdsRequest, FetchTilesByIdsResponse>(
  functions,
  'fetchTilesByIds'
);

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

  const foundTiles: Tile[] = [];
  const missingTileIds: string[] = [];

  // Check cache for individual tiles if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    tileIds.forEach(id => {
      const cacheKey = `tile_${id}`; // Individual cache key
      const cachedTile = getFromCache<Tile>(cacheKey, TILES_CACHE_EXPIRY);
      if (cachedTile) {
        foundTiles.push(cachedTile);
      } else {
        missingTileIds.push(id);
      }
    });

    console.log(`Found ${foundTiles.length} tiles in individual cache. Missing ${missingTileIds.length}.`);

    // If all tiles were found in cache, return them
    if (missingTileIds.length === 0) {
      return foundTiles;
    }
  } else {
    // If forcing refresh, all IDs are considered missing
    missingTileIds.push(...tileIds);
  }

  // Fetch missing tiles from Cloud Function
  try {
    let fetchedTiles: Tile[] = [];
    
    if (missingTileIds.length > 0) {
      console.log(`Fetching ${missingTileIds.length} tiles using fetchTilesByIds cloud function...`);
      
      // Call the cloud function with all missing tile IDs
      const result = await fetchTilesByIdsFunction({ tileIds: missingTileIds });
      
      if (result.data.success) {
        // Add the fetched tiles
        const fetchedExistingTiles = result.data.tiles;
        
        // Process the response
        console.log(`Received ${fetchedExistingTiles.length} tiles from server, ${missingTileIds.length - fetchedExistingTiles.length} not found`);
        
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
                  type: "", // Or perhaps a specific 'unexplored' type?
                  visibility: 'unexplored',
                  resourceDensity: 0,
                  // Add other required Tile fields with default values if necessary
                  // resources: {}
                };
                fetchedExistingTiles.push(defaultTile);
              } else {
                console.warn(`Failed to parse coordinates from non-existent tile ID: ${tileId}`);
              }
            } else {
              console.warn(`Invalid format for non-existent tile ID: ${tileId}`);
            }
          }
        });
        
        fetchedTiles = fetchedExistingTiles;
      } else {
        console.error('Error fetching tiles:', result.data);
      }
      
      // Cache the newly fetched tiles individually
      if (typeof window !== 'undefined') {
        fetchedTiles.forEach(tile => {
          const cacheKey = `tile_${tile.id}`;
          saveToCache(cacheKey, tile);
        });
        console.log(`Cached ${fetchedTiles.length} individual tiles.`);
      }
    }

    // Combine cached and newly fetched tiles
    const allTiles = [...foundTiles, ...fetchedTiles];
    
    // Optional: Update the combined cache key as well for potential future optimizations?
    // For now, we rely purely on individual caches primarily.
    // if (typeof window !== 'undefined' && allTiles.length > 0) {
    //   const combinedCacheKey = getTilesCacheKey(tileIds); // Original combined key
    //   saveToCache(combinedCacheKey, allTiles);
    // }

    return allTiles;

  } catch (error) {
    console.error('Error fetching missing tiles:', error);
    // Return whatever we found in the cache, or empty array if refresh was forced/error occurred early
    return foundTiles; 
  }
}

/**
 * Clear all tile cache entries
 * Use this when you want to completely reset the tile cache
 */
export function clearAllTileCache(): void {
  if (typeof window === 'undefined') return;

  try {
    let clearedCount = 0;
    const keysToRemove: string[] = [];
    
    // Find all tile-related cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('tile_') || key.startsWith('tiles_'))) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all found keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    
    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} tile cache entries`);
    }
  } catch (error) {
    console.warn('Error clearing tile cache:', error);
  }
}

/**
 * Update the tile cache with new tile data
 * @param tile Tile or array of tiles to update in the cache
 */
export function updateTileCache(tile: Tile): void;
export function updateTileCache(tiles: Tile[]): void;
export function updateTileCache(arg: Tile | Tile[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const tilesToUpdate = Array.isArray(arg) ? arg : [arg];
    
    if (tilesToUpdate.length === 0) return;
    
    let updatedCount = 0;
    
    tilesToUpdate.forEach(tile => {
      if (tile?.id) {
        const cacheKey = `tile_${tile.id}`;
        saveToCache(cacheKey, tile);
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      console.log(`Updated cache for ${updatedCount} tiles`);
    }
  } catch (error) {
    console.warn('Error updating tile cache:', error);
  }
}

/**
 * Add a tile to the user's colony
 * @param q Q coordinate (axial coordinate system)
 * @param r R coordinate (axial coordinate system)
 * @param s S coordinate (axial coordinate system)
 * @returns Object containing success status and the new tile if successful
 */
export async function addTile(
  q: number, 
  r: number, 
  s: number
): Promise<AddTileResponse> {
  const coordinates = { q, r, s };
  
  try {
    console.log(`Sending addTile request for coords: q=${q}, r=${r}, s=${s}`);
    
    // Call the Firebase function
    const result = await addTileFunction(coordinates);
    
    // Process successful response
    if (result.data.success) {
      handleSuccessfulTileAddition(result);
    } else {
      console.error('Add tile failed:', result.data.message);
    }
    
    return result.data;
  } catch (error: any) {
    return handleTileAdditionError(error, coordinates);
  }
}

/**
 * Handle successful tile addition by invalidating relevant caches
 */
function handleSuccessfulTileAddition(result: HttpsCallableResult<AddTileResponse>): void {
  console.log(`Added tile succeeded`);

  // Get the current user ID
  const uid = auth.currentUser?.uid;
  
  // If we captured a tile from another colony, invalidate that colony's cache too
  if (result.data.captured && result.data.previousColony) {
    console.log(`Captured tile from colony: ${result.data.previousColony}, invalidating its cache`);
    invalidateColonyCache(result.data.previousColony);
  }

  // Update the tile cache with the new data
  if (result.data.tile) {
    console.log(`Updating cache for tile: ${result.data.tile.id}`);
    updateTileCache(result.data.tile);
    
    // Update the colony cache with the new tile ID
    if (uid && typeof window !== 'undefined') {
      updateColonyCacheWithNewTile(uid, result.data.tile.id);
    }
  }
}

/**
 * Handle errors during tile addition
 */
function handleTileAdditionError(error: any, coordinates: AddTileRequest): AddTileResponse {
  const { q, r, s } = coordinates;
  console.error(`Error adding tile at [${q},${r},${s}]:`, error);
  
  // Parse the Firebase callable function error
  const errorCode = error.code || 'unknown';
  const errorMessage = error.message || 'Unknown error adding tile';
  
  return {
    success: false,
    message: `Error (${errorCode}): ${errorMessage}`
  };
}

/**
 * Makes a dummy call to warm up the addTile cloud function.
 * This call is designed to be fast and explicit about being a warmup request.
 * @returns A promise that resolves when the warmup call completes
 */
export async function warmupAddTile(): Promise<void> {
  try {
    // Make an explicit warmup call
    // @ts-expect-error TypeScript doesn't know we handle warmup-only requests
    await addTileFunction({ warmup: true });
    console.log('AddTile function warmed up');
  } catch (error) {
    // Log any unexpected errors during warmup
    console.error('Error warming up addTile function:', error);
  }
} 