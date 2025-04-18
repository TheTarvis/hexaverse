import { Tile } from '@/types/tiles';
import { useCallback, useEffect, useRef } from 'react';

interface BufferOptions {
  bufferTimeMs?: number;
  onFlush: (tiles: Tile[]) => void;
}

/**
 * Hook to buffer tile messages and flush them in batches
 * This improves performance by reducing the number of state updates
 * when many tile updates arrive in quick succession
 */
export function useTileMessageBuffer({ 
  bufferTimeMs = 100, 
  onFlush 
}: BufferOptions) {
  // Create a ref to store pending tiles
  const pendingTiles = useRef<Record<string, Tile>>({});
  // Create a ref for the timeout ID
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to flush the buffer
  const flushBuffer = useCallback(() => {
    if (Object.keys(pendingTiles.current).length === 0) return;
    
    // Extract all tiles from the buffer (deduped by id)
    const tiles = Object.values(pendingTiles.current);
    console.log(`Flushing buffer with ${tiles.length} tile updates`);
    
    // Call the onFlush callback with the batched tiles
    onFlush(tiles);
    
    // Clear the buffer
    pendingTiles.current = {};
    
    // Clear the timeout ref
    timeoutRef.current = null;
  }, [onFlush]);

  // Add a tile to the buffer
  const bufferTile = useCallback((tile: Tile) => {
    // Store the tile in the buffer, overwriting any previous tile with the same ID
    pendingTiles.current[tile.id] = tile;
    
    // If there's no pending flush scheduled, create one
    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(flushBuffer, bufferTimeMs);
    }
  }, [bufferTimeMs, flushBuffer]);

  // Clear the timeout when the component unmounts
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return bufferTile;
} 