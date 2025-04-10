import { ColonyTile } from '@/types/colony';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { invalidateColonyCache } from './colony';
import { auth, functions } from '@/config/firebase';

// Types
export interface AddTileRequest {
  q: number;
  r: number; 
  s: number;
}

export interface AddTileResponse {
  success: boolean;
  tile?: ColonyTile;
  message?: string;
  captured?: boolean;
  previousOwner?: string;
  previousColony?: string;
}

// Create a callable function reference
const addTileFunction = httpsCallable<AddTileRequest, AddTileResponse>(
  functions, 
  'addTile'
);

/**
 * Invalidate tile cache for specific tile IDs
 * Use this when tile data changes from server-side events
 * @param tileIds IDs of tiles to invalidate
 */
export function invalidateTileCache(tileIds: string[]): void {
  if (typeof window === 'undefined' || !tileIds.length) return;
  
  try {
    // Since we don't know all the exact cache keys (which depend on combinations),
    // iterate through localStorage keys and clear any that contain these tile IDs
    const keys: string[] = [];
    
    // Get all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tiles_')) {
        keys.push(key);
      }
    }
    
    // Check if any keys contain the tile IDs to invalidate
    const sortedTileIds = tileIds.sort();
    const keysToRemove = keys.filter(key => {
      // Check if this key contains any of the tile IDs we want to invalidate
      return sortedTileIds.some(tileId => key.includes(tileId));
    });
    
    // Remove the keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`Invalidated ${keysToRemove.length} tile cache entries`);
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
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  
  console.log(`Added tile succeeded, invalidating cache for user: ${currentUser.uid}`);
  
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
  
  // Invalidate current user's colony cache
  invalidateColonyCache(currentUser.uid);
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