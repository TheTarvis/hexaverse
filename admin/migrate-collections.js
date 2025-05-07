const admin = require('firebase-admin');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isDevMode = args.includes('--dev');
const batchSize = 500; // Firestore batch limit is 500 operations

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

if (isDevMode) {
  // When in dev mode, set emulator host
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  console.log('🔧 Using Firestore emulator at localhost:8080');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Migration configuration
const migrations = [
  {
    sourceCollection: 'tiles',
    destCollection: 'colony/v1/tiles',
    idField: 'id',
  },
  {
    sourceCollection: 'colonies',
    destCollection: 'colony/v1/colonies',
    idField: 'id',
  },
];

// Function to migrate a single collection
async function migrateCollection(sourceCollection, destCollection, idField) {
  console.log(`\n📦 Starting migration: ${sourceCollection} -> ${destCollection}`);
  
  try {
    // Get all documents from source collection
    const sourceSnapshot = await db.collection(sourceCollection).get();
    
    if (sourceSnapshot.empty) {
      console.log(`⚠️ Source collection '${sourceCollection}' is empty`);
      return { success: true, count: 0, errors: 0 };
    }
    
    console.log(`📄 Found ${sourceSnapshot.size} documents to migrate`);
    
    if (isDryRun) {
      console.log('🔍 DRY RUN - no data will be written');
      return { success: true, count: sourceSnapshot.size, errors: 0 };
    }
    
    // Process in batches to avoid Firestore limits
    const batches = [];
    let currentBatch = db.batch();
    let operationsInBatch = 0;
    let totalMigrated = 0;
    let errorCount = 0;
    
    for (const doc of sourceSnapshot.docs) {
      try {
        const data = doc.data();
        const docId = data[idField] || doc.id;
        const docRef = db.doc(`${destCollection}/${docId}`);
        
        currentBatch.set(docRef, data);
        operationsInBatch++;
        totalMigrated++;
        
        // If batch is full, add it to the queue and create a new batch
        if (operationsInBatch >= batchSize) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationsInBatch = 0;
          console.log(`📝 Prepared batch of ${batchSize} documents (total: ${totalMigrated})`);
        }
      } catch (error) {
        console.error(`❌ Error processing document ${doc.id}:`, error);
        errorCount++;
      }
    }
    
    // Add the last batch if it has operations
    if (operationsInBatch > 0) {
      batches.push(currentBatch);
      console.log(`📝 Prepared final batch of ${operationsInBatch} documents (total: ${totalMigrated})`);
    }
    
    // Commit all batches
    console.log(`🚀 Committing ${batches.length} batches...`);
    
    const results = await Promise.all(batches.map(batch => batch.commit()));
    
    console.log(`✅ Successfully migrated ${totalMigrated} documents from '${sourceCollection}' to '${destCollection}'`);
    
    return { success: true, count: totalMigrated, errors: errorCount };
  } catch (error) {
    console.error(`❌ Migration failed for '${sourceCollection}' to '${destCollection}':`, error);
    return { success: false, count: 0, errors: 1 };
  }
}

// Main migration function
async function runMigration() {
  console.log(`🔄 Starting collection migration in ${isDevMode ? 'EMULATOR' : 'PRODUCTION'} mode`);
  console.log(`${isDryRun ? '🔍 DRY RUN - No data will actually be written' : '⚠️ LIVE RUN - Data will be written'}`);
  
  let successCount = 0;
  let totalDocuments = 0;
  let totalErrors = 0;
  
  for (const migration of migrations) {
    const { sourceCollection, destCollection, idField } = migration;
    const result = await migrateCollection(sourceCollection, destCollection, idField);
    
    if (result.success) successCount++;
    totalDocuments += result.count;
    totalErrors += result.errors;
  }
  
  console.log('\n--- 📊 Migration Summary ---');
  console.log(`📦 Collections processed: ${migrations.length}`);
  console.log(`📦 Collections successfully migrated: ${successCount}/${migrations.length}`);
  console.log(`📄 Total documents processed: ${totalDocuments}`);
  console.log(`❌ Errors encountered: ${totalErrors}`);
  
  return { 
    success: successCount === migrations.length && totalErrors === 0,
    migratedCollections: successCount,
    totalCollections: migrations.length,
    documentsProcessed: totalDocuments,
    errors: totalErrors
  };
}

// Run the migration
runMigration()
  .then(result => {
    console.log(`\n${result.success ? '✅ Migration completed successfully!' : '⚠️ Migration completed with issues'}`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Migration failed with an unexpected error:', error);
    process.exit(1);
  }); 