import { ColonyTile } from '@/types/colony';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { invalidateColonyCache, invalidateTileCache } from './colony';

// Initialize Firebase Functions and Auth
const functions = getFunctions();
const auth = getAuth();

// Create a callable function reference
const addTileFunction = httpsCallable<
  { q: number, r: number, s: number },
  { 
    success: boolean; 
    tile?: ColonyTile; 
    message?: string; 
    captured?: boolean;
    previousOwner?: string;
    previousColony?: string;
  }
>(functions, 'addTile');

/**
 * Add a tile to the user's colony
 * @param q Q coordinate
 * @param r R coordinate
 * @param s S coordinate
 * @returns Object containing success status and the new tile if successful
 */
export async function addTile(q: number, r: number, s: number): Promise<{ 
  success: boolean; 
  tile?: ColonyTile; 
  message?: string;
  captured?: boolean;
}> {
  try {
    console.log(`Sending addTile request for coords: q=${q}, r=${r}, s=${s}`);
    
    // Call the Firebase function
    const result = await addTileFunction({ q, r, s });
    
    // If successful, invalidate the colony cache for the current user
    if (result.data.success) {
      if (auth.currentUser) {
        console.log(`Added tile succeeded, invalidating cache for user: ${auth.currentUser.uid}`);
        
        // Invalidate the colony cache to ensure fresh data on next fetch
        invalidateColonyCache(auth.currentUser.uid);
        
        // If we have a tile ID, invalidate that specific tile's cache
        if (result.data.tile?.id) {
          console.log(`Invalidating cache for tile: ${result.data.tile.id}`);
          invalidateTileCache([result.data.tile.id]);
        }
      } else {
        console.warn('Tile added but no current user to invalidate cache for');
      }
    } else {
      console.error('Add tile failed:', result.data.message);
    }
    
    // Return the result data
    return result.data;
  } catch (error: any) {
    console.error('Error adding tile to colony:', error);
    
    // Parse the Firebase callable function error
    const errorMessage = error.message || 'Unknown error adding tile';
    const errorCode = error.code || 'unknown';
    
    return {
      success: false,
      message: `Error (${errorCode}): ${errorMessage}`
    };
  }
} 