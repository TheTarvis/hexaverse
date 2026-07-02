import { Tile, TileMap, toTileMap } from '@/types/tiles';
import { updateTileCache } from '@/services/colony/ColonyTilesService';
import { removeColonyCacheWithTile } from '@/services/colony/colony';
import { User } from 'firebase/auth';
import { ColonyTilesState } from './predicates';
import logger from '@/utils/logger';

// Handler context interface - these are the dependencies needed by handlers
export interface HandlerContext {
  user: User | null;
  state: ColonyTilesState;
  addColonyTile: (tile: Tile) => void;
  removeColonyTile: (tile: Tile) => void;
  setViewableTiles: React.Dispatch<React.SetStateAction<TileMap>>;
  fetchColonyColor: (uid: string) => Promise<string | null>;
}

/**
 * Handle a tile update for a tile owned by the current user
 */
export async function handleOwnTile(tile: Tile, ctx: HandlerContext) {
  logger.debug(`WebSocket: Handling own tile update at ${tile.q},${tile.r},${tile.s}`);
  updateTileCache(tile);
  ctx.addColonyTile(tile);
}

/**
 * Handle a tile update for a tile in the viewable area
 */
export function handleViewableTile(tile: Tile, ctx: HandlerContext) {
  logger.debug(`WebSocket: Handling viewable tile update at ${tile.q},${tile.r},${tile.s}`);
  updateTileCache(tile);
  
  ctx.setViewableTiles((prev) => ({
    ...prev,
    ...toTileMap([tile]),
  }));
}

/**
 * Handle a tile update for a tile being taken by an opponent
 */
export async function handleOpponentTile(tile: Tile, ctx: HandlerContext) {
  logger.debug(`WebSocket: Handling opponent taking tile at ${tile.q},${tile.r},${tile.s}`);
  updateTileCache(tile);
  
  // Remove the tile from our colony
  ctx.removeColonyTile(tile);
  
  // Update the cache without updating colony state directly
  // This avoids triggering a colony state change which causes grid reloading
  if (ctx.user && ctx.user.uid) {
    await removeColonyCacheWithTile(ctx.user.uid, tile.id);
  }
  
  // Get the colony color of the new controller
  if (tile.controllerUid) {
    await ctx.fetchColonyColor(tile.controllerUid);
  }
} 