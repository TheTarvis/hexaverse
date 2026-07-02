/**
 * API utility functions for Firebase/server communication
 */
import { auth, functions } from '@/config/firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';

/**
 * Call a Firebase Cloud Function with authentication
 * 
 * @param functionName - The name of the function to call
 * @param data - The data to pass to the function
 * @returns The result of the function call
 */
export async function callFunction<T = any, R = any>(
  functionName: string,
  data?: T
): Promise<HttpsCallableResult<R>> {
  const callable = httpsCallable<T, R>(functions, functionName);
  return await callable(data);
}

/**
 * Get the URL for a Firebase Cloud Function
 * 
 * @param functionName - The name of the function
 * @returns The complete URL for the function
 */
export async function getFunctionUrl(functionName: string): Promise<string> {
  // Get the region from the functions instance
  const region = functions.region || 'us-central1';
  // Get the project ID from the functions instance
  const projectId = functions.app.options.projectId;
  
  // Create the function URL
  const baseUrl = `https://${region}-${projectId}.cloudfunctions.net`;
  return `${baseUrl}/${functionName}`;
} 