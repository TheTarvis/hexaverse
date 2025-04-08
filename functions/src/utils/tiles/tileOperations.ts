import * as admin from "firebase-admin";
import { ColonyTile } from "../../types/colony";
import { createNoiseGenerator, getNoiseForCoordinates, getTileTypeFromNoise, calculateResourceDensity, TileType } from "../noise";

/**
 * Generate the initial tiles for a new colony
 */
export function generateInitialTiles(
  colonyId: string,
  uid: string,
  startCoords: {q: number, r: number, s: number},
  baseInfluenceRadius: number
): ColonyTile[] {
  const tiles: ColonyTile[] = [];
  
  // Create a noise generator for this colony's tiles
  const noise2D = createNoiseGenerator();
  
  // Helper to create a tile with proper type based on noise
  const createTile = (q: number, r: number, s: number): ColonyTile => {
    // Get noise value at these coordinates
    const noiseValue = getNoiseForCoordinates(noise2D, q, r);
    
    // Determine tile type based on noise
    const tileType = getTileTypeFromNoise(noiseValue);
    
    // Calculate resource density based on tile type and noise
    const resourceDensity = calculateResourceDensity(tileType, noiseValue);
    
    return {
      id: `${q}#${r}#${s}`, // New ID format as per TODO
      q, r, s,
      type: tileType,
      controllerUid: uid,
      visibility: 'visible',
      resourceDensity,
      resources: {}  // Will be populated by resource generation logic
    };
  };
  
  // Add center tile (base location)
  tiles.push({
    ...createTile(startCoords.q, startCoords.r, startCoords.s),
    type: TileType.NORMAL // Use a valid TileType for the base
  });
  
  // Add tiles within influence radius
  for (let dq = -baseInfluenceRadius; dq <= baseInfluenceRadius; dq++) {
    for (let dr = -baseInfluenceRadius; dr <= baseInfluenceRadius; dr++) {
      const ds = -dq - dr;
      // Check if within radius and not the center tile
      if (Math.abs(ds) <= baseInfluenceRadius && 
          !(dq === 0 && dr === 0) &&
          Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds)) <= baseInfluenceRadius) {
        const q = startCoords.q + dq;
        const r = startCoords.r + dr;
        const s = startCoords.s + ds;
        tiles.push(createTile(q, r, s));
      }
    }
  }
  
  return tiles;
}

/**
 * Save tiles to Firestore in a separate collection
 * @param tiles Array of tiles to save
 * @returns Array of tile IDs
 */
export async function saveTilesToFirestore(tiles: ColonyTile[]): Promise<string[]> {
  // Create a batch to handle multiple writes efficiently
  const batch = admin.firestore().batch();
  const tilesCollection = admin.firestore().collection('tiles');
  
  // Track tile IDs for return
  const tileIds: string[] = [];
  
  // Add each tile to the batch
  for (const tile of tiles) {
    const tileRef = tilesCollection.doc(tile.id);
    batch.set(tileRef, tile);
    tileIds.push(tile.id);
  }
  
  // Commit the batch
  await batch.commit();
  
  return tileIds;
}

/**
 * Retrieve tiles by IDs from Firestore
 * @param tileIds Array of tile IDs to retrieve
 * @returns Array of tiles
 */
export async function getTilesByIds(tileIds: string[]): Promise<ColonyTile[]> {
  if (!tileIds.length) return [];
  
  // Firestore can only handle batches of 10 in where in queries
  const tiles: ColonyTile[] = [];
  const batchSize = 10;
  
  for (let i = 0; i < tileIds.length; i += batchSize) {
    const batch = tileIds.slice(i, i + batchSize);
    const tilesRef = admin.firestore().collection('tiles');
    const snapshot = await tilesRef.where(admin.firestore.FieldPath.documentId(), 'in', batch).get();
    
    snapshot.forEach(doc => {
      tiles.push(doc.data() as ColonyTile);
    });
  }
  
  return tiles;
} 