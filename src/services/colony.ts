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
import { Colony, CreateColonyRequest, CreateColonyResponse, ColonyTile } from '@/types/colony';
import { callFunction, getFunctionUrl } from '@/utils/api';
import { auth, firestore, functions } from '@/config/firebase';

// Create callable function references
const createColonyFunction = httpsCallable<
  { name: string, color?: string },
  { success: boolean; colony: CreateColonyResponse; message?: string }
>(functions, 'createColony');

// Cache configuration
const COLONY_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds
const TILES_CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes in milliseconds

// Cache keys
const getColonyCacheKey = (uid: string) => `colony_${uid}`;
const getTilesCacheKey = (tileIds: string[]) => `tiles_${tileIds.sort().join('_')}`;

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
 * @param options - Optional parameters for controlling fetch behavior
 * @returns Colony data or null if not found
 */
export async function fetchUserColony(
  uid: string, 
  options?: { 
    forceRefresh?: boolean;
    skipTiles?: boolean; // Skip loading tiles initially for faster initial load
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
      
      // If we need to refresh tiles, do that separately while still using cached colony data
      if (options?.forceRefresh && cachedColony.tileIds?.length) {
        // Start loading tiles in the background
        fetchTilesForColony(cachedColony.tileIds, { 
          forceRefresh: true
        }).then(tiles => {
          // Update the cache with new tiles
          if (tiles.length > 0) {
            cachedColony.tiles = tiles;
            saveToCache(cacheKey, cachedColony);
          }
        }).catch(err => {
          console.error('Background tile refresh failed:', err);
        });
      }
      
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
    
    // Load tiles for the colony if not skipped
    if (!options?.skipTiles && colony.tileIds.length > 0) {
      colony.tiles = await fetchTilesForColony(colony.tileIds);
    }
    
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
 * Fetch tiles for a colony by their IDs
 * @param tileIds - Array of tile IDs to fetch
 * @param options - Optional parameters for controlling fetch behavior
 * @returns Array of tile objects
 */
export async function fetchTilesForColony(
  tileIds: string[], 
  options?: { 
    forceRefresh?: boolean;
    onlyTileIds?: string[]; // Only fetch these specific tiles (subset of tileIds)
  }
): Promise<ColonyTile[]> {
  if (!tileIds.length) return [];
  
  // If onlyTileIds is specified, filter the tileIds list
  const tileIdsToFetch = options?.onlyTileIds 
    ? tileIds.filter(id => options.onlyTileIds!.includes(id))
    : tileIds;
    
  if (!tileIdsToFetch.length) return [];
  
  const cacheKey = getTilesCacheKey(tileIdsToFetch);
  
  // Check cache first if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    const cachedTiles = getFromCache<ColonyTile[]>(cacheKey, TILES_CACHE_EXPIRY);
    if (cachedTiles) {
      console.log(`Using ${cachedTiles.length} cached tiles`);
      return cachedTiles;
    }
  }
  
  try {
    const tiles: ColonyTile[] = [];
    const tilesRef = collection(firestore, 'tiles');
    
    // Firestore can only handle batches of 10 in where in queries
    const batchSize = 10;
    
    for (let i = 0; i < tileIdsToFetch.length; i += batchSize) {
      const batch = tileIdsToFetch.slice(i, i + batchSize);
      const q = query(tilesRef, where('id', 'in', batch));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach(doc => {
        tiles.push(doc.data() as ColonyTile);
      });
    }
    
    // Cache all tiles we fetched
    if (typeof window !== 'undefined' && tiles.length > 0) {
      saveToCache(cacheKey, tiles);
    }
    
    return tiles;
  } catch (error) {
    console.error('Error fetching tiles:', error);
    return [];
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