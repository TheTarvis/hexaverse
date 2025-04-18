'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useColony } from '@/contexts/ColonyContext'
import {fetchTiles, invalidateTileCache} from '@/services/tiles'
import { Tile, TileMap, toTileMap } from '@/types/tiles'
import { isTileMessage } from '@/types/websocket'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { findViewableTiles } from "@/utils/hexUtils";
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { WebSocketMessage } from '@/types/websocket';

interface TileContextType {
  isLoadingTiles: boolean
  colonyTiles: TileMap
  viewableTiles: TileMap
  addColonyTile: (tile: Tile) => void
  removeColonyTile: (tile: Tile) => void
}

const TileContext = createContext<TileContextType | undefined>(undefined)

export function TileProvider({ children }: { children: ReactNode }) {
  // TODO TW: Set is loading tiles at some point, not critical just UX
  const [isLoadingTiles, setIsLoadingTiles] = useState(false)
  const { colony } = useColony()
  const { user } = useAuth()
  const [colonyTiles, setColonyTiles] = useState<TileMap>({})
  const [viewableTiles, setViewableTiles] = useState<TileMap>({})

  const addColonyTile = useCallback((tile: Tile) => {
    // Add to colony tiles
    setColonyTiles((prev) => ({
      ...prev,
      ...toTileMap([tile]),
    }));

    //  Update viewable tiles off of tile change.
    let tilesMap = toTileMap([tile])
    let newlyViewableTiles: TileMap = Object.fromEntries(
        Object.entries(findViewableTiles(tilesMap, 5))
            .filter(([_, neighborTile]) => !(neighborTile.id in colonyTiles))
            .filter(([_, neighborTile]) => !(neighborTile.id in viewableTiles))
    );
    
    // Merge the newly found viewable tiles into the state
    setViewableTiles((prev) => {
      if (!prev && Object.keys(newlyViewableTiles).length === 0) return {};
      if (Object.keys(newlyViewableTiles).length === 0) return prev;
      
      return {
        ...prev,
        ...newlyViewableTiles,
      }
    });
  }, [colonyTiles, viewableTiles, setColonyTiles, setViewableTiles]);

  const removeColonyTile = useCallback((tile: Tile) => {
    // Remove the tile from colonyTiles
    const tiles = { ...colonyTiles };
    delete tiles[tile.id];
    setColonyTiles(tiles);
  }, [colonyTiles, setColonyTiles, setViewableTiles]);

  const value = {
    isLoadingTiles,
    colonyTiles,
    viewableTiles,
    addColonyTile,
    removeColonyTile,
  }

  // Handle colony tile changes.
  useEffect(() => {
    ;(async () => {
      if (!colony || !colony.tileIds || colony.tileIds.length <= 0) {
        console.log('Colony has no tileIds')
        return
      }

      // Set loading state to true when starting to fetch tiles
      setIsLoadingTiles(true)

      try {
        const tiles = await fetchTiles(colony.tileIds)
        console.log(colony.tileIds)
        let tilesMap = toTileMap(tiles)
        
        // 1. Calculate the initial viewable tiles map (with default unexplored structure)
        let initialViewableTiles = findViewableTiles(tilesMap, 5);
        console.log(`Calculated ${Object.keys(initialViewableTiles).length} initial viewable tiles.`);

        // 2. Set initial colony and viewable tiles state immediately
        if (tiles.length > 0) {
          console.log(`Loaded ${tiles.length} tiles for the colony`);
          setColonyTiles(tilesMap);
          setViewableTiles(initialViewableTiles); // Set the default viewable tiles first
        }

        // 3. Start fetching actual data for viewable tiles asynchronously
        const loadViewableTiles = async () => {
          const viewableTileIds = Object.keys(initialViewableTiles);
          if (viewableTileIds.length === 0) {
              setIsLoadingTiles(false); // No viewable tiles to load, so we're done
              return;
          }

          console.log(`Starting async fetch for ${viewableTileIds.length} viewable tiles...`);
          try {
              const fetchedViewableTiles = await fetchTiles(viewableTileIds);
              console.log(`Async fetch completed for ${fetchedViewableTiles.length} viewable tiles.`);

              invalidateTileCache(fetchedViewableTiles.map(t => t.id)); // Invalidate cache for fetched tiles

              // 4. Update viewable tiles state with fetched data
              const fetchedViewableMap = toTileMap(fetchedViewableTiles);
              setViewableTiles(prev => ({
                  ...prev, // Keep existing state (might have changed via WS)
                  ...fetchedViewableMap // Overwrite with newly fetched data
              }));
              
              // Set loading to false once all data is loaded
              setIsLoadingTiles(false);
          } catch (error) {
              console.error('Error fetching viewable tiles asynchronously:', error);
              setIsLoadingTiles(false); // Set loading to false even if there's an error
          }
        };

        // TODO TW: We should probably move this to a cloud function!!!!
        loadViewableTiles();
      } catch (tileError) {
        console.error('Error loading colony tiles:', tileError)
        setIsLoadingTiles(false); // Set loading to false if there's an error
      }
    })()
  }, [colony])

  // Subscribe to WebSocket messages for tile updates
  useWebSocketSubscription({
    onMessage: (data: WebSocketMessage) => {
      // Handle tile updates
      if (isTileMessage(data)) {
        const tile = data.payload as Tile
        // invalidateTileCache([tile.id])

        // If the tile.controllerUid == user.id update colony tiles
        if (user && tile.controllerUid == user.uid) {
          addColonyTile(tile)
          return
        }

        // If it is controlled by another player
        if (user && tile.controllerUid != user.uid) {
          removeColonyTile(tile)
        }

        if (viewableTiles[tile.id]) {
          console.log('Tile is in the viewable map')
          setViewableTiles((prev) => ({
            ...prev,
            ...toTileMap([tile]),
          }))
          return
        }
      }
    }
  });

  return <TileContext.Provider value={value}>{children}</TileContext.Provider>
}

export function useTiles() {
  const context = useContext(TileContext)
  if (context === undefined) {
    throw new Error('useTiles must be used within a TileProvider')
  }
  return context
}
