import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  orderBy,
  Timestamp,
  where
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firestore } from '@/config/firebase';
import { RoadmapItem } from '@/contexts/RoadmapContext';
import { getFromCache, saveToCache } from '@/utils/cache';
import logger from '@/utils/logger';

// Constants
const COLLECTION_NAME = 'roadmapItems';
const ROADMAP_CACHE_KEY = 'roadmap_items';
const ROADMAP_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Get Firebase Functions instance
const functions = getFunctions();

// Function references
const addRoadmapItemFunction = httpsCallable(functions, 'addRoadmapItem');
const updateRoadmapItemFunction = httpsCallable(functions, 'updateRoadmapItem');
const deleteRoadmapItemFunction = httpsCallable(functions, 'deleteRoadmapItem');

/**
 * Fetch all roadmap items from Firestore
 * @param options - Optional parameters for controlling fetch behavior
 * @returns Array of roadmap items
 */
export async function fetchRoadmapItems(
  options?: { 
    forceRefresh?: boolean;
  }
): Promise<RoadmapItem[]> {
  // Check cache first if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    const cachedItems = getFromCache<RoadmapItem[]>(ROADMAP_CACHE_KEY, ROADMAP_CACHE_EXPIRY);
    if (cachedItems) {
      logger.debug('Using cached roadmap data');
      return cachedItems;
    }
  }
  
  try {
    logger.info('Fetching roadmap items from Firestore');
    const roadmapRef = collection(firestore, COLLECTION_NAME);
    const q = query(roadmapRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      logger.info('No roadmap items found');
      return [];
    }
    
    const roadmapItems: RoadmapItem[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firestore timestamp to date if needed
      let expectedDate = data.expectedDate || undefined;
      if (expectedDate instanceof Timestamp) {
        expectedDate = expectedDate.toDate().toISOString();
      }
      
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        status: data.status,
        progress: data.progress,
        expectedDate
      };
    });
    
    // Save to cache
    if (typeof window !== 'undefined') {
      saveToCache(ROADMAP_CACHE_KEY, roadmapItems);
    }
    
    return roadmapItems;
  } catch (error) {
    logger.error('Error fetching roadmap items:', error);
    throw error;
  }
}

/**
 * Add a new roadmap item using Cloud Function
 * @param item - The roadmap item to add (without ID)
 * @returns The created roadmap item with an ID
 */
export async function addRoadmapItem(
  item: Omit<RoadmapItem, 'id'>
): Promise<RoadmapItem> {
  try {
    logger.info('Adding roadmap item via Cloud Function');
    
    // Call the Cloud Function
    const result = await addRoadmapItemFunction(item);
    const newItem = result.data as RoadmapItem;
    
    // Clear cache to force refresh on next fetch
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ROADMAP_CACHE_KEY);
    }
    
    return newItem;
  } catch (error) {
    logger.error('Error adding roadmap item:', error);
    throw error;
  }
}

/**
 * Update a roadmap item using Cloud Function
 * @param id - The ID of the roadmap item to update
 * @param updates - The fields to update
 */
export async function updateRoadmapItem(
  id: string,
  updates: Partial<Omit<RoadmapItem, 'id'>>
): Promise<void> {
  try {
    logger.info(`Updating roadmap item ${id} via Cloud Function`);
    
    // Call the Cloud Function
    await updateRoadmapItemFunction({ id, ...updates });
    
    // Clear cache to force refresh on next fetch
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ROADMAP_CACHE_KEY);
    }
  } catch (error) {
    logger.error('Error updating roadmap item:', error);
    throw error;
  }
}

/**
 * Delete a roadmap item using Cloud Function
 * @param id - The ID of the roadmap item to delete
 */
export async function deleteRoadmapItem(id: string): Promise<void> {
  try {
    logger.info(`Deleting roadmap item ${id} via Cloud Function`);
    
    // Call the Cloud Function
    await deleteRoadmapItemFunction({ id });
    
    // Clear cache to force refresh on next fetch
    if (typeof window !== 'undefined') {
      localStorage.removeItem(ROADMAP_CACHE_KEY);
    }
  } catch (error) {
    logger.error('Error deleting roadmap item:', error);
    throw error;
  }
}

/**
 * Fetch roadmap items by status
 * @param status - The status to filter by ('development', 'upcoming', or 'vision')
 * @returns Array of roadmap items with the specified status
 */
export async function fetchRoadmapItemsByStatus(
  status: 'development' | 'upcoming' | 'vision',
  options?: { 
    forceRefresh?: boolean;
  }
): Promise<RoadmapItem[]> {
  const cacheKey = `roadmap_items_${status}`;
  
  // Check cache first if not forcing refresh
  if (!options?.forceRefresh && typeof window !== 'undefined') {
    const cachedItems = getFromCache<RoadmapItem[]>(cacheKey, ROADMAP_CACHE_EXPIRY);
    if (cachedItems) {
      logger.debug(`Using cached roadmap data for status: ${status}`);
      return cachedItems;
    }
  }
  
  try {
    logger.info(`Fetching roadmap items with status: ${status}`);
    const roadmapRef = collection(firestore, COLLECTION_NAME);
    const q = query(
      roadmapRef, 
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      logger.info(`No roadmap items found with status: ${status}`);
      return [];
    }
    
    const roadmapItems: RoadmapItem[] = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert Firestore timestamp to date if needed
      let expectedDate = data.expectedDate || undefined;
      if (expectedDate instanceof Timestamp) {
        // Convert to string format like "Q3 2023" if that's the expected format
        // or use toDate().toISOString() if it should be a date string
        expectedDate = expectedDate.toString();
      }
      
      return {
        id: doc.id,
        title: data.title,
        description: data.description,
        status: data.status,
        progress: data.progress,
        expectedDate
      };
    });
    
    // Save to cache
    if (typeof window !== 'undefined') {
      saveToCache(cacheKey, roadmapItems);
    }
    
    return roadmapItems;
  } catch (error) {
    logger.error(`Error fetching roadmap items with status ${status}:`, error);
    throw error;
  }
} 