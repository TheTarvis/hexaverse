import { useState, useRef, useEffect, useCallback } from 'react';
import { pixelToCube, cubeRound, hexDistance } from '@/utils/gridUtils';
import { TileMap } from '@/types/tiles';

// Type for the hook options
interface UseHexGridCameraOptions {
  hexSize: number;
  radius?: number;
  moveThreshold?: number;
  generateTilesFunc?: (centerQ: number, centerR: number, radius: number) => TileMap;
}

// Type for the hook return value
interface UseHexGridCameraReturn {
  tileMap: TileMap;
  isFetching: boolean;
  lastFetchCenter: [number, number, number];
  handleCameraMove: (pos: [number, number, number]) => void;
}

// Default tile generation function
const defaultGenerateTiles = (centerQ: number, centerR: number, radius: number): TileMap => {
  const startTime = performance.now();
  console.log(`Executing generateTilesAroundCenter at ${new Date().toISOString()}`);
  const map: TileMap = {};
  const centerS = -centerQ - centerR;
  console.log(`Generating new map for radius ${radius} around center: (${centerQ}, ${centerR}, ${centerS})`);

  // Generate tiles within the radius
  for (let qOffset = -radius; qOffset <= radius; qOffset++) {
    for (let rOffset = Math.max(-radius, -qOffset - radius); rOffset <= Math.min(radius, -qOffset + radius); rOffset++) {
      const sOffset = -qOffset - rOffset;

      const q = centerQ + qOffset;
      const r = centerR + rOffset;
      const s = centerS + sOffset;

      const key = `${q}#${r}#${s}`;
      if (!map[key]) {
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
};

/**
 * Custom hook for managing hex grid camera movement and tile generation
 */
export function useHexGridCamera({
  hexSize,
  radius = 200,
  moveThreshold = 8,
  generateTilesFunc = defaultGenerateTiles,
}: UseHexGridCameraOptions): UseHexGridCameraReturn {
  // State for the center of the last fetched/generated area
  const [lastFetchCenter, setLastFetchCenter] = useState<[number, number, number]>([0, 0, 0]);
  
  // Initial tile map generation around origin
  const [tileMap, setTileMap] = useState<TileMap>(() => generateTilesFunc(0, 0, radius));
  
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

  // Function to check camera movement and fetch if needed
  const fetchTilesAroundCamera = useCallback(async (cameraPos: [number, number, number]) => {
    if (isFetchingRef.current) return;

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

    console.log(`Camera Hex: (${currentQ}, ${currentR}, ${currentS}). Last Fetch: (${currentLastFetchCenter.join(', ')}). Distance: ${distance.toFixed(1)}`);

    // Check if distance exceeds threshold
    if (distance > moveThreshold) {
      console.log(`Moved ${distance.toFixed(1)} tiles (threshold ${moveThreshold}), generating new area around (${currentQ}, ${currentR}, ${currentS})...`);
      setIsFetching(true);
      isFetchingRef.current = true;
      try {
        // Generate new tiles around the current camera center
        const newMap = generateTilesFunc(currentQ, currentR, radius);
        setTileMap(newMap);
        setLastFetchCenter([currentQ, currentR, currentS]);
        lastFetchCenterRef.current = [currentQ, currentR, currentS];

        console.log(`Tile generation centered on (${currentQ}, ${currentR}, ${currentS}) complete.`);
      } catch (error) {
        console.error("Failed to generate new tiles:", error);
      } finally {
        setIsFetching(false);
        isFetchingRef.current = false;
      }
    }
  }, [hexSize, moveThreshold, radius, generateTilesFunc]);

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
  };
} 