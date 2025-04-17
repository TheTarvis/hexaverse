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
import { httpsCallable } from 'firebase/functions';
import { Colony, CreateColonyRequest, CreateColonyResponse } from '@/types/colony';
import { Tile } from '@/types/tiles';
import { callFunction, getFunctionUrl } from '@/utils/api';
import { auth, firestore, functions } from '@/config/firebase';
import {useAuth} from "@/contexts/AuthContext";

// Create callable function references
const createColonyFunction = httpsCallable<
  { name: string, color?: string },
  { success: boolean; colony: CreateColonyResponse; message?: string }
>(functions, 'createColony');

// Cache configuration
const COLONY_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

// Cache keys
const getColonyCacheKey = (uid: string) => `colony_${uid}`;

// Cache utility functions
interface CachedData<T> {
  data: T;
  timestamp: number;
}

function getFromCache<T>(key: string, expiryTime: number): T | null {
  try {
    const cachedItem = localStorage.getItem(key);
    if (!cachedItem) return null;
    
    const { data, timestamp }: CachedData<T> = JSON.parse(cachedItem);
    const now = Date.now();
    
    if (now - timestamp > expiryTime) {
      // Cache expired
      localStorage.removeItem(key);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn('Error reading from cache:', error);
    return null;
  }
}

function saveToCache<T>(key: string, data: T): void {
  try {
    const cacheItem: CachedData<T> = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheItem));
  } catch (error) {
    console.warn('Error saving to cache:', error);
  }
}

/**
 * Fetch a user's colony from Firestore
 * @param uid - The user's Firebase UID
 * @param options - Optional parameters for controlling fetch behavior
 * @returns Colony data or null if not found
 */
export async function fetchUserColony(
  uid: string, 
  options?: { 
    forceRefresh?: boolean;
  }
): Promise<Colony | null> {
  if (!uid) {
    throw new Error('User ID is required to fetch colony');
  }
  
  const cacheKey = getColonyCacheKey(uid);
  
  // Check cache first if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    const cachedColony = getFromCache<Colony>(cacheKey, COLONY_CACHE_EXPIRY);
    if (cachedColony) {
      console.log(`Using cached colony data for user: ${uid}`);
      return cachedColony;
    }
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
      color: colonyData.color,
      createdAt,
      startCoordinates: colonyData.startCoordinates,
      tileIds: colonyData.tileIds || [],
      units: colonyData.units || [],
      unplacedUnits: colonyData.unplacedUnits || [],
      territoryScore: colonyData.territoryScore || 0,
      visibilityRadius: colonyData.visibilityRadius || 0
    };

    // Save to cache
    if (typeof window !== 'undefined') {
      saveToCache(cacheKey, colony);
    }
    
    return colony;
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
 * Invalidate colony cache for a specific user
 * Use this when colony data changes from server-side events
 * @param uid User ID to invalidate cache for
 */
export function invalidateColonyCache(uid: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheKey = getColonyCacheKey(uid);
    localStorage.removeItem(cacheKey);
    console.log(`Invalidated colony cache for user: ${uid}`);
  } catch (error) {
    console.warn('Error invalidating colony cache:', error);
  }
}