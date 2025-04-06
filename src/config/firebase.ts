import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Firebase configuration (will be populated from environment variables)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
let firebaseApp;
let auth;

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
  
  // Additional authentication setup
  if (typeof window !== 'undefined') {
    console.log(`Auth domain: ${firebaseConfig.authDomain}`);
    console.log(`Current origin: ${window.location.origin}`);
    
    // Optionally connect to emulator in development
    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('Connected to Firebase Auth emulator');
    }
  }
  
  console.log('Firebase auth initialized successfully!');
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Create dummy exports to prevent app from crashing
  firebaseApp = {} as any;
  auth = {} as any;
}

export { firebaseApp, auth };
export default firebaseApp; 