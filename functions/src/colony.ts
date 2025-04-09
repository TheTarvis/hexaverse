import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Colony, CreateColonyResponse } from "./types/colony";
import { Unit, UnitType, Base, Ship, UnplacedUnit } from "./types/units";
import { authenticatedHttpsOptions, authenticateRequest } from "./middleware/auth";
import { findSpawnLocation as findNoiseBasedSpawnLocation } from "./utils/colonyGeneration";
import { generateInitialTiles, saveTilesToFirestore } from "./utils/tiles/tileOperations";
import { functionConfig, gameConfig } from "./config";

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
 * Example function to get a colony by ID
 */
export const getColony = onRequest(authenticatedHttpsOptions, async (req, res) => {
  try {
    // Authenticate the request and get the user ID
    let uid: string;
    try {
      uid = await authenticateRequest(req);
    } catch (authError) {
      logger.error("Authentication error:", authError);
      res.status(401).json({ 
        success: false,
        message: "Authentication failed"
      });
      return;
    }

    const colonyId = req.query.id as string;
    
    if (!colonyId) {
      res.status(400).json({ 
        success: false,
        message: "Colony ID is required"
      });
      return;
    }
    
    const colonyRef = admin.firestore().collection('colonies').doc(colonyId);
    const colonyDoc = await colonyRef.get();
    
    if (!colonyDoc.exists) {
      res.status(404).json({ 
        success: false,
        message: "Colony not found"
      });
      return;
    }
    
    const colonyData = colonyDoc.data() as Colony;
    
    // Check that the user has permission to access this colony
    if (colonyData.uid !== uid) {
      res.status(403).json({
        success: false,
        message: "You don't have permission to access this colony"
      });
      return;
    }
    
    res.json({ 
      success: true,
      colony: colonyData
    });
  } catch (error) {
    logger.error("Error fetching colony:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching colony"
    });
  }
});

/**
 * Function to create a new colony
 */
export const createColony = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.extendedTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
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