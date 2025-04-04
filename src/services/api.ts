/**
 * API service for interacting with the backend server
 */

// Get API base URL from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081';

/**
 * Fetch shard data from the server
 * @returns Promise with the grid data
 */
export async function fetchShardData() {
  try {
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
    console.error('Error fetching shard data:', error);
    throw error;
  }
} 