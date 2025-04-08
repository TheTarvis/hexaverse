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
import { Colony, CreateColonyRequest, CreateColonyResponse, ColonyTile } from '@/types/colony';

// API base URL for backend calls
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/hexaverse/us-central1';

// Get auth and firestore instances
const auth = getAuth();
const firestore = getFirestore();

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
    
    // Call the secure API endpoint
    const response = await fetch(`${API_BASE_URL}/getColony?id=${colonyId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Server responded with status: ${response.status}. ${errorData.message || ''}`);
    }
    
    const apiResponse = await response.json();
    
    if (!apiResponse.success) {
      throw new Error(apiResponse.message || 'Failed to fetch colony');
    }
    
    const colony = apiResponse.colony as Colony;
    
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
    
    // Get the current user's ID token
    const idToken = await getAuthToken();
    if (!idToken) {
      throw new Error('Id Token is required to create a colony');
    }
    
    // 1. Call the backend API to generate initial colony data
    const response = await fetch(`${API_BASE_URL}/createColony`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ name: colonyData.name }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Server responded with status: ${response.status}. ${errorData.message || ''}`);
    }
    
    const apiResponse = await response.json();
    const colonyResponse = apiResponse.colony as CreateColonyResponse;
    
    // 2. Save the colony to Firestore
    const coloniesRef = collection(firestore, 'colonies');
    const newColonyRef = doc(coloniesRef);
    
    const newColony: Colony = {
      id: newColonyRef.id,
      uid: colonyData.uid,
      name: colonyResponse.name,
      createdAt: serverTimestamp() as any,
      startCoordinates: colonyResponse.startCoordinates,
      tileIds: colonyResponse.tileIds,
      units: colonyResponse.units,
      unplacedUnits: colonyResponse.unplacedUnits,
      territoryScore: colonyResponse.territoryScore,
      visibilityRadius: colonyResponse.visibilityRadius
    };
    
    await setDoc(newColonyRef, newColony);
    console.log(`Colony created with ID: ${newColony.id}`);
    
    // Return colony with tiles included for immediate use in the client
    return {
      ...newColony,
      tiles: colonyResponse.tiles
    };
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