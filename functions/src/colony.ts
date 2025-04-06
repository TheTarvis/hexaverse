import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { Colony, CreateColonyRequest, CreateColonyResponse } from "./types/colony";

/**
 * Example function to get a colony by ID
 */
export const getColony = onRequest(async (req, res) => {
  try {
    const colonyId = req.query.id as string;
    
    if (!colonyId) {
      res.status(400).json({ 
        success: false,
        message: "Colony ID is required"
      });
      return;
    }
    
    const colonyRef = admin.firestore().collection('colonies').doc(colonyId);
    const colonyDoc = await colonyRef.get();
    
    if (!colonyDoc.exists) {
      res.status(404).json({ 
        success: false,
        message: "Colony not found"
      });
      return;
    }
    
    const colonyData = colonyDoc.data() as Colony;
    
    res.json({ 
      success: true,
      colony: colonyData
    });
  } catch (error) {
    logger.error("Error fetching colony:", error);
    res.status(500).json({ 
      success: false,
      message: "Error fetching colony"
    });
  }
});

/**
 * Function to create a new colony
 */
export const createColony = onRequest(async (req, res) => {
  try {
    // Extract request data
    const { name, uid } = req.body as CreateColonyRequest;
    
    if (!name || !uid) {
      res.status(400).json({ 
        success: false,
        message: "Colony name and user ID are required"
      });
      return;
    }
    
    // Create a document reference with auto-generated ID
    const colonyRef = admin.firestore().collection('colonies').doc();
    
    // Initialize with starting tile at 0,0,0
    const startingTile = {
      id: `${colonyRef.id}-0-0-0`,
      q: 0,
      r: 0,
      s: 0,
      type: "base"
    };
    
    // Create the colony object
    const colony: Colony = {
      id: colonyRef.id,
      uid,
      name,
      createdAt: new Date(),
      startCoordinates: {
        q: 0,
        r: 0,
        s: 0
      },
      tiles: [startingTile]
    };
    
    // Add server timestamp when saving to Firestore
    const colonyForFirestore = {
      ...colony,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    await colonyRef.set(colonyForFirestore);
    
    // Create response object
    const response: CreateColonyResponse = {
      id: colonyRef.id,
      name,
      startCoordinates: {
        q: 0,
        r: 0,
        s: 0
      },
      tiles: [startingTile]
    };
    
    res.json({ 
      success: true,
      colony: response
    });
  } catch (error) {
    logger.error("Error creating colony:", error);
    res.status(500).json({ 
      success: false,
      message: "Error creating colony"
    });
  }
}); 