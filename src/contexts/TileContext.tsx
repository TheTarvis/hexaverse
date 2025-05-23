'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useColony } from '@/contexts/ColonyContext'
import { clearAllTileCache, fetchTiles, updateTileCache } from '@/services/tiles'
import { Tile, TileMap, toTileMap } from '@/types/tiles'
import { isTileMessage, WebSocketMessage } from '@/types/websocket'
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { findViewableTiles } from '@/utils/hexUtils'
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'
import { Colony } from '@/types/colony'
import { tileReducer, initialState, TileAction } from '@/reducers/tileReducer'
import { isOwnTileUpdate, isViewableTileUpdate, isOpponentTakingTile } from '@/utils/websocket/predicates'
import { handleOwnTile, handleViewableTile, handleOpponentTile, HandlerContext } from '@/utils/websocket/handlers'
import { useTileMessageBuffer } from '@/hooks/useTileMessageBuffer'

interface TileContextType {
  isLoadingTiles: boolean
  colonyTiles: TileMap
  viewableTiles: TileMap
  addColonyTile: (tile: Tile) => void
  removeColonyTile: (tile: Tile) => void
}

const TileContext = createContext<TileContextType | undefined>(undefined)

// Helper function to fetch and merge neighbors
async function fetchAndMergeNeighbors(
  tile: Tile,
  dispatch: React.Dispatch<TileAction>,
  colonyTiles: TileMap,
  viewableTiles: TileMap
) {
  try {
    // 1) Calculate placeholders for viewable neighbors
    const tilesMap = toTileMap([tile]);
    const placeholders = Object.fromEntries(
      Object.entries(findViewableTiles(tilesMap, 5))
        .filter(([id]) => !(id in colonyTiles) && !(id in viewableTiles))
    );
    
    if (!Object.keys(placeholders).length) return;

    // Update with placeholders
    dispatch({ type: 'LOAD_VIEWABLE_TILES', payload: { ...viewableTiles, ...placeholders } });

    // 2) Fetch actual data for the placeholders
    const fetchedNeighbors = await fetchTiles(Object.keys(placeholders));
    console.log(`Fetched ${fetchedNeighbors.length} newly viewable tiles`);
    dispatch({ type: 'MERGE_VIEWABLE_TILES', payload: fetchedNeighbors });
  } catch (error) {
    console.error('Error in fetchAndMergeNeighbors:', error);
  }
}

// Custom hook to manage colony tiles loading
function useColonyTiles(colony: Colony | null | undefined) {
  const [state, dispatch] = useReducer(tileReducer, {
    ...initialState,
    isDebugShowTiles: true // For development, can be set via configuration
  });

  useEffect(() => {
    if (!colony?.tileIds?.length) return;

    let canceled = false;
    (async () => {
      dispatch({ type: 'LOAD_START' });
      try {
        const tiles = await fetchTiles(colony.tileIds);
        if (canceled) return;
        
        console.log(`Loaded ${tiles.length} tiles for the colony`);
        dispatch({ type: 'LOAD_COLONY_TILES', payload: tiles });

        const initialView = findViewableTiles(toTileMap(tiles), 5);
        console.log(`Calculated ${Object.keys(initialView).length} initial viewable tiles.`);
        dispatch({ type: 'LOAD_VIEWABLE_TILES', payload: initialView });

        // Only proceed if there are viewable tiles to fetch
        if (Object.keys(initialView).length === 0) {
          dispatch({ type: 'LOAD_DONE' });
          return;
        }

        console.log(`Starting async fetch for ${Object.keys(initialView).length} viewable tiles...`);
        clearAllTileCache();
        const fetchedView = await fetchTiles(Object.keys(initialView));
        if (canceled) return;
        
        console.log(`Async fetch completed for ${fetchedView.length} viewable tiles.`);
        updateTileCache(fetchedView);
        dispatch({ type: 'MERGE_VIEWABLE_TILES', payload: fetchedView });
        dispatch({ type: 'LOAD_DONE' });
      } catch (error) {
        console.error('Error loading colony tiles:', error);
        if (!canceled) {
          dispatch({ type: 'LOAD_DONE' });
        }
      }
    })();

    return () => { canceled = true };
  }, [colony?.tileIds]);

  return { 
    state,
    dispatch
  };
}

export function TileProvider({ children }: { children: ReactNode }) {
  const { colony, fetchColonyColor } = useColony()
  const { user } = useAuth()
  
  // Use the extracted hook to manage colony tiles with reducer
  const { state, dispatch } = useColonyTiles(colony);
  const { isLoading: isLoadingTiles, colonyTiles, viewableTiles, isDebugShowTiles } = state;

  // Create stable refs for dispatcher and state to use in callbacks
  const dispatchRef = useRef(dispatch);
  const stateRef = useRef(state);

  // Update refs when values change
  useEffect(() => {
    dispatchRef.current = dispatch;
    stateRef.current = state;
  }, [dispatch, state]);

  // Callback to add a colony tile
  const addColonyTile = useCallback(
    (tile: Tile) => {
      // Add to colony tiles
      dispatch({ type: 'ADD_COLONY_TILE', payload: tile });

      // Fetch neighbors using the helper function
      fetchAndMergeNeighbors(
        tile,
        dispatch,
        colonyTiles,
        viewableTiles
      );
    },
    [colonyTiles, dispatch, viewableTiles]
  );

  // Callback to remove a colony tile
  const removeColonyTile = useCallback(
    (tile: Tile) => {
      // Remove the tile from colonyTiles and add to viewableTiles
      dispatch({ type: 'REMOVE_COLONY_TILE', payload: tile });

      // Fetch neighbors using the helper function
      const updatedColonyTiles = { ...colonyTiles };
      delete updatedColonyTiles[tile.id];
      
      fetchAndMergeNeighbors(
        tile,
        dispatch,
        updatedColonyTiles,
        viewableTiles
      );
    },
    [colonyTiles, dispatch, viewableTiles]
  );

  // Create handler context for the message handlers
  const handlerContext = useCallback((): HandlerContext => ({
    user,
    state: stateRef.current,
    addColonyTile,
    removeColonyTile,
    setViewableTiles: (updater) => {
      // Convert the updater function to a direct dispatch
      if (typeof updater === 'function') {
        const newViewableTiles = updater(stateRef.current.viewableTiles);
        dispatchRef.current({ type: 'LOAD_VIEWABLE_TILES', payload: newViewableTiles });
      } else {
        dispatchRef.current({ type: 'LOAD_VIEWABLE_TILES', payload: updater });
      }
    },
    fetchColonyColor
  }), [user, addColonyTile, removeColonyTile, fetchColonyColor]);

  // Function to process a batch of tile messages
  const processTileBatch = useCallback((tiles: Tile[]) => {
    // Update the tile cache for all tiles
    updateTileCache(tiles);
    
    // Process each tile through the handlers
    tiles.forEach(async (tile) => {
      const ctx = handlerContext();
      
      // Debug logging for tile processing
      console.log('Processing tile:', {
        tileId: tile.id,
        position: `${tile.q},${tile.r},${tile.s}`,
        controllerUid: tile.controllerUid,
        type: tile.type,
        resources: tile.resources
      });
      console.log('Current user:', user?.uid || 'Not logged in');
      console.log('Context state:', {
        colonyTilesCount: Object.keys(ctx.state.colonyTiles).length,
        viewableTilesCount: Object.keys(ctx.state.viewableTiles).length
      });
      
      // Create a dispatch table pattern for handlers
      const messageHandlers = [
        { match: () => isOwnTileUpdate(tile, user), run: () => handleOwnTile(tile, ctx) },
        { match: () => isOpponentTakingTile(tile, user, ctx.state), run: () => handleOpponentTile(tile, ctx) },
        { match: () => isViewableTileUpdate(tile, ctx.state), run: () => handleViewableTile(tile, ctx) },
      ];

      // Find the first matching handler and run it
      for (const { match, run } of messageHandlers) {
        if (match()) {
          await run();
          break;
        }
      }
    });
  }, [handlerContext, user]);

  // Use the message buffer hook to batch process incoming tile messages
  const bufferTileMessage = useTileMessageBuffer({
    bufferTimeMs: 100, // Buffer updates for 100ms
    onFlush: processTileBatch
  });

  // Handle WebSocket messages using the buffer
  const handleMessage = useCallback((data: WebSocketMessage) => {
    if (isTileMessage(data) && data.payload) {
      const tile = data.payload;
      console.log(`WebSocket: Received tile update for tile at ${tile.q},${tile.r},${tile.s}`);
      
      // Add the tile to the buffer instead of processing immediately
      bufferTileMessage(tile);
    }
  }, [bufferTileMessage]);

  // Subscribe to WebSocket messages for tile updates
  useWebSocketSubscription({
    onMessage: handleMessage
  });

  const value = {
    isLoadingTiles,
    colonyTiles,
    viewableTiles,
    addColonyTile,
    removeColonyTile,
  };

  return <TileContext.Provider value={value}>{children}</TileContext.Provider>
}

export function useTiles() {
  const context = useContext(TileContext)
  if (context === undefined) {
    throw new Error('useTiles must be used within a TileProvider')
  }
  return context
}
