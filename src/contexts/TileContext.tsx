'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useColony } from '@/contexts/ColonyContext'
import { fetchTiles } from '@/services/tiles'
import { Tile, TileMap, tilesToMap } from '@/types/tiles'
import { isTileMessage } from '@/types/websocket'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import {findViewableTiles} from "@/utils/hexUtils";
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { WebSocketMessage } from '@/types/websocket';

interface TileContextType {
  isLoadingTiles: boolean
  colonyTiles: TileMap
  viewableTiles: TileMap
  addColonyTile: (tile: Tile) => void
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
      ...tilesToMap([tile]),
    }));

    //  Update viewable tiles off of tile change.
    let tilesMap = tilesToMap([tile])
    let viewableTiles: TileMap = Object.fromEntries(
        Object.entries(findViewableTiles(tilesMap, 5))
            .filter(([_, tile]) => !(tile.id in colonyTiles))
    );
    setViewableTiles((prev) => {
      if (!prev) return viewableTiles
      return {
        ...prev,
        ...viewableTiles,
      }
    });
  }, []);

  const value = {
    isLoadingTiles,
    colonyTiles,
    viewableTiles,
    addColonyTile,
  }

  // Handle colony tile changes.
  useEffect(() => {
    ;(async () => {
      if (!colony || !colony.tileIds || colony.tileIds.length <= 0) {
        console.log('Colony has no tileIds')
        return
      }

      console.log(`Loading ${colony.tileIds.length} tiles for colony`)

      try {
        const tiles = await fetchTiles(colony.tileIds)
        if (tiles.length > 0) {
          // TODO TW: Figure out the view distance bug with the debug menu and hook it up here
          // Use the view distance hook to get base viewable tiles
          let tilesMap = tilesToMap(tiles)
          let viewableTiles = findViewableTiles(tilesMap, 5);

          console.log(`Loaded ${tiles.length} tiles for the colony`)
          setColonyTiles(tilesMap)
          setViewableTiles(viewableTiles)
        }
      } catch (tileError) {
        console.error('Error loading colony tiles:', tileError)
      }
    })()
  }, [colony])

  // Subscribe to WebSocket messages for tile updates
  useWebSocketSubscription({
    onMessage: (data: WebSocketMessage) => {
      console.log(`WebSocket: Received message`, data)

      // Handle tile updates
      if (isTileMessage(data)) {
        const tile = data.payload as Tile

        // If the tile.controllerUid == user.id update colony tiles
        if (user && tile.controllerUid == user.uid) {
          console.log('Tile is in the colony map')
          setColonyTiles((prev) => ({
            ...prev,
            ...tilesToMap([tile]),
          }))
        }

        if (viewableTiles[tile.id]) {
          console.log('Tile is in the viewable map')
          setViewableTiles((prev) => ({
            ...prev,
            ...tilesToMap([tile]),
          }))
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
