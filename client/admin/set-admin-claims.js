const admin = require('firebase-admin');

// Check if running in dev mode (using emulator)
const isDevMode = process.argv.includes('--dev');

// Get the UID from command line arguments
let uid = process.argv[2];

// Handle the case where --dev is the first argument
if (uid === '--dev') {
  uid = process.argv[3];
}

// Validate UID
if (!uid) {
  console.error('❌ Error: You must provide a user UID as an argument.');
  console.log('Usage: node set-admin-claims.js [--dev] <UID>');
  console.log('Example: node set-admin-claims.js Abc123XyzUser456');
  console.log('Example with emulator: node set-admin-claims.js --dev Abc123XyzUser456');
  process.exit(1);
}

// If in development mode, point to Auth emulator
if (isDevMode) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  console.log('🔧 Using Firebase Auth emulator at localhost:9099');
}

// Replace with the path to your service account JSON file
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // No need to specify projectId as it's in the service account file
});

console.log(`🔑 Setting admin claim for user ${uid} in ${isDevMode ? 'EMULATOR' : 'PRODUCTION'} mode`);

// Set custom claims
admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`✅ Admin claim set for user ${uid}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error setting custom claim:', error);
    process.exit(1);
  }); 