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
  
  // Add scopes if needed - uncomment and customize as necessary
  // provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
  // provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  
  // Set custom parameters for better UX
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  
  try {
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  } catch (error) {
    console.error('Google sign-in error:', error);
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