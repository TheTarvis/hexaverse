import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Colony } from "./types/colony";
import { Unit, UnitType, Base, Ship, UnplacedUnit } from "./types/units";
import { findSpawnLocation as findNoiseBasedSpawnLocation } from "./utils/colonyGeneration";
import { generateInitialTiles, saveTilesToFirestore } from "./utils/tiles/tileOperations";
import { functionConfig, gameConfig } from "./config";
import { ReadCostTracker } from "./utils/analytics/readCostTracker";

// Use configuration constants from shared config
const {
  minSpawnDistance,
  maxSpawnDistance,
  baseVisibilityRadius,
  tier1BaseInfluence
} = gameConfig.colonySettings;

/**
 * Find a suitable spawn location for a new colony
 * @returns Coordinates for new colony spawn point
 */
async function findSpawnLocation(): Promise<{q: number, r: number, s: number}> {
  // Use the noise-based spawn location finder
  const location = await findNoiseBasedSpawnLocation(minSpawnDistance, maxSpawnDistance);
  
  // If no valid location found, return a random one as a fallback
  if (!location) {
    const q = Math.floor(Math.random() * 20) - 10;
    const r = Math.floor(Math.random() * 20) - 10;
    const s = -q - r;  // Maintain cube coordinate invariant
    return { q, r, s };
  }
  
  return location;
}

/**
 * Create the initial unit package for a new colony
 */
function createInitialUnits(
  colonyId: string,
  uid: string,
  startCoords: {q: number, r: number, s: number}
): Unit[] {
  const units: Unit[] = [];
  
  // Create base
  const base: Base = {
    id: `${colonyId}-base-1`,
    type: UnitType.BASE,
    position: startCoords,
    level: 1,
    ownerUid: uid,
    influenceRadius: tier1BaseInfluence
  };
  units.push(base);
  
  // Create ships
  for (let i = 1; i <= 2; i++) {
    const ship: Ship = {
      id: `${colonyId}-ship-${i}`,
      type: UnitType.SHIP,
      position: startCoords,  // Start at base
      level: 1,
      ownerUid: uid
    };
    units.push(ship);
  }
  
  return units;
}

/**
 * Create unplaced mining site for a new colony
 */
function createUnplacedMiningUnits(): UnplacedUnit[] {
  return [{
    type: UnitType.MINING_SITE,
    level: 1,
    resourceType: 'metal' // Basic resource type for starter mining site
  }];
}

/**
 * Function to create a new colony
 */
export const createColony = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.extendedTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
  console.log('createColony');
  // Create a tracker for this function call
  const tracker = new ReadCostTracker('createColony');
  
  try {
    // Get the authenticated user ID
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be signed in to create a colony');
    }

    // Extract colony name from the request data
    const { name, color } = request.data;
    
    if (!name) {
      throw new HttpsError('invalid-argument', 'Colony name is required');
    }
    
    // Create a document reference with auto-generated ID
    const colonyRef = admin.firestore().collection('colonies').doc();
    
    // Find spawn location
    const startCoordinates = await findSpawnLocation();
    
    // Generate initial tiles
    const tiles = generateInitialTiles(colonyRef.id, uid, startCoordinates, tier1BaseInfluence);
    
    // Save tiles to Firestore in their own collection
    const tileIds = await saveTilesToFirestore(tiles);
    // Track the read costs for tile save 
    tracker.trackRead('saveTilesToFirestore', tiles.length);
    
    // Create initial units
    const units = createInitialUnits(colonyRef.id, uid, startCoordinates);
    
    // Create unplaced mining site
    const unplacedUnits = createUnplacedMiningUnits();
    
    // Create the colony object
    const colony: Colony = {
      id: colonyRef.id,
      uid,
      name,
      color,
      createdAt: new Date(),
      startCoordinates,
      tileIds,
      units,
      unplacedUnits,
      territoryScore: tiles.length,  // Initial score based on controlled tiles
      visibilityRadius: baseVisibilityRadius
    };
    
    // Save to Firestore
    await colonyRef.set(colony);
    
    // Store metrics in Firestore for analysis
    await tracker.storeMetrics();
    
    // Log the read stats instead of including them in the response
    const readSummary = tracker.getSummary();
    logger.info(`[createColony] Read Summary: ${readSummary.total} total reads`);
    
    return {
      success: true,
      message: 'Colony created successfully',
      colony: {
        id: colony.id,
        uid: colony.uid,
        name: colony.name,
        color: colony.color,
        startCoordinates: colony.startCoordinates,
        tileIds: colony.tileIds,
        tiles,  // Include full tile data in response
        units: colony.units,
        unplacedUnits: colony.unplacedUnits,
        territoryScore: colony.territoryScore,
        visibilityRadius: colony.visibilityRadius
      }
    };
  } catch (error) {
    console.error('Error creating colony:', error);
    
    if (error instanceof HttpsError) {
      throw error;  // Re-throw Firebase HttpsError
    }
    
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Unknown error creating colony'
    );
  }
}); 