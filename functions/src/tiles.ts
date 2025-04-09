import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { ColonyTile } from "./types/colony";
import { createNoiseGenerator, getNoiseForCoordinates, getTileTypeFromNoise, calculateResourceDensity } from "./utils/noise";
import { functionConfig } from "./config";

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
    
    // Fetch all tiles owned by the user to verify adjacency
    const userTiles = await admin.firestore().collection('tiles')
      .where('controllerUid', '==', uid)
      .get();
    
    // Check if the requested tile is adjacent to at least one existing colony tile
    let isAdjacent = false;
    
    userTiles.forEach(userTileDoc => {
      const userTileData = userTileDoc.data();
      
      // Check if tiles are adjacent (distance = 1)
      const distance = Math.max(
        Math.abs(userTileData.q - q),
        Math.abs(userTileData.r - r),
        Math.abs(userTileData.s - s)
      );
      
      if (distance === 1) {
        isAdjacent = true;
      }
    });
    
    if (!isAdjacent) {
      throw new HttpsError('failed-precondition', 'New tile must be adjacent to your existing colony');
    }
    
    // Start a batch transaction
    const batch = admin.firestore().batch();
    
    // Check if the tile exists in the database first
    const tileRef = admin.firestore().collection('tiles').doc(tileId);
    const tileDoc = await tileRef.get();
    
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