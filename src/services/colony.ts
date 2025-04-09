/**
 * Colony service for interacting with Firestore
 */
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Colony, CreateColonyRequest, CreateColonyResponse, ColonyTile } from '@/types/colony';
import { callFunction, getFunctionUrl } from '@/utils/api';

// Get auth and firestore instances
const auth = getAuth();
const firestore = getFirestore();
const functions = getFunctions();

// Create callable function references
const createColonyFunction = httpsCallable<
  { name: string, color?: string },
  { success: boolean; colony: CreateColonyResponse; message?: string }
>(functions, 'createColony');

/**
 * Get authentication token for API requests
 * @returns The ID token or throws error if not authenticated
 */
async function getAuthToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be logged in to make authenticated requests');
  }
  
  return currentUser.getIdToken();
}

/**
 * Fetch a user's colony from Firestore
 * @param uid - The user's Firebase UID
 * @returns Colony data or null if not found
 */
export async function fetchUserColony(uid: string): Promise<Colony | null> {
  if (!uid) {
    throw new Error('User ID is required to fetch colony');
  }
  
  try {
    console.log(`Fetching colony for user: ${uid}`);
    const coloniesRef = collection(firestore, 'colonies');
    const q = query(coloniesRef, where('uid', '==', uid));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No colony found for this user');
      return null;
    }
    
    // Take the first colony found
    const colonyDoc = querySnapshot.docs[0];
    const colonyData = colonyDoc.data();
    
    // Convert Firestore timestamp to Date object
    const createdAt = colonyData.createdAt instanceof Timestamp 
      ? colonyData.createdAt.toDate() 
      : colonyData.createdAt;
    
    // Create colony object with tileIds
    const colony: Colony = {
      id: colonyDoc.id,
      uid: colonyData.uid,
      name: colonyData.name,
      createdAt,
      startCoordinates: colonyData.startCoordinates,
      tileIds: colonyData.tileIds || [],
      units: colonyData.units || [],
      unplacedUnits: colonyData.unplacedUnits || [],
      territoryScore: colonyData.territoryScore || 0,
      visibilityRadius: colonyData.visibilityRadius || 0
    };
    
    // Load tiles for the colony
    colony.tiles = await fetchTilesForColony(colony.tileIds);
    
    return colony;
  } catch (error) {
    console.error('Error fetching user colony:', error);
    throw error;
  }
}

/**
 * Fetch tiles for a colony by their IDs
 * @param tileIds - Array of tile IDs to fetch
 * @returns Array of tile objects
 */
export async function fetchTilesForColony(tileIds: string[]): Promise<ColonyTile[]> {
  if (!tileIds.length) return [];
  
  try {
    const tiles: ColonyTile[] = [];
    const tilesRef = collection(firestore, 'tiles');
    
    // Firestore can only handle batches of 10 in where in queries
    const batchSize = 10;
    
    for (let i = 0; i < tileIds.length; i += batchSize) {
      const batch = tileIds.slice(i, i + batchSize);
      const q = query(tilesRef, where('id', 'in', batch));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach(doc => {
        tiles.push(doc.data() as ColonyTile);
      });
    }
    
    return tiles;
  } catch (error) {
    console.error('Error fetching tiles:', error);
    return [];
  }
}

/**
 * Fetch a colony by ID using the secure API endpoint
 * @param colonyId - The ID of the colony to fetch
 * @returns Colony data
 */
export async function fetchColonyById(colonyId: string): Promise<Colony> {
  if (!colonyId) {
    throw new Error('Colony ID is required');
  }
  
  try {
    console.log(`Fetching colony with ID: ${colonyId}`);
    
    // Get auth token
    const idToken = await getAuthToken();
    
    // Call the secure API endpoint using our utility
    const apiResponse = await callFunction<{success: boolean; message?: string; colony: Colony}>(
      'getColony',
      {
        method: 'GET',
        queryParams: { id: colonyId },
        idToken
      }
    );
    
    if (!apiResponse.success) {
      throw new Error(apiResponse.message || 'Failed to fetch colony');
    }
    
    const colony = apiResponse.colony;
    
    // Load tiles if they're not included
    if (!colony.tiles && colony.tileIds && colony.tileIds.length > 0) {
      colony.tiles = await fetchTilesForColony(colony.tileIds);
    }
    
    return colony;
  } catch (error) {
    console.error('Error fetching colony by ID:', error);
    throw error;
  }
}

/**
 * Create a new colony for a user
 * @param colonyData - The colony creation data
 * @returns The created colony data
 */
export async function createColony(colonyData: CreateColonyRequest): Promise<Colony> {
  if (!colonyData.name) {
    throw new Error('Colony name is required');
  }
  
  try {
    console.log(`Creating colony for user: ${colonyData.uid}`);
    
    // Call the Firebase callable function
    const result = await createColonyFunction({ 
      name: colonyData.name,
      color: colonyData.color 
    });
    
    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to create colony');
    }
    
    const responseData = result.data.colony;
    
    // Convert the response to a Colony object
    const colony: Colony = {
      id: responseData.id,
      uid: colonyData.uid, // Use the UID from the request
      name: responseData.name,
      color: responseData.color,
      createdAt: new Date(),
      startCoordinates: responseData.startCoordinates,
      tileIds: responseData.tileIds,
      tiles: responseData.tiles,
      units: responseData.units,
      unplacedUnits: responseData.unplacedUnits,
      territoryScore: responseData.territoryScore,
      visibilityRadius: responseData.visibilityRadius
    };
    
    console.log(`Colony created with ID: ${colony.id}`);
    
    return colony;
  } catch (error) {
    console.error('Error creating colony:', error);
    throw error;
  }
}

/**
 * Check if a user has a colony
 * @param uid - The user's Firebase UID
 * @returns boolean indicating if user has a colony
 */
export async function hasColony(uid: string): Promise<boolean> {
  try {
    const colony = await fetchUserColony(uid);
    return colony !== null;
  } catch (error) {
    console.error('Error checking if user has colony:', error);
    return false;
  }
} 