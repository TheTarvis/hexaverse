/**
 * Simple caching utility for storing and retrieving data from localStorage with expiration.
 */

import logger from '@/utils/logger';

interface CacheItem<T> {
  data: T;
  expiry: number;
}

/**
 * Save data to localStorage with an expiration time
 * @param key - Storage key
 * @param data - Data to store
 * @param expiryMs - Optional expiry time in milliseconds (defaults to 1 hour)
 */
export function saveToCache<T>(key: string, data: T, expiryMs: number = 60 * 60 * 1000): void {
  try {
    const item: CacheItem<T> = {
      data,
      expiry: Date.now() + expiryMs
    };
    
    localStorage.setItem(key, JSON.stringify(item));
  } catch (error) {
    logger.error(`Error saving to cache (key: ${key}):`, error);
  }
}

/**
 * Get data from localStorage if not expired
 * @param key - Storage key
 * @param maxAgeMs - Optional maximum age in milliseconds (overrides stored expiry)
 * @returns The stored data or null if expired/not found
 */
export function getFromCache<T>(key: string, maxAgeMs?: number): T | null {
  try {
    const item = localStorage.getItem(key);
    
    if (!item) {
      return null;
    }
    
    const cachedItem = JSON.parse(item) as CacheItem<T>;
    const now = Date.now();
    
    // Check if the item is expired based on stored expiry
    if (cachedItem.expiry < now) {
      localStorage.removeItem(key);
      return null;
    }
    
    // Check against optional max age parameter
    if (maxAgeMs && (cachedItem.expiry - maxAgeMs) > (now - maxAgeMs)) {
      localStorage.removeItem(key);
      return null;
    }
    
    return cachedItem.data;
  } catch (error) {
    logger.error(`Error retrieving from cache (key: ${key}):`, error);
    return null;
  }
}

/**
 * Clear all cache or a specific cache item
 * @param key - Optional specific key to clear
 */
export function clearCache(key?: string): void {
  try {
    if (key) {
      localStorage.removeItem(key);
    } else {
      // Clear only cache items that match our pattern
      // This avoids clearing other localStorage items used by the app
      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith('roadmap_')) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  } catch (error) {
    logger.error('Error clearing cache:', error);
  }
} 