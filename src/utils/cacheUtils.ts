/**
 * Centralized cache utilities for the application
 */

// Types for cached data
interface CachedItem<T> {
  data: T;
  timestamp: number;
}

// Configuration
export const DEFAULT_CACHE_EXPIRY = 10 * 60 * 1000; // 10 minutes
export const NO_EXPIRY = -1; // Special value to indicate no expiration

/**
 * Get an item from cache with type prefix
 * @param key Base cache key
 * @param type Cache type prefix
 * @param expiryTime Time in ms before cache entry expires. Use NO_EXPIRY for no expiration.
 * @returns The cached data or null if not found/expired
 */
export function getFromCache<T>(key: string, type: string, expiryTime: number = DEFAULT_CACHE_EXPIRY): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const prefixedKey = `${type}_${key}`;
    const cachedItem = localStorage.getItem(prefixedKey);
    if (!cachedItem) return null;
    
    const { data, timestamp } = JSON.parse(cachedItem) as CachedItem<T>;
    const now = Date.now();
    
    // Skip expiry check if NO_EXPIRY is set
    if (expiryTime !== NO_EXPIRY && now - timestamp > expiryTime) {
      // Cache expired
      localStorage.removeItem(prefixedKey);
      return null;
    }
    
    return data;
  } catch (error) {
    console.warn(`Error reading from ${type} cache:`, error);
    return null;
  }
}

/**
 * Save an item to cache with type prefix
 * @param key Base cache key
 * @param type Cache type prefix
 * @param data Data to cache
 * @param expiryTime Optional expiry time in ms. Use NO_EXPIRY for no expiration.
 */
export function saveToCache<T>(key: string, type: string, data: T, expiryTime: number = DEFAULT_CACHE_EXPIRY): void {
  if (typeof window === 'undefined') return;
  
  try {
    const prefixedKey = `${type}_${key}`;
    const cacheItem: CachedItem<T> = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(prefixedKey, JSON.stringify(cacheItem));
  } catch (error) {
    console.warn(`Error saving to ${type} cache:`, error);
  }
}

/**
 * Clear all cache entries with a specific prefix
 * @param prefix The prefix to match for clearing
 * @returns Number of cleared cache entries
 */
export function clearCacheByPrefix(prefix: string): number {
  if (typeof window === 'undefined') return 0;

  try {
    let clearedCount = 0;
    const keysToRemove: string[] = [];
    
    // Find all cache keys with the given prefix
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all found keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    
    return clearedCount;
  } catch (error) {
    console.warn(`Error clearing cache with prefix ${prefix}:`, error);
    return 0;
  }
}

/**
 * Get all items from cache with a specific prefix
 * @param prefix The prefix to match for retrieval
 * @param expiryTime Time in ms before cache entry expires. Use NO_EXPIRY for no expiration.
 * @returns Array of all cached items with the given prefix
 */
export function getAllByPrefix<T>(prefix: string, expiryTime: number = DEFAULT_CACHE_EXPIRY): T[] {
  if (typeof window === 'undefined') return [];

  try {
    const items: T[] = [];
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    // Find all cache keys with the given prefix
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const cachedItem = localStorage.getItem(key);
          if (cachedItem) {
            const { data, timestamp } = JSON.parse(cachedItem) as CachedItem<T>;
            
            // Skip expiry check if NO_EXPIRY is set
            if (expiryTime !== NO_EXPIRY && now - timestamp > expiryTime) {
              // Cache expired, mark for removal
              keysToRemove.push(key);
            } else {
              items.push(data);
            }
          }
        } catch (error) {
          console.warn(`Error parsing cached item ${key}:`, error);
          keysToRemove.push(key); // Remove corrupted entries
        }
      }
    }
    
    // Remove expired or corrupted keys
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    return items;
  } catch (error) {
    console.warn(`Error getting all items with prefix ${prefix}:`, error);
    return [];
  }
} 