'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GridCanvas, SelectedTile } from '@/components/grid/GridCanvas'
import { useAuth } from '@/contexts/AuthContext'
import { useWarmupFunctions } from '@/hooks/useWarmupFunctions'
import { Tile, TileMap } from '@/types/tiles'
import { pixelToCube, cubeRound, hexDistance } from '@/utils/gridUtils'; // Import hex grid utilities

const RADIUS = 400; // Radius to fetch/generate around new center point
const MOVE_THRESHOLD = 8; // How many hex tiles camera needs to move to trigger fetch
const HEX_SIZE = 1.2; // Make sure this matches GridCanvas prop



// Generates tiles within a radius around a central hex coordinate (q, r, s)
// and prunes tiles outside this radius from the final map.
function generateTilesAroundCenter(centerQ: number, centerR: number, radius: number): TileMap {
  // Log execution time for tile generation
  const startTime = performance.now();
  console.log(`Executing generateTilesAroundCenter at ${new Date().toISOString()}`);
  const map: TileMap = {}; // Start with an empty map
  const centerS = -centerQ - centerR;
  console.log(`Generating new map for radius ${radius} around center: (${centerQ}, ${centerR}, ${centerS})`);

  // 1. Generate tiles within the radius
  for (let qOffset = -radius; qOffset <= radius; qOffset++) {
    for (let rOffset = Math.max(-radius, -qOffset - radius); rOffset <= Math.min(radius, -qOffset + radius); rOffset++) {
      const sOffset = -qOffset - rOffset;

      const q = centerQ + qOffset;
      const r = centerR + rOffset;
      const s = centerS + sOffset;

      const key = `${q}#${r}#${s}`;
      if (!map[key]) { // Only add if it doesn't exist
        map[key] = {
          id: key,
          q,
          r,
          s,
          color: '#666666',
          type: 'empty',
          resourceDensity: 0,
          controllerUid: '',
          visibility: 'visible',
        };
      }
    }
  }
  console.log(`Total tiles after generation: ${Object.keys(map).length}`);
  return map;
}

export function DrawingGridManager() {
  const { user } = useAuth();
  useWarmupFunctions();

  // State for the center of the last fetched/generated area
  const [lastFetchCenter, setLastFetchCenter] = useState<[number, number, number]>([0, 0, 0]);
  // Initial tile map generation around origin
  const [tileMap, setTileMap] = useState<TileMap>(() => generateTilesAroundCenter(0, 0, RADIUS));
  const [isFetching, setIsFetching] = useState(false);

  // Refs to hold the latest state for the debounced function
  const isFetchingRef = useRef(isFetching);
  const lastFetchCenterRef = useRef(lastFetchCenter);

  // Store camera position ref to access latest value in debounced function
  const cameraPositionRef = useRef<[number, number, number]>([0, 0, 20]);

  // Effect to keep refs updated with the latest state
  useEffect(() => {
    isFetchingRef.current = isFetching;
  }, [isFetching]);

  useEffect(() => {
    lastFetchCenterRef.current = lastFetchCenter;
  }, [lastFetchCenter]);

  // Debounced function to check camera movement and fetch if needed
  const fetchTilesAroundCamera = useCallback(async (cameraPos: [number, number, number]) => {
    if (isFetchingRef.current) return; // Check ref instead of state

    // 1. Convert camera's X/Y world position to fractional hex coordinates
    // Note: This assumes camera X/Y maps directly to grid X/Y. Adjust if camera panning logic is different.
    const [fq, fr, fs] = pixelToCube(cameraPos[0], cameraPos[1], HEX_SIZE);

    // 2. Round to get the integer hex coordinates under the camera
    const [currentQ, currentR, currentS] = cubeRound(fq, fr, fs);

    // Use current value from ref for comparison
    const currentLastFetchCenter = lastFetchCenterRef.current;

    // 3. Calculate hex distance from the last fetch center
    const distance = hexDistance(
      currentLastFetchCenter[0],
      currentLastFetchCenter[1],
      currentLastFetchCenter[2],
      currentQ,
      currentR,
      currentS
    );

    console.log(`Camera Hex: (${currentQ}, ${currentR}, ${currentS}). Last Fetch: (${currentLastFetchCenter.join(', ')}). Distance: ${distance.toFixed(1)}`);

    // 4. Check if distance exceeds threshold
    if (distance > MOVE_THRESHOLD) {
      console.log(`Moved ${distance.toFixed(1)} tiles (threshold ${MOVE_THRESHOLD}), fetching new area around (${currentQ}, ${currentR}, ${currentS})...`);
      // Set state AND ref
      setIsFetching(true);
      isFetchingRef.current = true;
      try {
        // In a real app, this would be an API call:
        // const newTiles = await api.fetchTiles({ center: [currentQ, currentR], radius: FETCH_RADIUS });
        // Generate new tiles around the current camera center
        const newMap = generateTilesAroundCenter(currentQ, currentR, RADIUS);
        setTileMap(newMap); // Update the map with the newly generated tiles
        // Set state AND ref
        setLastFetchCenter([currentQ, currentR, currentS]); // Update the center
        lastFetchCenterRef.current = [currentQ, currentR, currentS];

        console.log(`Fetch centered on (${currentQ}, ${currentR}, ${currentS}) complete.`);
      } catch (error) {
        console.error("Failed to fetch/generate new tiles:", error);
      } finally {
        // Reset fetching state immediately
        // Set state AND ref
        setIsFetching(false);
        isFetchingRef.current = false;
      }
    }
  }, []); // Debounce time is 50ms, dependencies removed

  // Callback for GridCanvas camera movement
  const handleCameraMove = useCallback((pos: [number, number, number]) => {
    cameraPositionRef.current = pos; // Update the ref immediately
    // console.log('Camera moved to world coords:', pos); // Can uncomment for debugging world coords
    fetchTilesAroundCamera(pos); // Call the debounced fetch function
  }, [fetchTilesAroundCamera]); // Dependency: the debounced function itself

  const handleTileSelect = (tile: SelectedTile) => {
    console.log('Tile selected (logic pending):', tile);
    // Placeholder - actual selection/drawing logic will go here
  }

  // Log tileMap size changes for debugging
  useEffect(() => {
    console.log(`Tile map updated. Size: ${Object.keys(tileMap).length} tiles. Last fetch center: ${lastFetchCenter.join(',')}`);
  }, [tileMap, lastFetchCenter]);

  return (
    <div className="relative h-full w-full">
      <GridCanvas
        wireframe={false}
        hexSize={HEX_SIZE} // Pass HEX_SIZE constant
        tileMap={tileMap}
        onTileSelect={handleTileSelect}
        onCameraStop={handleCameraMove} // Pass the callback
      />
       {/* Optional: Loading indicator */}
       {isFetching && (
         <div className="absolute top-2 left-2 bg-yellow-500 text-black p-2 rounded z-10">
            Loading map area...
         </div>
       )}
    </div>
  );
}