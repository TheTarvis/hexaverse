'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useAuth } from './AuthContext';
import { Colony, ColonyTile } from '@/types/colony';
import { fetchUserColony, createColony, hasColony, fetchTilesForColony } from '@/services/colony';

interface ColonyContextType {
  colony: Colony | null;
  isLoadingColony: boolean;
  hasColony: boolean;
  createNewColony: (name: string, color?: string) => Promise<Colony>;
  refreshColony: (options?: { silent?: boolean; forceRefresh?: boolean; keepLocalChanges?: boolean }) => Promise<void>;
  loadTiles: (options?: { forceRefresh?: boolean; specificTileIds?: string[] }) => Promise<void>;
  setColony: React.Dispatch<React.SetStateAction<Colony | null>>;
  error: string | null;
}

const ColonyContext = createContext<ColonyContextType | undefined>(undefined);

export function ColonyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [colony, setColony] = useState<Colony | null>(null);
  const [isLoadingColony, setIsLoadingColony] = useState(false);
  const [isLoadingTiles, setIsLoadingTiles] = useState(false);
  const [hasExistingColony, setHasExistingColony] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Add a ref to track when colony was last loaded to prevent redundant fetches
  const lastLoadTime = useRef<number>(0);
  const FETCH_DEBOUNCE_TIME = 5000; // 5 seconds
  
  // Helper function to check if we should fetch colony data
  const shouldFetchColony = () => {
    const now = Date.now();
    const timeSinceLastLoad = now - lastLoadTime.current;
    
    if (timeSinceLastLoad < FETCH_DEBOUNCE_TIME) {
      console.log(`Skipping colony fetch - last loaded ${timeSinceLastLoad}ms ago`);
      return false;
    }
    
    lastLoadTime.current = now;
    return true;
  };

  // Load colony data when user changes
  useEffect(() => {
    async function loadUserColony() {
      if (!user) {
        setColony(null);
        setHasExistingColony(false);
        setIsLoadingColony(false);
        return;
      }

      // Skip if we just loaded colony data recently
      if (!shouldFetchColony()) {
        return;
      }

      setIsLoadingColony(true);
      setError(null);

      try {
        console.log("Checking if user has colony:", user.uid);
        // Check if user has a colony
        const userHasColony = await hasColony(user.uid);
        setHasExistingColony(userHasColony);

        if (userHasColony) {
          console.log("Fetching colony data for user:", user.uid);
          
          // First, get the colony metadata without tiles for faster initial state setup
          const colonyData = await fetchUserColony(user.uid, { 
            forceRefresh: false,
            skipTiles: true // Skip tiles for faster initial load
          });
          
          if (!colonyData) {
            console.log("No colony data returned despite hasColony being true");
            setColony(null);
            setError("Failed to load colony data");
            return;
          }
          
          console.log('Colony metadata loaded:', colonyData);
          
          // Set initial colony metadata first
          setColony(colonyData);
          
          // Only proceed to load tiles if we have tileIds
          if (colonyData.tileIds && colonyData.tileIds.length > 0) {
            console.log(`Loading ${colonyData.tileIds.length} tiles for colony`);
            
            try {
              // Load all tiles directly to ensure they're available
              const tiles = await fetchTilesForColony(colonyData.tileIds);
              
              if (tiles && tiles.length > 0) {
                console.log(`Loaded ${tiles.length} tiles for the colony`);
                // Update colony with all tiles
                setColony(prev => {
                  if (!prev) return colonyData;
                  return {
                    ...prev,
                    tiles: tiles
                  };
                });
              } else {
                console.warn(`No tiles were loaded despite having ${colonyData.tileIds.length} tileIds`);
              }
            } catch (tileError) {
              console.error('Error loading colony tiles:', tileError);
              // Don't set error state, we already have the colony metadata
            }
          } else {
            console.log("Colony has no tileIds");
          }
        } else {
          console.log("User has no colony yet");
          setColony(null);
        }
      } catch (err) {
        console.error('Error loading colony:', err);
        setError('Failed to load colony data');
        setColony(null);
      } finally {
        setIsLoadingColony(false);
      }
    }
    
    // Only attempt to load colony if we have a valid user
    if (user && user.uid) {
      loadUserColony();
    } else {
      setIsLoadingColony(false);
      setColony(null);
      setHasExistingColony(false);
    }
  }, [user]);

  const createNewColony = async (name: string, color?: string): Promise<Colony> => {
    if (!user) {
      throw new Error('User must be logged in to create a colony');
    }

    setIsLoadingColony(true);
    setError(null);

    try {
      // We still need to pass the UID for Firestore storage,
      // but the backend API will authenticate via token
      const newColony = await createColony({
        name,
        color,
        uid: user.uid
      });
      
      setColony(newColony);
      setHasExistingColony(true);
      return newColony;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error creating colony';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoadingColony(false);
    }
  };

  const refreshColony = async (options?: { 
    silent?: boolean; 
    forceRefresh?: boolean;
    keepLocalChanges?: boolean; 
  }): Promise<void> => {
    if (!user) {
      return;
    }

    // Force-refresh ignores the debounce timing
    if (!options?.forceRefresh && !shouldFetchColony()) {
      console.log('Skipping manual colony refresh due to recent fetch');
      return;
    }

    // If silent refresh is requested, don't set loading state
    if (!options?.silent) {
      setIsLoadingColony(true);
    }
    setError(null);

    try {
      // Get the current colony data to compare later
      const currentColony = colony;
      const currentTiles = currentColony?.tiles || [];
      
      // For refresh operations, we optimize by:
      // 1. By default, force refresh for metadata but not tiles
      // 2. Skip loading tiles and use existing tiles to prevent flicker
      const colonyData = await fetchUserColony(user.uid, { 
        forceRefresh: options?.forceRefresh !== false, // Default to true
        skipTiles: true // Skip loading tiles immediately
      });
      
      if (!colonyData) {
        setColony(null);
        setHasExistingColony(false);
        return;
      }
      
      // Build a map of current tiles by ID and coordinates for fast lookup
      const currentTileMap = new Map<string, ColonyTile>();
      const currentTileCoordMap = new Map<string, ColonyTile>();
      
      currentTiles.forEach((tile: ColonyTile) => {
        // Map by ID
        if (tile.id) {
          currentTileMap.set(tile.id, tile);
        }
        
        // Map by coordinates
        const coordKey = `${tile.q},${tile.r},${tile.s}`;
        currentTileCoordMap.set(coordKey, tile);
      });
      
      // Build a list of tiles to keep, merging current and new
      let tilesToUse: ColonyTile[] = [];
      
      // If we want to keep local changes, merge current tiles with the tileIds from the new data
      if (options?.keepLocalChanges !== false && currentTiles.length > 0) {
        console.log(`Preserving ${currentTiles.length} local tiles during refresh`);
        
        // First, add all current tiles that are in the new tileIds list
        if (colonyData.tileIds && colonyData.tileIds.length > 0) {
          tilesToUse = currentTiles.filter(tile => 
            tile.id && colonyData.tileIds.includes(tile.id)
          );
          
          // Add any tiles that match by coordinates if they don't have an ID
          const tilesToAdd = currentTiles.filter(tile => 
            !tile.id && colonyData.tileIds.some(id => {
              // Extract coordinates from tile ID if possible
              const parts = id.split('_');
              if (parts.length >= 3) {
                const q = parseInt(parts[0], 10);
                const r = parseInt(parts[1], 10);
                const s = parseInt(parts[2], 10);
                return tile.q === q && tile.r === r && tile.s === s;
              }
              return false;
            })
          );
          
          tilesToUse = [...tilesToUse, ...tilesToAdd];
          
          // If we're still missing tiles from the new tileIds, we'll load them later
          console.log(`Kept ${tilesToUse.length} tiles out of ${colonyData.tileIds.length} total tileIds`);
        }
      } else if (colonyData.tiles && colonyData.tiles.length > 0) {
        // Use the new tiles if available
        tilesToUse = colonyData.tiles;
      } else if (currentTiles.length > 0) {
        // Fall back to current tiles as a last resort to prevent flicker
        tilesToUse = currentTiles;
      }
      
      // Update the colony state with merged tiles
      setColony(prev => {
        // If nothing has changed, don't trigger a re-render
        if (prev && 
            prev.id === colonyData.id && 
            prev.tileIds.length === colonyData.tileIds.length &&
            prev.tiles?.length === tilesToUse.length &&
            JSON.stringify(prev.tileIds.sort()) === JSON.stringify(colonyData.tileIds.sort())) {
          // No meaningful change, keep existing state to prevent unnecessary renders
          return prev;
        }
        
        return {
          ...colonyData,
          tiles: tilesToUse
        };
      });
      
      setHasExistingColony(true);
      
      // If we're missing any tiles, load them in the background
      const missingTileIds = colonyData.tileIds.filter(id => 
        !tilesToUse.some(tile => tile.id === id)
      );
      
      if (missingTileIds.length > 0) {
        console.log(`Loading ${missingTileIds.length} missing tiles in the background`);
        loadTiles({ 
          forceRefresh: options?.forceRefresh !== false,
          specificTileIds: missingTileIds
        }).catch(err => {
          console.error('Error loading missing tiles during refresh:', err);
        });
      }
    } catch (err) {
      console.error('Error refreshing colony:', err);
      setError('Failed to refresh colony data');
    } finally {
      if (!options?.silent) {
        setIsLoadingColony(false);
      }
    }
  };
  
  /**
   * Load tiles for the current colony with various optimization options
   */
  const loadTiles = async (options?: { 
    forceRefresh?: boolean;
    specificTileIds?: string[];
  }): Promise<void> => {
    if (!colony || !colony.tileIds.length) {
      return;
    }
    
    // If we're loading specific tiles, check if they already exist in the colony
    if (options?.specificTileIds && colony.tiles?.length) {
      const existingTileIds = colony.tiles.map(tile => tile.id);
      const missingTileIds = options.specificTileIds.filter(id => !existingTileIds.includes(id));
      
      // If all requested tiles are already loaded, no need to fetch again
      if (missingTileIds.length === 0) {
        console.log('All requested tiles already exist in colony, skipping fetch');
        return;
      }
      
      // Update specificTileIds to only include missing tiles
      options.specificTileIds = missingTileIds;
    }
    
    setIsLoadingTiles(true);
    
    try {
      const tiles = await fetchTilesForColony(
        colony.tileIds,
        {
          forceRefresh: options?.forceRefresh,
          onlyTileIds: options?.specificTileIds
        }
      );
      
      if (tiles.length > 0) {
        setColony(prev => {
          if (!prev) return prev;
          
          // If we're loading specific tiles, merge them with existing tiles
          if (options?.specificTileIds && prev.tiles) {
            // Create a map of existing tiles for fast lookup
            const existingTileMap = new Map(
              prev.tiles.map(tile => [tile.id, tile])
            );
            
            // Update existing tiles with new ones
            tiles.forEach((tile: ColonyTile) => {
              if (tile.id) {
                existingTileMap.set(tile.id, tile);
              } else {
                // If no ID, try to match by coordinates
                const coordKey = `${tile.q},${tile.r},${tile.s}`;
                const existingTileIndex = prev.tiles!.findIndex(t => 
                  t.q === tile.q && t.r === tile.r && t.s === tile.s
                );
                
                if (existingTileIndex >= 0) {
                  // Don't update tiles that already exist without an ID - 
                  // these might be newly added tiles that haven't synced yet
                  console.log(`Preserving existing tile at ${coordKey}`);
                } else {
                  existingTileMap.set(coordKey, tile);
                }
              }
            });
            
            return {
              ...prev,
              tiles: Array.from(existingTileMap.values())
            };
          }
          
          // For full refreshes, replace all tiles but check for unsynced new tiles
          const newTiles = [...tiles];
          
          // Look for tiles in prev.tiles that aren't in the new tiles array
          // These could be tiles that were just added but haven't synced with the server yet
          if (prev.tiles) {
            prev.tiles.forEach((prevTile: ColonyTile) => {
              // Check if this tile exists in the new tiles array
              const exists = newTiles.some(newTile => 
                (prevTile.id && newTile.id && prevTile.id === newTile.id) || 
                (prevTile.q === newTile.q && prevTile.r === newTile.r && prevTile.s === newTile.s)
              );
              
              // If it doesn't exist in new tiles, it might be a newly added tile
              // Add it to preserve local changes
              if (!exists) {
                console.log(`Preserving locally added tile at q=${prevTile.q}, r=${prevTile.r}, s=${prevTile.s}`);
                newTiles.push(prevTile);
              }
            });
          }
          
          return {
            ...prev,
            tiles: newTiles
          };
        });
      }
    } catch (err) {
      console.error('Error loading tiles:', err);
    } finally {
      setIsLoadingTiles(false);
    }
  };

  const value = {
    colony,
    isLoadingColony,
    hasColony: hasExistingColony,
    createNewColony,
    refreshColony,
    loadTiles,
    setColony,
    error
  };

  return (
    <ColonyContext.Provider value={value}>
      {children}
    </ColonyContext.Provider>
  );
}

export function useColony() {
  const context = useContext(ColonyContext);
  if (context === undefined) {
    throw new Error('useColony must be used within a ColonyProvider');
  }
  return context;
} 