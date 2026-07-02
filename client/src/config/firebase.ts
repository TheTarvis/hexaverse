import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';
import logger from '@/utils/logger';

// Firebase configuration (will be populated from environment variables)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'api_key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'hexaverse.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'hexaverse',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'hexaverse.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'message_sender_id',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'app_id',
};

// Validate Firebase config before initialization
const validateConfig = () => {
  const requiredFields = [
    'apiKey', 
    'authDomain', 
    'projectId', 
    'storageBucket', 
    'messagingSenderId', 
    'appId'
  ] as const;
  
  const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
  
  if (missingFields.length > 0) {
    logger.debug(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
    return false;
  }
  
  return true;
}

// Initialize Firebase
let firebaseApp: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let functions: Functions;

try {
  logger.debug('Initializing Firebase app...');
  
  if (!validateConfig()) {
    throw new Error('Invalid Firebase configuration');
  }

  // Check if Firebase is already initialized
  if (getApps().length === 0) {
    logger.debug('Creating new Firebase app instance...');
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    logger.debug('Firebase app already initialized, using existing instance.');
    firebaseApp = getApps()[0];
  }
  
  logger.debug('Firebase app initialized successfully:', firebaseApp.name);
  
  logger.debug('Initializing Firebase auth...');
  auth = getAuth(firebaseApp);
  
  // Initialize Firestore
  logger.debug('Initializing Firestore...');
  firestore = getFirestore(firebaseApp);
  
  // Initialize Firebase Functions
  logger.debug('Initializing Firebase Functions...');
  functions = getFunctions(firebaseApp, 'us-central1');
  
  // Additional setup for auth and Firestore
  if (typeof window !== 'undefined') {
    logger.info(`Auth domain: ${firebaseConfig.authDomain}`);
    logger.info(`Current origin: ${window.location.origin}`);
    
    // Connect to emulators in development
    if (process.env.NODE_ENV === 'development') {

      logger.info('Running in development mode, connecting to emulators...');
      if (!firebaseConfig.projectId) {
        firebaseConfig.projectId = 'hexaverse';
      }

      // Connect to the Auth emulator
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      logger.debug('Connected to Firebase Auth emulator');
      
      // Connect to the Firestore emulator
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      logger.debug('Connected to Firestore emulator');
      
      // Connect to the Functions emulator
      connectFunctionsEmulator(functions, 'localhost', 5001);
      logger.debug('Connected to Firebase Functions emulator');
    }
  }
  
  logger.debug('Firebase auth, Firestore, and Functions initialized successfully!');
} catch (error) {
  logger.debug('Error initializing Firebase:', error);
  // Create dummy exports to prevent app from crashing
  firebaseApp = {} as FirebaseApp;
  auth = {} as Auth;
  firestore = {} as Firestore;
  functions = {} as Functions;
}

export { firebaseApp, auth, firestore, functions };
export default firebaseApp; 