import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Import functions from other files
import { createColony } from "./colony";
import { addTile } from "./tiles";

// Initialize Firebase Admin
admin.initializeApp();

// Firestore trigger function example
// This function will be triggered when a new document is created in the 'messages' collection
// It will take the 'original' field and create an uppercase version in the same document
export const makeUppercase = onDocumentCreated("messages/{documentId}", (event) => {
  // Check if data exists
  if (!event.data) {
    logger.error("No data found in event");
    return null;
  }

  // Get the data from the document
  const data = event.data.data();
  
  // Check if the data has an 'original' field
  if (!data.original) {
    logger.error("No original field found");
    return null;
  }
  
  const original = data.original;
  logger.info("Uppercasing", event.params.documentId, original);
  
  // Convert to uppercase
  const uppercase = original.toUpperCase();
  
  // Update the document with the uppercase field
  return event.data.ref.set({ uppercase }, { merge: true });
});

// Export functions from other files
export {
  createColony,
  addTile
}; 