import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { ColonyTile } from "./types/colony";
import { createNoiseGenerator, getNoiseForCoordinates, getTileTypeFromNoise, calculateResourceDensity } from "./utils/noise";
import { functionConfig } from "./config";
import { ReadCostTracker } from "./utils/analytics/readCostTracker";
import { verifyTileAdjacency } from "./utils/tileHelpers";
import { publishEvent, EventType } from "./utils/pubsub";

export const COLONY_EVENTS_TOPIC = 'colony-events'

/**
 * Function to add a tile to a user's colony
 * 
 * This function:
 * 1. Authenticates the user
 * 2. Validates that the requested tile is adjacent to the user's colony
 * 3. Creates or captures a tile with the appropriate properties
 * 4. Updates the colony with the new tile ID
 * 5. Returns the new/captured tile
 */
export const addColonyTile = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.defaultTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
  // Handle warmup requests immediately
  if (request.data?.warmup === true) {
    logger.info('Handling warmup request for addColonyTile function');
    return { success: true, message: 'Warmup request handled' };
  }

  // Create a tracker for this function call
  const tracker = new ReadCostTracker('addColonyTile');

  try {
    // Authenticate the request and get the user ID
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be signed in to add a tile');
    }

    // Extract coordinates from request data
    const { q, r, s } = request.data;
    
    // Validate coordinates
    if (q === undefined || r === undefined || s === undefined) {
      throw new HttpsError('invalid-argument', 'Coordinates (q, r, s) are required');
    }
    
    // Validate cube coordinate constraint: q + r + s must equal 0
    if (q + r + s !== 0) {
      throw new HttpsError('invalid-argument', 'Invalid coordinates: q + r + s must equal 0');
    }
    
    // Fetch the user's colony
    const coloniesRef = admin.firestore().collection('colony/v1/colonies');
    const colonyQuery = await coloniesRef.where('uid', '==', uid).get();
    tracker.trackRead('colonyQuery', colonyQuery.size);
    
    if (colonyQuery.empty) {
      throw new HttpsError('not-found', 'No colony found for this user');
    }
    
    // Get the first colony (users should only have one)
    const colonyDoc = colonyQuery.docs[0];
    const colonyData = colonyDoc.data();
    
    // Create the tile ID
    const tileId = `${q}#${r}#${s}`;
    
    // Check if the tile already exists in the colony
    if (colonyData.tileIds && colonyData.tileIds.includes(tileId)) {
      throw new HttpsError('already-exists', 'This tile is already part of your colony');
    }
    
    // Use the helper function to verify adjacency instead of fetching all tiles
    verifyTileAdjacency(q, r, s, colonyData.tileIds || []);
    
    // Start a batch transaction
    const batch = admin.firestore().batch();
    
    // Check if the tile exists in the database first
    const tileRef = admin.firestore().collection('colony/v1/tiles').doc(tileId);
    const tileDoc = await tileRef.get();
    tracker.trackRead('tileDocGet', 1);
    
    let newTile: ColonyTile;
    let capturedFromUid: string | null = null;
    let capturedFromColony: string | null = null;
    
    if (tileDoc.exists) {
      const tileData = tileDoc.data() as ColonyTile;
      
      // Record the previous owner for history/notifications
      if (tileData.controllerUid && tileData.controllerUid !== uid) {
        capturedFromUid = tileData.controllerUid;
        
        // Find the colony the tile belonged to
        const previousColonyQuery = await coloniesRef.where('uid', '==', capturedFromUid).get();
        tracker.trackRead('previousColonyQuery', previousColonyQuery.size);
        
        if (!previousColonyQuery.empty) {
          const previousColonyDoc = previousColonyQuery.docs[0];
          capturedFromColony = previousColonyDoc.id;
          
          // Remove the tile from the previous colony's tileIds array
          const previousColonyData = previousColonyDoc.data();
          const updatedPreviousTileIds = (previousColonyData.tileIds || []).filter(
            (id: string) => id !== tileId
          );
          
          // Update the previous colony document
          batch.update(previousColonyDoc.ref, { 
            tileIds: updatedPreviousTileIds,
            territoryScore: updatedPreviousTileIds.length
          });
        }
      }
      
      // Update the existing tile with the new controller
      newTile = {
        ...tileData,
        controllerUid: uid,
        visibility: 'visible', // Ensure it's visible to the new owner
      };
      
      batch.update(tileRef, { controllerUid: uid, visibility: 'visible' });
    } else {
      // Generate tile properties for a new tile
      const noise2D = createNoiseGenerator();
      const noiseValue = getNoiseForCoordinates(noise2D, q, r);
      const tileType = getTileTypeFromNoise(noiseValue);
      const resourceDensity = calculateResourceDensity(tileType, noiseValue);
      
      // Create a new tile
      newTile = {
        id: tileId,
        q, r, s,
        type: tileType,
        controllerUid: uid,
        visibility: 'visible',
        resourceDensity,
        resources: {},
        color: '#000000', // Default color
        updatedAt: new Date().toISOString()
      };
      
      // Add the new tile to the 'tiles' collection
      batch.set(tileRef, newTile);
    }
    
    // Update the user's colony with the new tile ID
    const updatedTileIds = [...(colonyData.tileIds || []), tileId];
    batch.update(colonyDoc.ref, { 
      tileIds: updatedTileIds,
      territoryScore: updatedTileIds.length
    });
    
    // Commit the batch
    await batch.commit();
    
    // Store metrics in Firestore for analysis
    await tracker.storeMetrics();
    
    // Log the read stats instead of including them in the response
    const readSummary = tracker.getSummary();
    logger.info(`[addColonyTile] Read Summary: ${readSummary.total} total reads`);
    
    // Prepare event data for PubSub 
    const eventData = {
      type: EventType.TILE_UPDATED,
      timestamp: Date.now(),
      payloadType: 'tile',
      payload: newTile,
      colonyId: colonyDoc.id,
      userId: uid
    };

    try {
      // Publish broadcast message for tile update
      await publishEvent(EventType.TILE_UPDATED, eventData, COLONY_EVENTS_TOPIC);

    } catch (pubsubError) {
      // Log the error but don't fail the function
      logger.error("Error publishing to PubSub:", pubsubError);
    }

    // Return success with the new or captured tile
    const response = {
      success: true,
      tile: newTile,
      message: capturedFromUid 
        ? `Tile captured successfully from another colony` 
        : `Tile added successfully to colony`
    };
    
    // Add capture information if applicable
    if (capturedFromUid) {
      Object.assign(response, {
        captured: true,
        previousOwner: capturedFromUid,
        previousColony: capturedFromColony
      });
    }
    
    return response;
  } catch (error) {
    logger.error("Error adding/capturing colony tile:", error);
    
    // If the error is already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // Otherwise, wrap it in an HttpsError
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Error adding/capturing colony tile'
    );
  }
});

/**
 * Function to fetch multiple tiles by their IDs
 * 
 * This function:
 * 1. Validates the request contains an array of tile IDs
 * 2. Fetches all tiles in a single batch
 * 3. Returns the array of tiles
 */
export const fetchColonyTilesByIds = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.defaultTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
  // Create a tracker for this function call
  const tracker = new ReadCostTracker('fetchColonyTilesByIds');
  
  try {
    // Authenticate the request and get the user ID
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'User must be signed in to fetch tiles');
    }

    // Extract tile IDs from request data
    const { tileIds } = request.data;
    
    // Validate tile IDs array
    if (!tileIds || !Array.isArray(tileIds) || tileIds.length === 0) {
      throw new HttpsError('invalid-argument', 'A non-empty array of tile IDs is required');
    }
    
    // Limit the number of tiles that can be fetched at once
    // if (tileIds.length > 100) {
    //   throw new HttpsError('invalid-argument', 'Cannot fetch more than 100 tiles at once');
    // }

    // Get document references for all tile IDs
    const tileRefs = tileIds.map(tileId => admin.firestore().doc(`colony/v1/tiles/${tileId}`));
    
    // Fetch all documents in a single batch
    const tileSnapshots = await admin.firestore().getAll(...tileRefs);
    
    // Track read count
    tracker.trackRead('tilesDocs', tileSnapshots.length);
    
    // Convert snapshots to tile data, filtering out any that don't exist
    const tiles = tileSnapshots
      .filter(snapshot => snapshot.exists)
      .map(snapshot => snapshot.data() as ColonyTile);
    
    // Store metrics in Firestore for analysis
    await tracker.storeMetrics();
    
    // Log the read stats
    const readSummary = tracker.getSummary();
    logger.info(`[fetchTilesByIds] Read Summary: ${readSummary.total} total reads`);
    
    // Return the tiles
    return {
      success: true,
      tiles,
      count: tiles.length
    };
  } catch (error) {
    logger.error("Error fetching colony tiles by IDs:", error);
    
    // If the error is already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // Otherwise, wrap it in an HttpsError
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Error fetching tiles by IDs'
    );
  }
}); 