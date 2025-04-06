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
import { firestore } from '@/config/firebase';
import { Colony, CreateColonyRequest, CreateColonyResponse } from '@/types/colony';

// API base URL for backend calls
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081';

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
 * Create a new colony for a user
 * @param colonyData - The colony creation data
 * @returns The created colony data
 */
export async function createColony(colonyData: CreateColonyRequest): Promise<Colony> {
  if (!colonyData.uid) {
    throw new Error('User ID is required to create a colony');
  }
  
  if (!colonyData.name) {
    throw new Error('Colony name is required');
  }
  
  try {
    console.log(`Creating colony for user: ${colonyData.uid}`);
    
    // 1. Call the backend API to generate initial colony data
    const response = await fetch(`${API_BASE_URL}/colony/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: colonyData.name }),
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }
    
    const apiResponse: CreateColonyResponse = await response.json();
    
    // 2. Save the colony to Firestore
    const coloniesRef = collection(firestore, 'colonies');
    const newColonyRef = doc(coloniesRef);
    
    const newColony: Colony = {
      id: newColonyRef.id,
      uid: colonyData.uid,
      name: apiResponse.name,
      createdAt: serverTimestamp() as any,
      startCoordinates: apiResponse.startCoordinates,
      tiles: apiResponse.tiles
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