import { Tile } from '@/types/tiles';
import { HttpsCallableResult } from 'firebase/functions';
import { auth } from '@/config/firebase';
import { CACHE_TYPES } from '@/utils/tileCache';
import { NO_EXPIRY } from '@/utils/cacheUtils';
import {
  AddTileRequest,
  AddTileResponse,
  FetchTilesByIdsRequest,
  FetchTilesByIdsResponse,
  TileCacheManager,
  handleTileAdditionError,
  createTileFunction
} from './TilesBaseService';

// Create cache manager instance with no expiry
const drawingTileCacheManager = new TileCacheManager(CACHE_TYPES.DRAWING, NO_EXPIRY);

// Create callable function references
const fetchAllDrawingTiles = createTileFunction<FetchTilesByIdsRequest, FetchTilesByIdsResponse>('fetchAllDrawingTiles');
const sendDrawingTileUpdate = createTileFunction<AddTileRequest, AddTileResponse>('sendDrawingTileUpdate');
const fetchDrawingTilesAfterTimestamp = createTileFunction<{ timestamp: string | null }, FetchTilesByIdsResponse>('fetchDrawingTilesAfterTimestamp');

/**
 * Generate a deterministic tile ID from coordinates
 */
function generateTileId(q: number, r: number, s: number): string {
  return `${q}#${r}#${s}`;
}

/**
 * Add a new drawing tile
 * @param params Drawing tile parameters
 * @returns AddTileResponse with success status and tile data
 */
export async function onUpdateDrawingTile(params: {
  q: number;
  r: number;
  s: number;
  color: string;
}): Promise<AddTileResponse> {
  console.log(`[DrawingTilesService] Adding tile at q=${params.q}, r=${params.r}, s=${params.s}`);
  const { q, r, s, color } = params;
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    console.error('User must be authenticated to add tiles');
    return {
      success: false,
      message: 'User must be authenticated to add tiles'
    };
  }

  try {
    // Generate tile ID and construct tile object
    const tileId = generateTileId(q, r, s);
    const now = new Date().toISOString();
    
    // Create a tile with only the required properties
    const newTile: Tile = {
      id: tileId,
      q,
      r,
      s,
      controllerUid: currentUser.uid,
      color,
      updatedAt: now
    };

    // Update local cache immediately for optimistic updates
    drawingTileCacheManager.updateCache(newTile);

    // Call cloud function to persist the tile
    const result = await sendDrawingTileUpdate({
      q,
      r,
      s,
      color
    });

    if (!result.data.success) {
      return {
        success: false,
        message: result.data.message || 'Failed to create drawing tile'
      };
    }

    return {
      success: true,
      tile: newTile
    };

  } catch (error) {
    return handleTileAdditionError(error, { q, r, s }, 'drawing');
  }
}

/**
 * Clear all drawing tile cache entries
 * Use this when you want to completely reset the drawing tile cache
 */
export function clearAllDrawingTileCache(): void {
  drawingTileCacheManager.clearCache();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('drawing_grid_last_updated_at_timestamp');
    console.log('[DrawingTilesService] Cleared drawing_grid_last_updated_at_timestamp from localStorage');
  }
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
 * Fetch tiles by their IDs from cache only
 * @param tileIds Array of tile IDs to fetch
 * @returns Array of tiles found in cache
 */
export function fetchAllTilesByIdWithCache(tileIds: string[]): Tile[] {
  if (!tileIds.length) return [];

  // Check cache only
  const { foundTiles } = drawingTileCacheManager.getTilesFromCache(tileIds);
  const foundCount = foundTiles.length;
  const missedCount = tileIds.length - foundCount;
  console.log(`[DrawingTilesService] Cache lookup: ${foundCount} hits, ${missedCount} misses`);
  
  return foundTiles;
}

/**
 * Get the last update timestamp from cache
 */
function getLastUpdateTimestamp(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('drawing_grid_last_updated_at_timestamp');
}

/**
 * Set the last update timestamp in cache
 */
function setLastUpdateTimestamp(timestamp: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('drawing_grid_last_updated_at_timestamp', timestamp);
}

/**
 * Update the local cache with a modified tile
 * @param tile The modified tile to cache
 */
export function updateLocalTileCache(tile: Tile): void {
  console.log(`[DrawingTilesService] Updating local cache for tile ${tile.id}`);
  drawingTileCacheManager.updateCache(tile);
}

/**
 * Update multiple tiles in the local cache
 * @param tiles Array of tiles to update
 */
export function updateLocalTileCacheMultiple(tiles: Tile[]): void {
  console.log(`[DrawingTilesService] Batch updating local cache with ${tiles.length} tiles`);
  drawingTileCacheManager.updateCache(tiles);
}

/**
 * Fetch all tiles that were updated since the last update
 * Uses a cached timestamp to determine what needs to be fetched
 * @returns Array of tiles
 */
export async function fetchAllTilesSinceLastUpdate(): Promise<Tile[]> {
  try {
    // Get last update timestamp from cache
    const lastUpdateTimestamp = getLastUpdateTimestamp();
    console.log(`[DrawingTilesService] Last update timestamp: ${lastUpdateTimestamp || 'none'}`);

    const result = await fetchDrawingTilesAfterTimestamp({ timestamp: lastUpdateTimestamp });
    
    if (!result.data.success) {
      console.error('[DrawingTilesService] Failed to fetch tiles since last update');
      return [];
    }

    const fetchedTiles = result.data.tiles;
    
    // Update cache with fetched tiles
    if (fetchedTiles.length > 0) {
      drawingTileCacheManager.updateCache(fetchedTiles);
      // Update the last update timestamp to now
      setLastUpdateTimestamp(new Date().toISOString());
    }

    console.log(`[DrawingTilesService] Fetched ${fetchedTiles.length} tiles since last update`);
    return fetchedTiles;
  } catch (error) {
    console.error('[DrawingTilesService] Error fetching tiles:', error);
    return [];
  }
}

// Track the last invocation time to prevent rapid repeated calls
let lastLoadInvocationTime = 0;
const DEBOUNCE_THRESHOLD = 500; // milliseconds

/**
 * Load drawing tiles for the grid
 * This function handles the initial loading of tiles and subsequent updates
 * @returns Array of tiles
 */
export async function onLoadDrawingTiles(): Promise<Tile[]> {
  try {
    // Debounce multiple rapid calls
    const now = Date.now();
    if (now - lastLoadInvocationTime < DEBOUNCE_THRESHOLD) {
      console.log('[DrawingTilesService] Debounced call to onLoadDrawingTiles');
      return [];
    }
    lastLoadInvocationTime = now;

    // Get last update timestamp from cache
    const lastUpdateTimestamp = getLastUpdateTimestamp();
    console.log(`[DrawingTilesService] Loading tiles since last update: ${lastUpdateTimestamp || 'none'}`);

    // Fetch tiles that have been updated since the last timestamp
    const result = await fetchDrawingTilesAfterTimestamp({ timestamp: lastUpdateTimestamp });
    
    if (!result.data.success) {
      console.error('[DrawingTilesService] Failed to fetch tiles since last update');
      return [];
    }

    const fetchedTiles = result.data.tiles;
    
    // Update cache with fetched tiles
    if (fetchedTiles.length > 0) {
      drawingTileCacheManager.updateCache(fetchedTiles);
      // Update the last update timestamp to now
      setLastUpdateTimestamp(new Date().toISOString());
    }

    console.log(`[DrawingTilesService] Loaded ${fetchedTiles.length} tiles since last update`);
    return fetchedTiles;
  } catch (error) {
    console.error('[DrawingTilesService] Error loading tiles:', error);
    return [];
  }
}

/**
 * Get all drawing tiles currently in cache
 * @returns Array of all tiles in the cache
 */
export function fetchAllDrawingTilesFromCache(): Tile[] {
  // Get all tiles from cache - this will return all cached tiles regardless of ID
  const allCachedTiles = drawingTileCacheManager.getAllFromCache();
  console.log(`[DrawingTilesService] Retrieved ${allCachedTiles.length} tiles from cache`);
  return allCachedTiles;
}
