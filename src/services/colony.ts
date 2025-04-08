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
import { Colony, CreateColonyRequest, CreateColonyResponse } from '@/types/colony';

// API base URL for backend calls
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

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
    
    return {
      id: colonyDoc.id,
      uid: colonyData.uid,
      name: colonyData.name,
      createdAt,
      startCoordinates: colonyData.startCoordinates,
      tiles: colonyData.tiles || []
    };
  } catch (error) {
    console.error('Error fetching user colony:', error);
    throw error;
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
    const response = await fetch(`${API_BASE_URL}/colony?id=${colonyId}`, {
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
    
    return apiResponse.colony as Colony;
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
    const response = await fetch(`${API_BASE_URL}/colony/create`, {
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
      tiles: colonyResponse.tiles
    };
    
    await setDoc(newColonyRef, newColony);
    console.log(`Colony created with ID: ${newColony.id}`);
    
    return newColony;
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