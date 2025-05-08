import { Tile } from '@/types/tiles';
import { HttpsCallableResult } from 'firebase/functions';
import { auth } from '@/config/firebase';
import { CACHE_TYPES } from '@/utils/tileCache';
import {
  AddTileRequest,
  AddTileResponse,
  FetchTilesByIdsRequest,
  FetchTilesByIdsResponse,
  TileCacheManager,
  handleTileAdditionError,
  createTileFunction
} from './TilesBaseService';

// Create cache manager instance
const drawingTileCacheManager = new TileCacheManager(CACHE_TYPES.DRAWING);

// Create callable function references
const addDrawingTileFunction = createTileFunction<AddTileRequest, AddTileResponse>('addDrawingTile');
const fetchAllDrawingTiles = createTileFunction<FetchTilesByIdsRequest, FetchTilesByIdsResponse>('fetchAllDrawingTiles');

/**
 * Clear all drawing tile cache entries
 * Use this when you want to completely reset the drawing tile cache
 */
export function clearAllDrawingTileCache(): void {
  drawingTileCacheManager.clearCache();
}

/**
 * Update the drawing tile cache with new tile data
 * @param tile Tile or array of tiles to update in the cache
 */
export function updateDrawingTileCache(tile: Tile): void;
export function updateDrawingTileCache(tiles: Tile[]): void;
export function updateDrawingTileCache(arg: Tile | Tile[]): void {
  drawingTileCacheManager.updateCache(arg);
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
    return handleTileAdditionError(error, coordinates, 'drawing');
  }
}

/**
 * Handle successful tile addition by updating cache
 */
function handleSuccessfulTileAddition(result: HttpsCallableResult<AddTileResponse>): void {
  console.log(`Added tile succeeded`);

  // Update the tile cache with the new data
  if (result.data.tile) {
    console.log(`Updating cache for tile: ${result.data.tile.id}`);
    updateDrawingTileCache(result.data.tile);
  }
}
