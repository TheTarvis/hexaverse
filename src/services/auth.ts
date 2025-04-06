import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/config/firebase';

export type AuthUser = User;

/**
 * Signs in with email and password
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Signs in with Google
 */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  
  // Add scopes for better user information
  provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
  provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  
  // Set custom parameters for better UX
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  
  try {
    console.log('Starting Google sign-in process...');
    const userCredential = await signInWithPopup(auth, provider);
    console.log('Google sign-in successful!', userCredential.user.uid);
    return userCredential.user;
  } catch (error: any) {
    console.error('Google sign-in error:', error);
    
    // Provide more specific error messages based on Firebase error codes
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Sign-in popup was closed before completion.');
    } else if (error.code === 'auth/popup-blocked') {
      console.warn('Popup was blocked by the browser. Try signing in with redirect instead.');
      // You could implement signInWithRedirect here as a fallback
      // await signInWithRedirect(auth, provider);
      // throw new Error('Popup was blocked. Please try again.');
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error('Another popup is already open. Please close it first.');
    } else if (error.code === 'auth/network-request-failed') {
      throw new Error('Network error. Please check your connection and try again.');
    }
    
    throw error;
  }
}

/**
 * Creates a new user with email and password
 */
export async function createUser(email: string, password: string): Promise<User> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Signs out the current user
 */
export async function signOutUser(): Promise<void> {
  return await signOut(auth);
}

/**
 * Returns the current authenticated user or null
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}

/**
 * Subscribes to auth state changes
 * @param callback Function to call when auth state changes
 * @returns Unsubscribe function
 */
export function subscribeToAuthChanges(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Gets the auth token for the current user
 */
export async function getAuthToken(): Promise<string | null> {
  const user = getCurrentUser();
  if (!user) return null;
  
  return await user.getIdToken();
} 