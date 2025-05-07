import { Tile } from '@/types/tiles';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { invalidateColonyCache, updateColonyCacheWithNewTile } from './colony/colony';
import { auth, functions } from '@/config/firebase';

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
const addDrawingTileFunction = httpsCallable<AddTileRequest, AddTileResponse>(
  functions, 
  'addDrawingTile'
);

const fetchDrawingTilesByIdsFunction = httpsCallable<FetchTilesByIdsRequest, FetchTilesByIdsResponse>(
  functions,
  'fetchDrawingTilesByIds'
);

/**
 * Clear all tile cache entries
 * Use this when you want to completely reset the tile cache
 */
export function clearAllDrawingTileCache(): void {
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
export function updateDrawingTileCache(tile: Tile): void;
export function updateDrawingTileCache(tiles: Tile[]): void;
export function updateDrawingTileCache(arg: Tile | Tile[]): void {
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
export async function addDrawingTile(
  q: number, 
  r: number, 
  s: number
): Promise<AddTileResponse> {
  const coordinates = { q, r, s };
  
  try {
    console.log(`Sending addTile request for coords: q=${q}, r=${r}, s=${s}`);
    
    // Call the Firebase function
    const result = await addDrawingTileFunction(coordinates);
    
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

  // Update the tile cache with the new data
  if (result.data.tile) {
    console.log(`Updating cache for tile: ${result.data.tile.id}`);
    updateDrawingTileCache(result.data.tile);
    
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
