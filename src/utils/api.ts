/**
 * API utilities for Firebase Cloud Functions
 * 
 * This module handles the URLs for Firebase Cloud Functions in both development and production environments.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

// Production function URLs (filled in at runtime based on deployment)
const functionUrls: Record<string, string> = {
  getColony: 'https://getcolony-wlzgqi7vqa-uc.a.run.app',
  createColony: 'https://createcolony-wlzgqi7vqa-uc.a.run.app',
  createTestUser: 'https://createtestuser-wlzgqi7vqa-uc.a.run.app',
  // Add other function URLs as needed
};

// Get the proper URL for a function based on environment
export function getFunctionUrl(functionName: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'hexaverse';
  
  let url: string;
  
  if (isDevelopment) {
    // Use local emulator in development
    url = `http://localhost:5001/${projectId}/us-central1/${functionName}`;
  } else {
    // Use individual function URLs in production
    url = functionUrls[functionName] || `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`;
  }
  
  console.log(`[API] Using URL for function ${functionName}: ${url}`);
  return url;
}

/**
 * Make an authenticated request to a Firebase Cloud Function
 * 
 * @param functionName - Name of the function to call
 * @param options - Request options
 * @returns The response from the function
 */
export async function callFunction<T = any>(
  functionName: string, 
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    queryParams?: Record<string, string>;
    idToken: string;
  }
): Promise<T> {
  const { method = 'GET', body, queryParams, idToken } = options;
  
  // Build the URL with query parameters if needed
  let url = getFunctionUrl(functionName);
  if (queryParams && Object.keys(queryParams).length > 0) {
    const params = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => {
      params.append(key, value);
    });
    url = `${url}?${params.toString()}`;
  }
  
  // Set up request headers
  const headers: HeadersInit = {
    'Authorization': `Bearer ${idToken}`,
  };
  
  // Add content-type header for requests with body
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  console.log(`[API] Calling function ${functionName} with method ${method}`);
  
  try {
    // Make the fetch request
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      const errorData = tryParseJson(errorText);
      const errorMessage = typeof errorData === 'object' && errorData.message 
        ? errorData.message 
        : errorText;
      
      console.error(`[API] Error calling ${functionName}: ${response.status} - ${errorMessage}`);
      
      throw new Error(
        `API Error (${response.status}): ${errorMessage}`
      );
    }
    
    // Parse the response
    const result = await response.json();
    console.log(`[API] ${functionName} response:`, result);
    return result;
  } catch (error) {
    // If it's already our custom error, just rethrow it
    if (error instanceof Error && error.message.startsWith('API Error')) {
      throw error;
    }
    
    // Otherwise, wrap the error
    console.error(`[API] Unexpected error calling ${functionName}:`, error);
    throw new Error(`Error calling ${functionName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper to try parsing JSON or return the original text
function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

/**
 * Update the function URLs - call this whenever you get new URLs
 * 
 * @param newUrls Object mapping function names to their URLs
 */
export function updateFunctionUrls(newUrls: Record<string, string>): void {
  console.log('[API] Updating function URLs:', newUrls);
  Object.assign(functionUrls, newUrls);
} 