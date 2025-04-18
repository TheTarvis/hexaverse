'use client'

import { createColony, fetchUserColony } from '@/services/colony'
import { Colony } from '@/types/colony'
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { isColonyMessage, WebSocketMessage } from '@/types/websocket'
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription'

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
  refreshColony: (options?: { silent?: boolean }) => Promise<void>
  setColony: React.Dispatch<React.SetStateAction<Colony | null>>
  fetchColonyColor: (userId: string) => Promise<string>
  userColorMap: Record<string, string>
  error: string | null
}

const ColonyContext = createContext<ColonyContextType | undefined>(undefined)

export function ColonyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [colony, setColony] = useState<Colony | null>(null)
  const [isLoadingColony, setIsLoadingColony] = useState<boolean>(true)
  const [colonyStatus, setColonyStatus] = useState<ColonyStatus>(ColonyStatus.INITIAL)
  const [error, setError] = useState<string | null>(null)
  
  // Add a cache for user colors to avoid repeated fetches
  const [userColorMap, setUserColorMap] = useState<Record<string, string>>({})

  // Subscribe to WebSocket messages for colony updates
  useWebSocketSubscription({
    onMessage: async (data: WebSocketMessage) => {
      // Handle colony updates
      if (isColonyMessage(data) && colony && data.payload.id === colony.id) {
        console.log(`WebSocket: Received colony update`, data.payload)
      }
      
      // Handle enemy colony information in the message
      if (isColonyMessage(data) && data.payload.uid && 
          typeof data.payload.uid === 'string' && 
          data.payload.uid !== user?.uid) {
        
        const enemyUid = data.payload.uid;
        
        // Only process if we don't already have this colony's color
        if (!userColorMap[enemyUid]) {
          // If color is directly available in the payload and is valid
          if (typeof data.payload.color === 'string') {
            setUserColorMap(prev => ({
              ...prev,
              [enemyUid]: data.payload.color as string
            }));
          } else {
            // Otherwise fetch the colony to get its color, with validation
            try {
              // Skip fetch if uid is invalid
              if (!enemyUid || typeof enemyUid !== 'string') {
                return;
              }
              
              const enemyColony = await fetchUserColony(enemyUid);
              if (typeof enemyColony?.color === 'string') {
                setUserColorMap(prev => ({
                  ...prev,
                  [enemyUid]: enemyColony.color as string
                }));
              }
            } catch (error) {
              console.error(`Error fetching enemy colony (${enemyUid}) color:`, error);
            }
          }
        }
      }
    },
  })

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
          setColony(null)
          setColonyStatus(ColonyStatus.NO_COLONY)
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

  const refreshColony = async (options?: { silent?: boolean }): Promise<void> => {
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

  const fetchColonyColor = async (userId: string): Promise<string> => {
    // Validate userId to prevent FirebaseError permission-denied
    if (!userId || typeof userId !== 'string') {
      console.log(`Invalid userId: ${userId}, returning default color`);
      return '#FF3333'; // Default red for invalid user
    }

    // Check if we already have this color in our cache
    if (userColorMap[userId]) {
      return userColorMap[userId];
    }

    try {
      // Use a try-catch with a timeout to prevent hanging on permission issues
      const fetchPromise = fetchUserColony(userId).then(it => it?.color || null);
      
      // Add timeout to prevent long-running requests
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000); // 5 second timeout
      });
      
      // Race the fetch against the timeout
      const color = await Promise.race([fetchPromise, timeoutPromise]);
      
      // Store the color in our cache if valid
      if (color && typeof color === 'string') {
        setUserColorMap(prev => ({
          ...prev,
          [userId]: color
        }));
        return color;
      }
      
      return '#FF3333';
    } catch (error) {
      console.error(`Error fetching colony color for user ${userId}:`, error);
      return '#FF3333';
    }
  }

  const value = {
    colony,
    isLoadingColony,
    colonyStatus,
    createNewColony,
    refreshColony,
    setColony,
    fetchColonyColor,
    userColorMap,
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