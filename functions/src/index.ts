import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Import functions from test-user.ts
import { createTestUser } from "./test-user";

// Initialize Firebase Admin
admin.initializeApp();

// HTTP callable function example
export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.json({
    message: "Hello from Firebase!",
    timestamp: new Date().toISOString(),
  });
});

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

// Example function to count users
export const countUsers = onRequest(async (req, res) => {
  try {
    // First check if the collection exists
    const collectionRef = admin.firestore().collection('users');
    const snapshot = await collectionRef.limit(1).get();
    
    if (snapshot.empty) {
      // Collection exists but is empty, or doesn't exist
      logger.info("Users collection is empty or doesn't exist yet");
      res.json({ 
        count: 0,
        message: "No users found"
      });
      return;
    }
    
    // Collection exists and has documents, get the count
    const countSnapshot = await collectionRef.count().get();
    const count = countSnapshot.data().count;
    
    res.json({ 
      count: count,
      message: `Total users count: ${count}`
    });
  } catch (error) {
    logger.error("Error counting users:", error);
    // Handle the error gracefully
    res.json({ 
      count: 0,
      message: "Error counting users - default to 0. Collection might not exist yet."
    });
  }
});

// Export the createTestUser function
export { createTestUser }; 