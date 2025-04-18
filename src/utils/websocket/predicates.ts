import { Tile } from '@/types/tiles';
import { User } from 'firebase/auth';

// State interface representing the relevant parts of TileContext state
export interface TileState {
  colonyTiles: { [key: string]: Tile };
  viewableTiles: { [key: string]: Tile };
  isDebugShowTiles?: boolean;
}

/**
 * Checks if the tile update is for a tile owned by the current user
 */
export const isOwnTileUpdate = (tile: Tile, user: User | null) =>
  user && tile.controllerUid === user.uid;

/**
 * Checks if the tile update is for a tile that's in the viewable area
 * or if we're in debug mode showing all tiles
 */
export const isViewableTileUpdate = (tile: Tile, state: TileState) =>
  Boolean(state.viewableTiles[tile.id] || state.isDebugShowTiles);

/**
 * Checks if the tile update is for a tile that was previously owned by the user
 * but is now being taken by an opponent
 */
export const isOpponentTakingTile = (tile: Tile, user: User | null, state: TileState) =>
  user && tile.controllerUid && tile.controllerUid !== user.uid && Boolean(state.colonyTiles[tile.id]); 