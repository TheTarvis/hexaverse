import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Constants
const COLLECTION = 'roadmapItems';

/**
 * Verify that the user has admin claim
 * @param request Firebase callable request
 * @returns Whether the user is an admin
 * @throws Unauthorized error if user is not an admin
 */
const verifyAdmin = (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Authentication required'
    );
  }

  // Check for admin claim in the token
  if (!request.auth.token?.admin) {
    throw new HttpsError(
      'permission-denied',
      'Admin privileges required'
    );
  }

  return true;
};

interface RoadmapItemData {
  title: string;
  description: string;
  status: 'development' | 'upcoming' | 'vision';
  progress?: number | null;
  expectedDate?: string | null;
}

interface UpdateRoadmapItemData extends Partial<RoadmapItemData> {
  id: string;
}

interface DeleteRoadmapItemData {
  id: string;
}

/**
 * Add a new roadmap item
 * Requires admin privileges
 */
export const addRoadmapItem = onCall<RoadmapItemData>({ maxInstances: 10 }, async (request) => {
  // Verify admin privileges
  verifyAdmin(request);
  
  const data = request.data;
  logger.info('Adding roadmap item', data);

  try {
    // Validate input data
    if (!data.title || !data.description || !data.status) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required fields: title, description, status'
      );
    }

    // Prepare item data
    const itemData = {
      title: data.title,
      description: data.description,
      status: data.status,
      progress: data.progress || null,
      expectedDate: data.expectedDate || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Add to Firestore
    const docRef = await admin.firestore().collection(COLLECTION).add(itemData);

    // Return the created item with ID
    return {
      id: docRef.id,
      ...itemData,
    };
  } catch (error) {
    logger.error('Error adding roadmap item:', error);
    throw new HttpsError(
      'internal',
      'Failed to add roadmap item',
      error as Error
    );
  }
});

/**
 * Update an existing roadmap item
 * Requires admin privileges
 */
export const updateRoadmapItem = onCall<UpdateRoadmapItemData>({ maxInstances: 10 }, async (request) => {
  // Verify admin privileges
  verifyAdmin(request);
  
  const data = request.data;
  logger.info('Updating roadmap item', data);

  try {
    // Validate input data
    if (!data.id) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required field: id'
      );
    }

    const { id, ...updates } = data;
    
    // Prepare update data
    const updateData = {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Update in Firestore
    const docRef = admin.firestore().collection(COLLECTION).doc(id);
    
    // Check if document exists
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new HttpsError(
        'not-found',
        `Roadmap item with ID ${id} not found`
      );
    }
    
    await docRef.update(updateData);

    // Return success
    return { success: true, id };
  } catch (error) {
    logger.error(`Error updating roadmap item ${data.id}:`, error);
    throw new HttpsError(
      'internal',
      'Failed to update roadmap item',
      error as Error
    );
  }
});

/**
 * Delete a roadmap item
 * Requires admin privileges
 */
export const deleteRoadmapItem = onCall<DeleteRoadmapItemData>({ maxInstances: 10 }, async (request) => {
  // Verify admin privileges
  verifyAdmin(request);
  
  const data = request.data;
  logger.info('Deleting roadmap item', data);

  try {
    // Validate input data
    if (!data.id) {
      throw new HttpsError(
        'invalid-argument',
        'Missing required field: id'
      );
    }

    const { id } = data;
    
    // Delete from Firestore
    const docRef = admin.firestore().collection(COLLECTION).doc(id);
    
    // Check if document exists
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new HttpsError(
        'not-found',
        `Roadmap item with ID ${id} not found`
      );
    }
    
    await docRef.delete();

    // Return success
    return { success: true, id };
  } catch (error) {
    logger.error(`Error deleting roadmap item ${data.id}:`, error);
    throw new HttpsError(
      'internal',
      'Failed to delete roadmap item',
      error as Error
    );
  }
}); 