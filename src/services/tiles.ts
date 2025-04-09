import { ColonyTile } from '@/types/colony';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Initialize Firebase Functions
const functions = getFunctions();

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
    // Call the Firebase function
    const result = await addTileFunction({ q, r, s });
    
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