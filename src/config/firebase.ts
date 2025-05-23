import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';

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
    console.error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
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
  console.log('Initializing Firebase app...');
  
  if (!validateConfig()) {
    throw new Error('Invalid Firebase configuration');
  }

  // Check if Firebase is already initialized
  if (getApps().length === 0) {
    console.log('Creating new Firebase app instance...');
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    console.log('Firebase app already initialized, using existing instance.');
    firebaseApp = getApps()[0];
  }
  
  console.log('Firebase app initialized successfully:', firebaseApp.name);
  
  console.log('Initializing Firebase auth...');
  auth = getAuth(firebaseApp);
  
  // Initialize Firestore
  console.log('Initializing Firestore...');
  firestore = getFirestore(firebaseApp);
  
  // Initialize Firebase Functions
  console.log('Initializing Firebase Functions...');
  functions = getFunctions(firebaseApp, 'us-central1');
  
  // Additional setup for auth and Firestore
  if (typeof window !== 'undefined') {
    console.log(`Auth domain: ${firebaseConfig.authDomain}`);
    console.log(`Current origin: ${window.location.origin}`);
    
    // Connect to emulators in development
    if (process.env.NODE_ENV === 'development') {

      console.log('Running in development mode, connecting to emulators...');
      if (!firebaseConfig.projectId) {
        firebaseConfig.projectId = 'hexaverse';
      }

      // Connect to the Auth emulator
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('Connected to Firebase Auth emulator');
      
      // Connect to the Firestore emulator
      connectFirestoreEmulator(firestore, 'localhost', 8080);
      console.log('Connected to Firestore emulator');
      
      // Connect to the Functions emulator
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('Connected to Firebase Functions emulator');
    }
  }
  
  console.log('Firebase auth, Firestore, and Functions initialized successfully!');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Create dummy exports to prevent app from crashing
  firebaseApp = {} as FirebaseApp;
  auth = {} as Auth;
  firestore = {} as Firestore;
  functions = {} as Functions;
}

export { firebaseApp, auth, firestore, functions };
export default firebaseApp; 