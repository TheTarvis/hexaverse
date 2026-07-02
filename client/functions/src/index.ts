import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Import functions from other files
import { createColony } from "./colony";
import { addColonyTile, COLONY_EVENTS_TOPIC, fetchColonyTilesByIds } from "./colonyTiles";
import { addRoadmapItem, updateRoadmapItem, deleteRoadmapItem } from "./roadmap";
import { submitSupportRequest } from "./support";
import { fetchDrawingTilesAfterTimestamp, sendDrawingTileUpdate, DRAWING_EVENTS_TOPIC } from "./drawingTiles";
import { createTopicIfNotExists } from "./utils/pubsub";

// Initialize Firebase Admin
admin.initializeApp();

// Create required topics during initialization
createTopicIfNotExists(DRAWING_EVENTS_TOPIC).catch(error => {
  logger.error('Failed to create drawing-events topic:', error);
});

createTopicIfNotExists(COLONY_EVENTS_TOPIC).catch(error => {
  logger.error('Failed to create colony-events topic:', error);
});

// Export functions from other files
export {
  createColony,
  addColonyTile,
  fetchColonyTilesByIds,
  addRoadmapItem,
  updateRoadmapItem,
  deleteRoadmapItem,
  submitSupportRequest,
  fetchDrawingTilesAfterTimestamp,
  sendDrawingTileUpdate
}; 