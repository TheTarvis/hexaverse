import * as admin from 'firebase-admin'
import * as logger from 'firebase-functions/logger'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { functionConfig } from './config'
import { Tile } from './types/base'
import { ReadCostTracker } from './utils/analytics/readCostTracker'
import { publishEvent, EventType } from './utils/pubsub'

export const DRAWING_EVENTS_TOPIC = 'drawing-events'
export const DRAWING_TILES_COLLECTION = 'drawing/v1/tiles'

/**
 * Fetches all drawing tiles that have been updated since the given timestamp
 * 
 * This function is primarily used for reconnection scenarios:
 * 1. Client stores the timestamp of their last received tile update
 * 2. When client reconnects, they send this timestamp
 * 3. Function returns all tiles updated at or after that timestamp
 * 4. This ensures client receives all updates they missed while disconnected
 * 
 * If no timestamp is provided, returns all drawing tiles by using Unix epoch as default
 *
 * Should not be warmed up
 *
 * Required Firestore indexes:
 * - Collection: drawing/v1/tiles
 *   Fields: updatedAt ASC
 */
export const fetchDrawingTilesAfterTimestamp = onCall(
  {
    region: functionConfig.region,
    timeoutSeconds: functionConfig.defaultTimeoutSeconds,
    memory: functionConfig.memory,
  },
  async (request): Promise<{ success: boolean; tiles: Tile[] }> => {
    // Create a tracker for this function call
    const tracker = new ReadCostTracker('fetchDrawingTilesAfterTimestamp')
    console.log('fetchDrawingTilesAfterTimestamp')

    try {
      // Get the timestamp from the request, default to Unix epoch if not provided
      const timestamp = request.data?.timestamp || new Date(0).toISOString()
      logger.info(`Using timestamp: ${timestamp}`)

      // Create a query for drawing tiles
      const tilesRef = admin.firestore().collection(DRAWING_TILES_COLLECTION)

      // Query for tiles updated after or at the timestamp
      const snapshot = await tilesRef.where('updatedAt', '>=', timestamp).get()
      tracker.trackRead('drawingTilesQuery', snapshot.size)

      // Convert the documents to tiles
      const tiles = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          }) as Tile
      )

      logger.info(`Fetched ${tiles.length} drawing tiles since ${timestamp}`)

      return {
        success: true,
        tiles,
      }
    } catch (error) {
      logger.error('Error fetching drawing tiles:', error)
      throw new HttpsError('internal', 'Failed to fetch drawing tiles')
    }
  }
)

/**
 * Updates a drawing tile with new data
 * This function:
 * 1. Validates the user is authenticated
 * 2. Validates tile coordinates
 * 3. Updates the tile in Firestore
 * 4. Publishes the update to WebSocket clients
 *
 * Should not be warmed up
 */
export const sendDrawingTileUpdate = onCall(
  {
    region: functionConfig.region,
    timeoutSeconds: functionConfig.defaultTimeoutSeconds,
    memory: functionConfig.memory,
  },
  async (request): Promise<{ success: boolean; tile: Tile }> => {
    // Create a tracker for this function call
    const tracker = new ReadCostTracker('sendDrawingTileUpdate')

    try {
      // Authenticate the request and get the user ID
      const uid = request.auth?.uid
      if (!uid) {
        throw new HttpsError('unauthenticated', 'User must be signed in to update a tile')
      }

      // Extract coordinates and color from request data
      const { q, r, s, color } = request.data

      // Validate coordinates
      if (q === undefined || r === undefined || s === undefined) {
        throw new HttpsError('invalid-argument', 'Coordinates (q, r, s) are required')
      }

      // Validate cube coordinate constraint: q + r + s must equal 0
      if (q + r + s !== 0) {
        throw new HttpsError('invalid-argument', 'Invalid coordinates: q + r + s must equal 0')
      }

      // Validate color
      if (!color || typeof color !== 'string' || !color.match(/^#[0-9A-Fa-f]{6}$/)) {
        throw new HttpsError('invalid-argument', 'Valid hex color is required')
      }

      // Create the tile ID
      const tileId = `${q}#${r}#${s}`

      // Get current timestamp
      const now = new Date().toISOString()

      // Prepare the tile data
      const tileData: Tile = {
        id: tileId,
        q,
        r,
        s,
        controllerUid: uid,
        color,
        updatedAt: now,
      }

      // Update the tile in Firestore
      const tileRef = admin.firestore().collection(DRAWING_TILES_COLLECTION).doc(tileId)
      await tileRef.set(tileData, { merge: true })
      tracker.trackWrite('tileUpdate', 1)

      // Publish the update to WebSocket clients
      await publishEvent(EventType.TILE_UPDATED, tileData, DRAWING_EVENTS_TOPIC)

      logger.info(`Updated drawing tile ${tileId} for user ${uid}`)

      return {
        success: true,
        tile: tileData,
      }
    } catch (error) {
      logger.error('Error updating drawing tile:', error)
      throw new HttpsError('internal', 'Failed to update drawing tile')
    }
  }
)
