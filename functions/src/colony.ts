import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Colony, CreateColonyResponse, ColonyTile } from "./types/colony";
import { Unit, UnitType, Base, Ship, UnplacedUnit } from "./types/units";
import { authenticatedHttpsOptions, authenticateRequest } from "./middleware/auth";
import { findSpawnLocation as findNoiseBasedSpawnLocation } from "./utils/colonyGeneration";
import { 
  createNoiseGenerator, 
  getNoiseForCoordinates, 
  getTileTypeFromNoise, 
  calculateResourceDensity,
  TileType 
} from "./utils/noise";

// Configuration constants
const MIN_SPAWN_DISTANCE = 8;  // Minimum tiles between colonies
const MAX_SPAWN_DISTANCE = 25; // Maximum tiles between colonies
const BASE_VISIBILITY_RADIUS = 4;
const TIER1_BASE_INFLUENCE = 3;

/**
 * Find a suitable spawn location for a new colony
 * @returns Coordinates for new colony spawn point
 */
async function findSpawnLocation(): Promise<{q: number, r: number, s: number}> {
  // Use the noise-based spawn location finder
  const location = await findNoiseBasedSpawnLocation(MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE);
  
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
 * Generate the initial tiles for a new colony
 */
function generateInitialTiles(
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
    influenceRadius: TIER1_BASE_INFLUENCE
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
export const createColony = onRequest(authenticatedHttpsOptions, async (req, res) => {
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

    // Extract request data (only need name now, uid comes from auth token)
    const { name } = req.body;
    
    if (!name) {
      res.status(400).json({ 
        success: false,
        message: "Colony name is required"
      });
      return;
    }
    
    // Create a document reference with auto-generated ID
    const colonyRef = admin.firestore().collection('colonies').doc();
    
    // Find spawn location
    const startCoordinates = await findSpawnLocation();
    
    // Generate initial tiles
    const tiles = generateInitialTiles(colonyRef.id, uid, startCoordinates, TIER1_BASE_INFLUENCE);
    
    // Create initial units
    const units = createInitialUnits(colonyRef.id, uid, startCoordinates);
    
    // Create unplaced mining site
    const unplacedUnits = createUnplacedMiningUnits();
    
    // Create the colony object
    const colony: Colony = {
      id: colonyRef.id,
      uid,
      name,
      createdAt: new Date(),
      startCoordinates,
      tiles,
      units,
      unplacedUnits,
      territoryScore: tiles.length,  // Initial score based on controlled tiles
      visibilityRadius: BASE_VISIBILITY_RADIUS
    };
    
    // Use the same Date object instead of serverTimestamp in emulator environment
    // This avoids the "Cannot read properties of undefined (reading 'serverTimestamp')" error
    const colonyForFirestore = {
      ...colony
    };
    
    // Save to Firestore
    await colonyRef.set(colonyForFirestore);
    
    // Create response object
    const response: CreateColonyResponse = {
      id: colonyRef.id,
      name,
      startCoordinates,
      tiles,
      units,
      unplacedUnits,
      territoryScore: tiles.length,
      visibilityRadius: BASE_VISIBILITY_RADIUS
    };
    
    res.json({ 
      success: true,
      colony: response
    });
  } catch (error) {
    logger.error("Error creating colony:", error);
    res.status(500).json({ 
      success: false,
      message: "Error creating colony"
    });
  }
}); 