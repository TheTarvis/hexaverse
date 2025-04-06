import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";

// No need to initialize Firebase Admin here as it's already done in index.ts

/**
 * Helper function to add a test user to Firestore
 */
export async function addTestUser() {
  try {
    const userRef = admin.firestore().collection('users').doc('test-user-1');
    
    await userRef.set({
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date().toISOString(), // Simple ISO string timestamp
      serverCreatedAt: FieldValue.serverTimestamp() // Using proper server timestamp
    });
    
    logger.info('Test user added successfully');
    return { success: true };
  } catch (error) {
    logger.error('Error adding test user:', error);
    return { success: false, error };
  }
}

// Create an HTTP function to add a test user for easy testing
export const createTestUser = onRequest(async (req, res) => {
  const result = await addTestUser();
  res.json(result);
}); 