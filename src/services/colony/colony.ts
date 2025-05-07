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
    const coloniesRef = collection(firestore, 'colony/v1/colonies');
    const q = query(coloniesRef, where('uid', '==', uid));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No colony found for this user');
      return null;
    }
    console.log(`Found colony for user: ${uid}`);
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

/**
 * Update the colony cache to include a new tile ID
 * @param uid User ID whose colony to update
 * @param tileId Tile ID to add to the colony
 */
export async function updateColonyCacheWithNewTile(uid: string, tileId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    // Get colony cache key
    const cacheKey = getColonyCacheKey(uid);
    
    // Try to get the colony from cache
    const cachedColonyJson = localStorage.getItem(cacheKey);
    if (!cachedColonyJson) {
      console.log('Colony not found in cache, will be updated on next fetch');
      return;
    }
    
    // Parse the cached colony data
    const cachedData = JSON.parse(cachedColonyJson);
    const colony = cachedData.data;
    
    // Check if the colony has a tileIds array
    if (!colony || !Array.isArray(colony.tileIds)) {
      console.warn('Invalid colony data in cache');
      return;
    }
    
    // Check if tile is already in the colony's tileIds
    if (colony.tileIds.includes(tileId)) {
      console.log(`Tile ${tileId} already exists in colony cache`);
      return;
    }
    
    // Add the new tile ID to the tileIds array
    colony.tileIds.push(tileId);
    
    // Update territory score (optional)
    if (typeof colony.territoryScore === 'number') {
      colony.territoryScore = colony.tileIds.length;
    }
    
    // Update the cache with the modified colony data
    cachedData.data = colony;
    localStorage.setItem(cacheKey, JSON.stringify(cachedData));
    
    console.log(`Updated colony cache with new tile: ${tileId}`);
  } catch (error) {
    console.warn('Error updating colony cache with new tile:', error);
  }
}

/**
 * Remove a tile ID from the colony cache
 * @param uid User ID whose colony to update
 * @param tileId Tile ID to remove from the colony
 */
export async function removeColonyCacheWithTile(uid: string, tileId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  
  try {
    // Get colony cache key
    const cacheKey = getColonyCacheKey(uid);
    
    // Try to get the colony from cache
    const cachedColonyJson = localStorage.getItem(cacheKey);
    if (!cachedColonyJson) {
      console.log('Colony not found in cache, will be updated on next fetch');
      return;
    }
    
    // Parse the cached colony data
    const cachedData = JSON.parse(cachedColonyJson);
    const colony = cachedData.data;
    
    // Check if the colony has a tileIds array
    if (!colony || !Array.isArray(colony.tileIds)) {
      console.warn('Invalid colony data in cache');
      return;
    }
    
    // Check if tile exists in the colony's tileIds
    if (!colony.tileIds.includes(tileId)) {
      console.log(`Tile ${tileId} does not exist in colony cache`);
      return;
    }
    
    // Remove the tile ID from the tileIds array
    colony.tileIds = colony.tileIds.filter((id: string) => id !== tileId);
    
    // Update territory score (optional)
    if (typeof colony.territoryScore === 'number') {
      colony.territoryScore = colony.tileIds.length;
    }
    
    // Update the cache with the modified colony data
    cachedData.data = colony;
    localStorage.setItem(cacheKey, JSON.stringify(cachedData));
    
    console.log(`Removed tile ${tileId} from colony cache`);
  } catch (error) {
    console.warn('Error removing tile from colony cache:', error);
  }
}