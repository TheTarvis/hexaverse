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

/**
 * Get an item from cache with type prefix
 * @param key Base cache key
 * @param type Cache type prefix
 * @param expiryTime Time in ms before cache entry expires
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
    
    if (now - timestamp > expiryTime) {
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
 */
export function saveToCache<T>(key: string, type: string, data: T): void {
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