import * as admin from "firebase-admin";
import { 
  createNoiseGenerator, 
  getNoiseForCoordinates, 
  getTileTypeFromNoise,
  isWithinGalaxy,
  cubeDistance,
  TileType,
  GALAXY_RADIUS
} from './noise';

// Interface for colony locations
interface ColonyLocation {
  uid: string;
  coordinates: {
    q: number;
    r: number;
    s: number;
  };
}

/**
 * Get all existing colony locations from Firestore
 * @returns Array of colony locations
 */
export async function getExistingColonyLocations(): Promise<ColonyLocation[]> {
  try {
    const colonySnapshot = await admin.firestore()
      .collection('colonies')
      .select('uid', 'startCoordinates')
      .get();
    
    return colonySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: data.uid,
        coordinates: data.startCoordinates
      };
    });
  } catch (error) {
    console.error("Error fetching existing colony locations:", error);
    return [];
  }
}

/**
 * Check if a location meets the spawning criteria
 * @param q Q coordinate
 * @param r R coordinate
 * @param s S coordinate
 * @param existingColonies List of existing colony locations
 * @param minDistance Minimum distance from other colonies
 * @param maxDistance Maximum distance from other colonies
 * @returns Boolean indicating if the location is valid for spawning
 */
export function isValidSpawnLocation(
  q: number, 
  r: number, 
  s: number,
  existingColonies: ColonyLocation[],
  minDistance: number,
  maxDistance: number
): boolean {
  // Must be within galaxy bounds
  if (!isWithinGalaxy(q, r, s)) {
    return false;
  }
  
  // If there are no colonies yet, any location within the galaxy is valid
  if (existingColonies.length === 0) {
    return true;
  }
  
  // Check distance constraints
  let tooClose = false;
  let hasNearbyColony = false;
  
  for (const colony of existingColonies) {
    const distance = cubeDistance(
      q, r, s, 
      colony.coordinates.q, 
      colony.coordinates.r, 
      colony.coordinates.s
    );
    
    // Check if too close to an existing colony
    if (distance < minDistance) {
      tooClose = true;
      break;
    }
    
    // Check if there's a colony within the maximum distance
    if (distance <= maxDistance) {
      hasNearbyColony = true;
    }
  }
  
  // Valid location: not too close to any colony AND has at least one colony nearby
  return !tooClose && hasNearbyColony;
}

/**
 * Find a suitable spawn location for a new colony
 * @param existingColonies Array of existing colony locations
 * @param minDistance Minimum distance from other colonies
 * @param maxDistance Maximum distance from other colonies
 * @param attempts Maximum number of attempts to find a location
 * @returns Coordinates for new colony spawn point or null if no valid location found
 */
export async function findSpawnLocation(
  minDistance: number = 8,
  maxDistance: number = 25,
  attempts: number = 100
): Promise<{q: number, r: number, s: number} | null> {
  // Get existing colony locations
  const existingColonies = await getExistingColonyLocations();
  
  // Create noise generator for this session
  const noise2D = createNoiseGenerator();
  
  // Find a valid location
  for (let i = 0; i < attempts; i++) {
    // Generate a random location within galaxy bounds
    const q = Math.floor(Math.random() * GALAXY_RADIUS * 2) - GALAXY_RADIUS;
    const r = Math.floor(Math.random() * GALAXY_RADIUS * 2) - GALAXY_RADIUS;
    const s = -q - r;  // Maintain cube coordinate invariant
    
    // Check if valid location (within bounds and meeting distance requirements)
    if (isValidSpawnLocation(q, r, s, existingColonies, minDistance, maxDistance)) {
      // Get the noise value to determine tile type
      const noiseValue = getNoiseForCoordinates(noise2D, q, r);
      const tileType = getTileTypeFromNoise(noiseValue);
      
      // Don't spawn in barrier tiles
      if (tileType !== TileType.BARRIER) {
        // Prefer star-rich or normal tiles
        if (tileType === TileType.STAR_RICH || tileType === TileType.NORMAL || Math.random() < 0.2) {
          return { q, r, s };
        }
      }
    }
  }
  
  console.log("Failed to find valid spawn location after", attempts, "attempts");
  
  // If no valid location found, return a fallback location
  // This is just to ensure the game doesn't break
  if (existingColonies.length === 0) {
    // First colony - start at the center
    return { q: 0, r: 0, s: 0 };
  } else {
    // Find a distant location from existing colonies
    let bestLocation = { q: 0, r: 0, s: 0 };
    let maxTotalDistance = 0;
    
    for (let i = 0; i < 50; i++) {
      const q = Math.floor(Math.random() * GALAXY_RADIUS * 1.5) - GALAXY_RADIUS * 0.75;
      const r = Math.floor(Math.random() * GALAXY_RADIUS * 1.5) - GALAXY_RADIUS * 0.75;
      const s = -q - r;
      
      if (isWithinGalaxy(q, r, s)) {
        // Calculate total distance from all colonies
        let totalDistance = 0;
        
        for (const colony of existingColonies) {
          totalDistance += cubeDistance(
            q, r, s, 
            colony.coordinates.q, 
            colony.coordinates.r, 
            colony.coordinates.s
          );
        }
        
        if (totalDistance > maxTotalDistance) {
          maxTotalDistance = totalDistance;
          bestLocation = { q, r, s };
        }
      }
    }
    
    return bestLocation;
  }
} 