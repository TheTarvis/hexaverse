/**
 * API service for interacting with the backend server
 */

// Get API base URL from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081';

// Simple cache to prevent duplicate requests in React strict mode
let shardDataCache: any = null;
let shardRequestInProgress = false;

/**
 * Fetch shard data from the server
 * @returns Promise with the grid data
 */
export async function fetchShardData() {
  // Return cached response if available
  if (shardDataCache) {
    console.log('Using cached shard data');
    return shardDataCache;
  }

  // If a request is already in progress, wait for it
  if (shardRequestInProgress) {
    console.log('Request already in progress, waiting...');
    // Wait for the current request to finish
    return new Promise((resolve) => {
      const checkCache = () => {
        if (shardDataCache) {
          resolve(shardDataCache);
        } else {
          setTimeout(checkCache, 100);
        }
      };
      checkCache();
    });
  }

  try {
    shardRequestInProgress = true;
    console.log('Fetching fresh shard data from server');
    
    const response = await fetch(`${API_BASE_URL}/shard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    const data = await response.json();
    // Cache the response
    shardDataCache = data;
    return data;
  } catch (error) {
    console.error('Error fetching shard data:', error);
    throw error;
  } finally {
    shardRequestInProgress = false;
  }
}

/**
 * Add a new shard without using the cache
 * @returns Promise with the new shard data
 */
export async function addNewShard() {
  try {
    console.log('Requesting a new shard from server');
    
    const response = await fetch(`${API_BASE_URL}/shard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Server responded with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding new shard:', error);
    throw error;
  }
} 