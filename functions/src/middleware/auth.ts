import { HttpsOptions } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Configuration for authenticated endpoints
export const authenticatedHttpsOptions: HttpsOptions = {
  cors: true,
  region: "us-central1"
};

// Middleware for authenticating requests
export const authenticateRequest = async (req: any): Promise<string> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    logger.error("Error verifying ID token:", error);
    throw new Error('Invalid or expired authentication token');
  }
}; 