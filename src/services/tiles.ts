import { Tile } from '@/types/tiles';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { invalidateColonyCache } from './colony';
import { auth, functions, firestore } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';

// Types
export interface AddTileRequest {
  q: number;
  r: number; 
  s: number;
}

export interface AddTileResponse {
  success: boolean;
  tile?: Tile;
  message?: string;
  captured?: boolean;
  previousOwner?: string;
  previousColony?: string;
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

// Create a callable function reference
const addTileFunction = httpsCallable<AddTileRequest, AddTileResponse>(
  functions, 
  'addTile'
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

  // Fetch missing tiles from Firestore
  try {
    let fetchedTiles: Tile[] = [];
    if (missingTileIds.length > 0) {
        console.log(`Fetching ${missingTileIds.length} tiles from Firestore...`);
        
        // Batch fetching logic
        const batchSize = 100; // Adjust batch size as needed
        for (let i = 0; i < missingTileIds.length; i += batchSize) {
            const batchIds = missingTileIds.slice(i, i + batchSize);
            console.log(`Fetching batch ${i / batchSize + 1} of ${Math.ceil(missingTileIds.length / batchSize)} (size: ${batchIds.length})`);
            const tileRefs = batchIds.map(id => doc(firestore, 'tiles', id));
            const tileSnapshots = await Promise.all(tileRefs.map(ref => getDoc(ref)));

            tileSnapshots.forEach(snapshot => {
                if (snapshot.exists()) {
                    fetchedTiles.push(snapshot.data() as Tile);
                } else {
                    // Tile doesn't exist in Firestore, create a default 'unexplored' representation
                    const tileId = snapshot.ref.id;
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
                            fetchedTiles.push(defaultTile);
                        } else {
                             console.warn(`Failed to parse coordinates from non-existent tile ID: ${tileId}`);
                        }
                    } else {
                         console.warn(`Invalid format for non-existent tile ID: ${tileId}`);
                    }
                }
            });
            
             // Optional small delay between batches if needed to avoid rate limits
             // await new Promise(resolve => setTimeout(resolve, 50)); 
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
 * Invalidate tile cache for specific tile IDs
 * Use this when tile data changes from server-side events
 * @param tileIds IDs of tiles to invalidate
 */
export function invalidateTileCache(tileIds: string[]): void;
export function invalidateTileCache(tiles: Tile[]): void;
export function invalidateTileCache(arg: string[] | Tile[]): void {
  if (typeof window === 'undefined') return;

  let tileIdsToInvalidate: string[];

  // Type guard to check if the argument is an array of Tiles
  if (arg.length > 0 && typeof arg[0] !== 'string') {
    // It's Tile[], extract the ids
    tileIdsToInvalidate = (arg as Tile[]).map(tile => tile.id);
  } else {
    // It's string[]
    tileIdsToInvalidate = arg as string[];
  }

  if (!tileIdsToInvalidate.length) return;

  try {
    let invalidatedCount = 0;
    
    // 1. Invalidate individual tile caches
    tileIdsToInvalidate.forEach(id => {
        const cacheKey = `tile_${id}`;
        if (localStorage.getItem(cacheKey) !== null) {
             localStorage.removeItem(cacheKey);
             invalidatedCount++;
        }
    });
     if (invalidatedCount > 0) {
        console.log(`Invalidated ${invalidatedCount} individual tile cache entries.`);
     }

    // 2. Invalidate combined tile caches containing these IDs (existing logic)
    const combinedKeysToRemove: string[] = [];
    const keysToCheck: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Check only keys starting with the old combined pattern
      if (key && key.startsWith('tiles_') && !key.startsWith('tile_')) { 
        keysToCheck.push(key);
      }
    }

    const sortedIdsToInvalidate = tileIdsToInvalidate.sort();
    keysToCheck.forEach(key => {
      // Check if the combined key contains any of the IDs to invalidate
      const containsInvalidId = sortedIdsToInvalidate.some(tileId => key.includes(tileId));
      if (containsInvalidId) {
        combinedKeysToRemove.push(key);
      }
    });

    combinedKeysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    if (combinedKeysToRemove.length > 0) {
      console.log(`Invalidated ${combinedKeysToRemove.length} combined tile cache entries.`);
    }

  } catch (error) {
    console.warn('Error invalidating tile cache:', error);
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

  // If we captured a tile from another colony, invalidate that colony's cache too
  if (result.data.captured && result.data.previousColony) {
    console.log(`Captured tile from colony: ${result.data.previousColony}, invalidating its cache`);
    invalidateColonyCache(result.data.previousColony);
  }

  // Invalidate the specific tile's cache if available
  if (result.data.tile?.id) {
    console.log(`Invalidating cache for tile: ${result.data.tile.id}`);
    invalidateTileCache([result.data.tile.id]);
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