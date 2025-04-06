import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

/**
 * Function to count total users in the database
 */
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