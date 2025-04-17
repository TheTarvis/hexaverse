'use client'

import { createColony, fetchUserColony } from '@/services/colony'
import { Colony } from '@/types/colony'
import {Tile, TileMap, tilesToMap} from '@/types/tiles'
import React, {createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState} from 'react'
import { useAuth } from './AuthContext'
import { useTiles } from './TileContext'
import {isColonyMessage, isTileMessage} from "@/types/websocket";
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'
import { WebSocketMessage } from '@/types/websocket'

// Define colony status enum for better state management
export enum ColonyStatus {
  LOADING = 'loading',
  NO_COLONY = 'no_colony',
  ERROR = 'error',
  READY = 'ready',
  INITIAL = 'initial',
}

interface ColonyContextType {
  colony: Colony | null
  isLoadingColony: boolean
  colonyStatus: ColonyStatus
  createNewColony: (name: string, color?: string) => Promise<Colony>
  refreshColony: (options?: { silent?: boolean; }) => Promise<void>
  setColony: React.Dispatch<React.SetStateAction<Colony | null>>
  error: string | null
}

const ColonyContext = createContext<ColonyContextType | undefined>(undefined)

export function ColonyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [colony, setColony] = useState<Colony | null>(null)
  const [isLoadingColony, setIsLoadingColony] = useState(false)
  const [colonyStatus, setColonyStatus] = useState<ColonyStatus>(ColonyStatus.INITIAL)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to WebSocket messages for colony updates
  useWebSocketSubscription({
    onMessage: (data: WebSocketMessage) => {
      // Handle colony updates
      if (isColonyMessage(data) && colony && data.payload.id === colony.id) {
        console.log(`WebSocket: Received colony update`, data.payload);
      }
    }
  });

  // Load colony data when user changes
  useEffect(() => {
    async function loadUserColony() {
      if (!user) {
        setColony(null)
        setIsLoadingColony(false)
        setColonyStatus(ColonyStatus.NO_COLONY)
        return
      }


      setIsLoadingColony(true)
      setColonyStatus(ColonyStatus.LOADING)
      setError(null)

      try {
        console.log('Fetching colony data for user:', user.uid)

        // First, get the colony metadata without tiles for faster initial state setup
        const colonyData = await fetchUserColony(user.uid, {
          forceRefresh: false,
        })

        if (!colonyData) {
          console.log('No colony data returned despite hasColony being true')
          setColony(null)
          setError('Failed to load colony data')
          setColonyStatus(ColonyStatus.ERROR)
          return
        }

        console.log('Colony metadata loaded:', colonyData)

        // Set initial colony metadata first
        setColony(colonyData)
      } catch (err) {
        console.error('Error loading colony:', err)
        setError('Failed to load colony data')
        setColony(null)
        setColonyStatus(ColonyStatus.ERROR)
      } finally {
        setIsLoadingColony(false)
      }
    }

    // Only attempt to load colony if we have a valid user
    if (user && user.uid) {
      loadUserColony()
    } else {
      setIsLoadingColony(false)
      setColony(null)
      setColonyStatus(ColonyStatus.NO_COLONY)
    }
  }, [user])

  const createNewColony = async (name: string, color?: string): Promise<Colony> => {
    if (!user) {
      throw new Error('User must be logged in to create a colony')
    }

    setIsLoadingColony(true)
    setColonyStatus(ColonyStatus.LOADING)
    setError(null)

    try {
      // We still need to pass the UID for Firestore storage,
      // but the backend API will authenticate via token
      const newColony = await createColony({
        name,
        color,
        uid: user.uid,
      })

      setColony(newColony)
      setColonyStatus(ColonyStatus.READY)
      return newColony
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error creating colony'
      setError(errorMessage)
      setColonyStatus(ColonyStatus.ERROR)
      throw err
    } finally {
      setIsLoadingColony(false)
    }
  }

  const refreshColony = async (options?: { silent?: boolean;}): Promise<void> => {
    console.log('Refresh Colony')
    if (!user) {
      return
    }
    // If silent refresh is requested, don't set loading state
    if (!options?.silent) {
      setIsLoadingColony(true)
      setColonyStatus(ColonyStatus.LOADING)
    }
    setError(null)

    try {
      // For refresh operations, we optimize by:
      // 1. By default, force refresh for metadata but not tiles
      // 2. Skip loading tiles and use existing tiles to prevent flicker
      const colonyData = await fetchUserColony(user.uid)

      if (!colonyData) {
        setColony(null)
        setColonyStatus(ColonyStatus.NO_COLONY)
        return
      }

      // Update the colony state with merged tiles
      setColony((prev) => {
        return {
          ...colonyData,
        }
      })
    } catch (err) {
      console.error('Error refreshing colony:', err)
      setError('Failed to refresh colony data')
      setColonyStatus(ColonyStatus.ERROR)
    } finally {
      if (!options?.silent) {
        setIsLoadingColony(false)
      }
    }
  }

  const value = {
    colony,
    isLoadingColony,
    colonyStatus,
    createNewColony,
    refreshColony,
    setColony,
    error,
  }

  return <ColonyContext.Provider value={value}>{children}</ColonyContext.Provider>
}

export function useColony() {
  const context = useContext(ColonyContext)
  if (context === undefined) {
    throw new Error('useColony must be used within a ColonyProvider')
  }
  return context
}

/**
 *
 * // Update the colony status based on the tiles we have
 *       const hasAnyTiles = tilesToUse.length > 0
 *       const hasTileIds = colonyData.tileIds && colonyData.tileIds.length > 0
 *
 *       if (hasAnyTiles) {
 *         setColonyStatus(ColonyStatus.HAS_TILES)
 *       } else if (hasTileIds) {
 *         setColonyStatus(ColonyStatus.HAS_TILE_IDS)
 *       } else {
 *         setColonyStatus(ColonyStatus.NO_TILES)
 *       }
 *
 *       // If we're missing any tiles, load them in the background
 *       const missingTileIds = colonyData.tileIds.filter((id) => !tilesToUse.some((tile) => tile.id === id))
 *
 *       if (missingTileIds.length > 0) {
 *         console.log(`Loading ${missingTileIds.length} missing tiles in the background`)
 *         loadTiles({
 *           forceRefresh: options?.forceRefresh !== false,
 *           specificTileIds: missingTileIds,
 *         }).catch((err) => {
 *           console.error('Error loading missing tiles during refresh:', err)
 *         })
 *       }
 */
