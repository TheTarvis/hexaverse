import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { ColonyTile } from "./types/colony";
import { createNoiseGenerator, getNoiseForCoordinates, getTileTypeFromNoise, calculateResourceDensity } from "./utils/noise";
import { functionConfig } from "./config";
import { ReadCostTracker } from "./utils/analytics/readCostTracker";
import { verifyTileAdjacency } from "./utils/tileHelpers";
import { PubSub } from '@google-cloud/pubsub';

// Initialize PubSub client
const pubSubClient = new PubSub({
  projectId: process.env.PUBSUB_PROJECT_ID || 'hexaverse'
});

// Topic ID for websocket events
const topicName = process.env.PUBSUB_TOPIC_ID || 'websocket-events';

/**
 * Publishes events to PubSub for WebSocket communication
 * @param eventType Type of event to publish
 * @param data Event data payload
 * @param scope Scope of the message ('broadcast' or 'direct')
 * @param recipientId Optional recipient ID for direct messages
 */
async function publishEvent(
  eventType: string, 
  data: any, 
  scope: 'broadcast' | 'direct' = 'broadcast',
  recipientId?: string
): Promise<string> {
  try {
    // Create message payload
    const dataBuffer = Buffer.from(JSON.stringify(data));
    
    // Set message attributes
    const attributes: Record<string, string> = {
      scope,
      eventType
    };
    
    // Add recipient ID for direct messages
    if (scope === 'direct' && recipientId) {
      attributes.recipientId = recipientId;
    }
    
    // Publish to PubSub
    const messageId = await pubSubClient.topic(topicName).publish(dataBuffer, attributes);
    logger.info(`Published ${scope} message to ${topicName} with ID: ${messageId}${recipientId ? `, recipient: ${recipientId}` : ''}`);
    
    return messageId;
  } catch (error) {
    logger.error(`Error publishing ${eventType} event to PubSub:`, error);
    throw error;
  }
}

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
export const addTile = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.defaultTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
  // Create a tracker for this function call
  const tracker = new ReadCostTracker('addTile');
  console.log('addTile');
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
    const coloniesRef = admin.firestore().collection('colonies');
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
    const tileRef = admin.firestore().collection('tiles').doc(tileId);
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
        resources: {}
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
    logger.info(`[addTile] Read Summary: ${readSummary.total} total reads`);
    
    // Prepare event data for PubSub 
    const eventData = {
      type: 'TILE_UPDATED',
      timestamp: Date.now(),
      payloadType: 'tile',
      payload: newTile,
      colonyId: colonyDoc.id,
      userId: uid
    };

    try {
      // Publish broadcast message for tile update
      await publishEvent('TILE_UPDATED', eventData);
      
      // If tile was captured, send a direct notification to the previous owner
      if (capturedFromUid) {
        const tileCaptureLostEvent = {
          type: 'TILE_LOST',
          timestamp: Date.now(),
          payloadType: 'tile',
          payload: newTile,
          capturedBy: uid,
          colonyId: capturedFromColony
        };
        
        // Publish direct message to previous owner
        await publishEvent('TILE_LOST', tileCaptureLostEvent, 'direct', capturedFromUid);
      }
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
        : `Tile added successfully`
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
    logger.error("Error adding/capturing tile:", error);
    
    // If the error is already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }
    
    // Otherwise, wrap it in an HttpsError
    throw new HttpsError(
      'internal',
      error instanceof Error ? error.message : 'Error adding/capturing tile'
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
export const fetchTilesByIds = onCall({
  region: functionConfig.region,
  timeoutSeconds: functionConfig.defaultTimeoutSeconds,
  memory: functionConfig.memory
}, async (request) => {
  // Create a tracker for this function call
  const tracker = new ReadCostTracker('fetchTilesByIds');
  
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
    const tileRefs = tileIds.map(tileId => admin.firestore().doc(`tiles/${tileId}`));
    
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
    logger.error("Error fetching tiles by IDs:", error);
    
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