import {Tile, TileMap} from '@/types/tiles'

// Hex directions in cube coordinates (pointy-top orientation)
export const HEX_DIRECTIONS = [
    { q: 1, r: -1, s: 0 },  // UpRight
    { q: 0, r: -1, s: 1 },  // Up
    { q: -1, r: 0, s: 1 },  // UpLeft
    { q: -1, r: 1, s: 0 },  // DownLeft
    { q: 0, r: 1, s: -1 },  // Down
    { q: 1, r: 0, s: -1 },  // DownRight
  ]
  
  // Create a unique key for cube coordinates
  export function coordsToKey(q: number, r: number, s: number): string {
    return `${q},${r},${s}`
  }
  
  // Convert a key back to coordinates
  export function keyToCoords(key: string): { q: number, r: number, s: number } {
    const [q, r, s] = key.split(',').map(Number)
    return { q, r, s }
  }
  
  // Get all neighboring coordinates of a tile
  export function getNeighbors(tile: { q: number, r: number, s: number }): { q: number, r: number, s: number }[] {
    return HEX_DIRECTIONS.map(dir => ({
      q: tile.q + dir.q,
      r: tile.r + dir.r,
      s: tile.s + dir.s
    }))
  }
  
  // Find all edge tiles in a colony
  export function findEdgeTiles(tileMap: { [key: string]: any }): { q: number, r: number, s: number }[] {
    const edgeTiles: { q: number, r: number, s: number }[] = []
    
    // Check each tile to see if it has any missing neighbors
    Object.keys(tileMap).forEach(key => {
      const coords = keyToCoords(key)
      const neighbors = getNeighbors(coords)
      
      // If any neighbor is missing, this is an edge tile
      const isEdge = neighbors.some(neighbor => {
        const neighborKey = coordsToKey(neighbor.q, neighbor.r, neighbor.s)
        return !tileMap[neighborKey]
      })
      
      if (isEdge) {
        edgeTiles.push(coords)
      }
    })
    
    return edgeTiles
  }
  
// Find all valid viewable tiles (neighbors of colony tiles up to a certain depth)
export function findViewableTiles(tileMap: TileMap, depth: number = 1): TileMap {
  if (depth < 1) {
    return {};
  }

  const viewableTilesMap: TileMap = {};
  const visitedKeys = new Set<string>(Object.keys(tileMap)); // Keep track of colony and already found viewable tiles
  let currentFrontier: { q: number, r: number, s: number }[] = Object.values(tileMap).map(tile => ({ q: tile.q, r: tile.r, s: tile.s })); // Start with colony tiles

  for (let d = 0; d < depth; d++) {
    const nextFrontier: { q: number, r: number, s: number }[] = [];
    const newViewableFoundInLayer:TileMap = {};

    currentFrontier.forEach(tile => {
      const neighbors = getNeighbors(tile);

      neighbors.forEach(neighbor => {
        const neighborKey = coordsToKey(neighbor.q, neighbor.r, neighbor.s);

        // If this neighbor is not part of the colony and hasn't been visited/added as viewable yet
        if (!visitedKeys.has(neighborKey)) {
          newViewableFoundInLayer[neighborKey] =  {
            controllerUid: "",
            id: `${neighbor.q}#${neighbor.r}#${neighbor.s}`,
            type: "",
            visibility: 'unexplored',
            q: neighbor.q,
            r: neighbor.r,
            s: neighbor.s,
            resourceDensity: 0
          }; // Current depth + 1
          visitedKeys.add(neighborKey); // Mark as visited
          nextFrontier.push(neighbor); // Add to the frontier for the next layer
        }
      });
    });

    // Add the newly found viewable tiles for this layer to the main map
    Object.assign(viewableTilesMap, newViewableFoundInLayer);
    
    // Prepare for the next iteration
    currentFrontier = nextFrontier;

    // If no new tiles were found in the frontier, we can stop early
    if (currentFrontier.length === 0) {
        break;
    }
  }

  // Convert map to array
  return viewableTilesMap;
}