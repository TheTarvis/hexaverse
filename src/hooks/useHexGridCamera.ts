import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { pixelToCube, cubeRound, hexDistance } from '@/utils/gridUtils';
import { TileMap, Tile } from '@/types/tiles';

// Type for the hook options
interface UseHexGridCameraOptions {
  hexSize: number;
  radius?: number;
  moveThreshold?: number;
  fetchTilesByIds?: (tileIds: string[]) => Promise<Tile[]>;
  onTileUpdate?: (tile: Tile) => void;
}

// Type for tile set operations
interface TileSetOperations {
  tilesToFetch: Set<string>;   // New tiles to fetch
  tilesToDiscard: Set<string>; // Tiles no longer needed
}

// Helper to generate tile IDs within a radius of a center point
function generateTileIdsInRadius(centerQ: number, centerR: number, radius: number): Set<string> {
  const tileIds = new Set<string>();
  const centerS = -centerQ - centerR;

  for (let qOffset = -radius; qOffset <= radius; qOffset++) {
    for (let rOffset = Math.max(-radius, -qOffset - radius); rOffset <= Math.min(radius, -qOffset + radius); rOffset++) {
      const sOffset = -qOffset - rOffset;
      const q = centerQ + qOffset;
      const r = centerR + rOffset;
      const s = centerS + sOffset;
      tileIds.add(`${q}#${r}#${s}`);
    }
  }

  return tileIds;
}

// Helper to generate default tiles for empty areas
function generateDefaultTiles(centerQ: number, centerR: number, radius: number): TileMap {
  console.log(`[useHexGridCamera] Generating default tiles around (${centerQ}, ${centerR}) with radius ${radius}`);
  const map: TileMap = {};
  const centerS = -centerQ - centerR;
  const now = new Date().toISOString();
  let count = 0;

  for (let qOffset = -radius; qOffset <= radius; qOffset++) {
    for (let rOffset = Math.max(-radius, -qOffset - radius); rOffset <= Math.min(radius, -qOffset + radius); rOffset++) {
      const sOffset = -qOffset - rOffset;
      const q = centerQ + qOffset;
      const r = centerR + rOffset;
      const s = centerS + sOffset;

      const id = `${q}#${r}#${s}`;
      // Create a tile with only the properties defined in the Tile interface
      map[id] = {
        id,
        q,
        r,
        s,
        controllerUid: '',
        color: '#666666',
        updatedAt: now
      };
      
      count++;
    }
  }

  console.log(`[useHexGridCamera] Generated ${count} default tiles`);
  return map;
}

// Helper to compute tile set operations
function computeTileSetOperations(
  previousTileIds: Set<string>,
  currentTileIds: Set<string>
): TileSetOperations {
  const tilesToFetch = new Set(
    Array.from(currentTileIds).filter(id => !previousTileIds.has(id))
  );
  
  const tilesToDiscard = new Set(
    Array.from(previousTileIds).filter(id => !currentTileIds.has(id))
  );

  return { tilesToFetch, tilesToDiscard };
}

// Type for the hook return value
interface UseHexGridCameraReturn {
  tileMap: TileMap;
  isFetching: boolean;
  lastFetchCenter: [number, number, number];
  handleCameraMove: (pos: [number, number, number]) => void;
  updateTile: (tileId: string, updates: Partial<TileMap[string]>) => void;
}

/**
 * Custom hook for managing hex grid camera movement and tile generation
 * Uses a simplified Tile model with only core properties:
 * - id, q, r, s (coordinates)
 * - controllerUid (owner)
 * - color (visual appearance)
 * - updatedAt (timestamp)
 */
export function useHexGridCamera({
  hexSize,
  radius = 200,
  moveThreshold = 8,
  fetchTilesByIds,
  onTileUpdate,
}: UseHexGridCameraOptions): UseHexGridCameraReturn {
  // Debug ref to track initialization
  const initCountRef = useRef(0);
  const hasInitializedRef = useRef(false);
  
  // Keep track of modified tiles
  const modifiedTilesRef = useRef<TileMap>({});
  
  // Memoize the initial tile generation
  const initialTileMap = useMemo(() => {
    // Only generate tiles on the first initialization
    if (hasInitializedRef.current) {
      console.log('[useHexGridCamera] Skipping duplicate initialization');
      return {};
    }

    initCountRef.current += 1;
    console.log(`[useHexGridCamera] Initializing tiles (call #${initCountRef.current})`);
    
    const tiles = generateDefaultTiles(0, 0, radius);
    hasInitializedRef.current = true;
    return tiles;
  }, []); // Empty deps since this should only run once

  // State for the center of the last fetched/generated area
  const [lastFetchCenter, setLastFetchCenter] = useState<[number, number, number]>([0, 0, 0]);
  
  // State for visible tiles, initialize with memoized tiles
  const [tileMap, setTileMap] = useState<TileMap>(initialTileMap);

  // Debug effect to monitor tileMap changes
  useEffect(() => {
    const tileCount = Object.keys(tileMap).length;
    console.log(`[useHexGridCamera] TileMap updated, now contains ${tileCount} tiles`);
    if (tileCount === 0 && hasInitializedRef.current) {
      console.warn('[useHexGridCamera] Warning: TileMap is empty but initialization has occurred!');
    }
  }, [tileMap]);
  
  const [isFetching, setIsFetching] = useState(false);

  // Refs to hold the latest state for the debounced function
  const isFetchingRef = useRef(isFetching);
  const lastFetchCenterRef = useRef(lastFetchCenter);
  const visibleTileIdsRef = useRef<Set<string>>(new Set(Object.keys(initialTileMap)));

  // Store camera position ref to access latest value in debounced function
  const cameraPositionRef = useRef<[number, number, number]>([0, 0, 20]);

  // Effect to perform initial tile fetch
  useEffect(() => {
    if (!fetchTilesByIds || Object.keys(initialTileMap).length === 0) return;

    const fetchInitialTiles = async () => {
      setIsFetching(true);
      try {
        // Generate initial set of tile IDs around origin
        const initialTileIds = generateTileIdsInRadius(0, 0, radius);
        visibleTileIdsRef.current = initialTileIds;

        // Fetch initial tiles
        const initialTiles = await fetchTilesByIds(Array.from(initialTileIds));
        
        // Update tile map with fetched tiles
        setTileMap(
          initialTiles.reduce((map, tile) => {
            map[tile.id] = tile;
            return map;
          }, {} as TileMap)
        );

        console.log(`Initial fetch complete: ${initialTiles.length} tiles loaded`);
      } catch (error) {
        console.error("Failed to fetch initial tiles:", error);
      } finally {
        setIsFetching(false);
      }
    };

    fetchInitialTiles().then(() => { console.log('[useHexGridCamera] Initialized tiles loaded'); });
  }, [fetchTilesByIds, radius, initialTileMap]);

  // Effect to keep refs updated with the latest state
  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  useEffect(() => {
    lastFetchCenterRef.current = lastFetchCenter;
  }, [lastFetchCenter]);

  // Function to update a specific tile
  const updateTile = useCallback((tileId: string, updates: Partial<TileMap[string]>) => {
    console.log(`[useHexGridCamera] Updating tile ${tileId} with updates:`, updates);
    setTileMap(prevTileMap => {
      if (!prevTileMap[tileId]) return prevTileMap;
      
      const updatedTile = {
        ...prevTileMap[tileId],
        ...updates
      };

      // Notify parent of tile update
      onTileUpdate?.(updatedTile);
      
      // Store the modified tile in our ref
      modifiedTilesRef.current[tileId] = updatedTile;
      
      return {
        ...prevTileMap,
        [tileId]: updatedTile
      };
    });
  }, [onTileUpdate]);

  // Function to check camera movement and fetch if needed
  const fetchTilesAroundCamera = useCallback(async (cameraPos: [number, number, number]) => {
    if (isFetchingRef.current || !fetchTilesByIds) return;

    // Convert camera's X/Y world position to fractional hex coordinates
    const [fq, fr, fs] = pixelToCube(cameraPos[0], cameraPos[1], hexSize);

    // Round to get the integer hex coordinates under the camera
    const [currentQ, currentR, currentS] = cubeRound(fq, fr, fs);

    // Use current value from ref for comparison
    const currentLastFetchCenter = lastFetchCenterRef.current;

    // Calculate hex distance from the last fetch center
    const distance = hexDistance(
      currentLastFetchCenter[0],
      currentLastFetchCenter[1],
      currentLastFetchCenter[2],
      currentQ,
      currentR,
      currentS
    );

    // Check if distance exceeds threshold
    if (distance > moveThreshold) {
      console.log(`[useHexGridCamera] Camera moved ${distance.toFixed(1)} tiles, fetching new area`);
      setIsFetching(true);
      isFetchingRef.current = true;

      try {
        // Generate sets of tile IDs for previous and current visible areas
        const previousTileIds = visibleTileIdsRef.current;
        const currentTileIds = generateTileIdsInRadius(currentQ, currentR, radius);

        // Compute which tiles to fetch and discard
        const { tilesToFetch, tilesToDiscard } = computeTileSetOperations(previousTileIds, currentTileIds);

        // Fetch tiles from service
        const fetchedTiles = await fetchTilesByIds(Array.from(tilesToFetch));
        
        // Generate default tiles for any IDs that weren't found
        const now = new Date().toISOString();
        const fetchedTileIds = new Set(fetchedTiles.map(t => t.id));
        const defaultTiles = Array.from(tilesToFetch)
          .filter(id => !fetchedTileIds.has(id))
          .map(id => {
            const [q, r, s] = id.split('#').map(Number);
            
            return {
              id,
              q, r, s,
              controllerUid: '',
              color: '#666666',
              updatedAt: now
            };
          });

        // Update tile map
        setTileMap(prevMap => {
          const newMap = { ...prevMap };
          
          // Remove discarded tiles
          tilesToDiscard.forEach(id => {
            delete newMap[id];
          });
          
          // Add fetched and default tiles, preserving any local modifications
          [...fetchedTiles, ...defaultTiles].forEach(tile => {
            // Check if we have a modified version of this tile
            const modifiedTile = modifiedTilesRef.current[tile.id];
            newMap[tile.id] = modifiedTile || tile;
          });
          
          return newMap;
        });

        // Update refs and state
        visibleTileIdsRef.current = currentTileIds;
        setLastFetchCenter([currentQ, currentR, currentS]);
        lastFetchCenterRef.current = [currentQ, currentR, currentS];

      } catch (error) {
        console.error("Failed to fetch tiles:", error);
      } finally {
        setIsFetching(false);
        isFetchingRef.current = false;
      }
    }
  }, [hexSize, moveThreshold, radius, fetchTilesByIds]);

  // Callback for GridCanvas camera movement
  const handleCameraMove = useCallback((pos: [number, number, number]) => {
    cameraPositionRef.current = pos;
    fetchTilesAroundCamera(pos);
  }, [fetchTilesAroundCamera]);

  return {
    tileMap,
    isFetching,
    lastFetchCenter,
    handleCameraMove,
    updateTile,
  };
} 