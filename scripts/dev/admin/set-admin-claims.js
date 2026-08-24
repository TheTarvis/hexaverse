// Grants (or revokes) the `admin: true` Firebase custom claim for a user.
//
//   node set-admin-claims.js [--dev] [--remove] <UID>
//
// --dev     target the local Auth emulator (localhost:9109, project
//           hexaverse-emulator) instead of the real Firebase project
// --remove  clear the admin claim instead of setting it
//
// Auth: Application Default Credentials (`gcloud auth application-default login`).
// No service-account JSON files.
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const isDevMode = args.includes('--dev');
const isRemove = args.includes('--remove');
const uid = args.find((a) => !a.startsWith('--'));

if (!uid) {
  console.error('❌ Error: You must provide a user UID as an argument.');
  console.log('Usage: node set-admin-claims.js [--dev] [--remove] <UID>');
  console.log('Example (prod):     node set-admin-claims.js Abc123XyzUser456');
  console.log('Example (emulator): node set-admin-claims.js --dev Abc123XyzUser456');
  process.exit(1);
}

// Default project IDs match the rest of the repo: the dev emulator runs as
// "<slug>-emulator" (see root package.json firebase:emulators) and the real
// project is GCP_PROJECT_PROD from bootstrap/config.env. Override with
// FIREBASE_PROJECT_ID.
const defaultProjectId = isDevMode ? 'hexaverse-emulator' : 'hexaverse';
const projectId = process.env.FIREBASE_PROJECT_ID || defaultProjectId;

if (isDevMode) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9109';
  console.log(`🔧 Using Firebase Auth emulator at ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
}

try {
  admin.initializeApp({ projectId });
} catch (error) {
  console.error('❌ Error initializing Firebase Admin SDK:', error.message);
  console.log('💡 Make sure you have run: gcloud auth application-default login');
  console.log('💡 Or set FIREBASE_PROJECT_ID to the target Firebase project');
  process.exit(1);
}

const mode = isDevMode ? 'EMULATOR' : 'PRODUCTION';
const verb = isRemove ? 'Removing' : 'Setting';
console.log(`🔑 ${verb} admin claim for user ${uid} in ${mode} mode (project: ${projectId})`);

admin
  .auth()
  .setCustomUserClaims(uid, isRemove ? { admin: null } : { admin: true })
  .then(() => {
    console.log(`✅ Admin claim ${isRemove ? 'removed for' : 'set for'} user ${uid}`);
    console.log('💡 User must sign out and back in (or force a token refresh) to pick up the change');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error setting custom claim:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.log('💡 Make sure the UID is correct and the user exists in this project');
    } else if (error.code === 'auth/insufficient-permission') {
      console.log('💡 Your Google Cloud credentials lack permission on this Firebase project');
      console.log('💡 Try: gcloud auth application-default login');
    }
    process.exit(1);
  });
