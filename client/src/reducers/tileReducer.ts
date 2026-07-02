import { Tile, TileMap, toTileMap } from '@/types/tiles';

// State interface for the tile reducer
export interface ColonyTilesState {
  isLoading: boolean;
  colonyTiles: TileMap;
  viewableTiles: TileMap;
  isDebugShowTiles: boolean;
}

// Initial state
export const initialState: ColonyTilesState = {
  isLoading: false,
  colonyTiles: {},
  viewableTiles: {},
  isDebugShowTiles: false, // Default to false, can be overridden
};

// Action types
export type TileAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_COLONY_TILES'; payload: Tile[] }
  | { type: 'LOAD_VIEWABLE_TILES'; payload: TileMap }
  | { type: 'MERGE_VIEWABLE_TILES'; payload: Tile[] }
  | { type: 'ADD_COLONY_TILE'; payload: Tile }
  | { type: 'REMOVE_COLONY_TILE'; payload: Tile }
  | { type: 'UPDATE_VIEWABLE_TILE'; payload: Tile }
  | { type: 'BATCH_UPDATE_TILES'; payload: Tile[] }
  | { type: 'LOAD_DONE' }
  | { type: 'SET_DEBUG_MODE'; payload: boolean };

// Reducer function
export function tileReducer(state: ColonyTilesState, action: TileAction): ColonyTilesState {
  switch (action.type) {
    case 'LOAD_START':
      return {
        ...state,
        isLoading: true,
      };
      
    case 'LOAD_COLONY_TILES':
      return {
        ...state,
        colonyTiles: toTileMap(action.payload),
      };
      
    case 'LOAD_VIEWABLE_TILES':
      return {
        ...state,
        viewableTiles: action.payload,
      };
      
    case 'MERGE_VIEWABLE_TILES':
      return {
        ...state,
        viewableTiles: {
          ...state.viewableTiles,
          ...toTileMap(action.payload),
        },
      };
      
    case 'ADD_COLONY_TILE':
      return {
        ...state,
        colonyTiles: {
          ...state.colonyTiles,
          [action.payload.id]: action.payload,
        },
      };
      
    case 'REMOVE_COLONY_TILE': {
      // This is some voodoo js to automagically remove it from the set.
      const { [action.payload.id]: removedTile, ...remainingTiles } = state.colonyTiles;
      return {
        ...state,
        colonyTiles: remainingTiles,
        viewableTiles: {
          ...state.viewableTiles,
          [action.payload.id]: action.payload,
        },
      };
    }
      
    case 'UPDATE_VIEWABLE_TILE':
      return {
        ...state,
        viewableTiles: {
          ...state.viewableTiles,
          [action.payload.id]: action.payload,
        },
      };
      
    case 'BATCH_UPDATE_TILES': {
      // Process batch of tiles - first group by whether they're in colony or viewable
      const updates = action.payload.reduce((acc, tile) => {
        if (state.colonyTiles[tile.id]) {
          acc.colonyUpdates[tile.id] = tile;
        } else {
          acc.viewableUpdates[tile.id] = tile;
        }
        return acc;
      }, { colonyUpdates: {} as TileMap, viewableUpdates: {} as TileMap });
      
      return {
        ...state,
        colonyTiles: {
          ...state.colonyTiles,
          ...updates.colonyUpdates,
        },
        viewableTiles: {
          ...state.viewableTiles,
          ...updates.viewableUpdates,
        },
      };
    }
      
    case 'LOAD_DONE':
      return {
        ...state,
        isLoading: false,
      };
      
    case 'SET_DEBUG_MODE':
      return {
        ...state,
        isDebugShowTiles: action.payload,
      };
      
    default:
      return state;
  }
} 