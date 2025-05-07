# Admin Scripts

This directory contains administrative scripts for managing the Hexaverse application.

## Setting Admin Claims

The `set-admin-claims.js` script allows you to grant admin privileges to specific users in Firebase Authentication.

### Prerequisites

1. You need a Firebase service account key file (JSON) with appropriate permissions.
2. Node.js installed on your machine.

### Setup

1. Create a file named `serviceAccountKey.json` in this directory with your Firebase service account key.
   - You can download this from the Firebase Console: Project settings > Service accounts > Generate new private key

2. Install dependencies:
   ```
   npm install
   ```

### Usage

1. Run the script with the UID of the user you want to make an admin:
   ```
   # For production Firebase instance
   npm run set-admin YOUR_USER_UID
   
   # For local Firebase emulator
   npm run set-admin:dev YOUR_USER_UID
   ```

   Examples:
   ```bash
   # Make user ABC123 an admin in production
   npm run set-admin ABC123
   
   # Make user XYZ789 an admin in the emulator
   npm run set-admin:dev XYZ789
   ```

2. You should see a success message if the operation completed successfully:
   ```
   🔑 Setting admin claim for user YOUR_USER_UID in PRODUCTION mode
   ✅ Admin claim set for user YOUR_USER_UID
   ```

### Firebase Emulator Support

The script supports connecting to a local Firebase Auth emulator by using the `set-admin:dev` script, which:

1. Sets the `FIREBASE_AUTH_EMULATOR_HOST` environment variable to `localhost:9099`
2. Indicates in the log messages that you're working with the emulator
3. Applies the admin claim to the user in your local emulator instance

This allows you to test admin functionality without affecting your production Firebase environment.

### Security Note

Keep your `serviceAccountKey.json` secure and never commit it to version control. This file contains credentials with administrative access to your Firebase project. 

## Migrating Collections

The `migrate-collections.js` script helps you migrate data between Firestore collections, specifically:
- From `/tiles` to `/colony/v1/tiles`
- From `/colonies` to `/colony/v1/colonies`

This is useful for updating your database structure while preserving all existing data.

### Usage

```bash
# Migrate collections in production (LIVE run - will write data)
npm run migrate

# Migrate collections connecting to local emulator
npm run migrate:dev

# Test migration in production without writing data (dry run)
npm run migrate:dry-run

# Test migration with local emulator without writing data
npm run migrate:dev:dry-run
```

### Features

- **Batch Processing**: Efficiently processes documents in batches of 500 (Firestore limit)
- **Dry Run Mode**: Test migrations without actually writing data
- **Progress Reporting**: Shows detailed progress of the migration
- **Error Handling**: Gracefully handles and reports errors
- **Emulator Support**: Can connect to local Firestore emulator

### Example Output

```
🔄 Starting collection migration in PRODUCTION mode
⚠️ LIVE RUN - Data will be written

📦 Starting migration: tiles -> colony/v1/tiles
📄 Found 250 documents to migrate
📝 Prepared final batch of 250 documents (total: 250)
🚀 Committing 1 batches...
✅ Successfully migrated 250 documents from 'tiles' to 'colony/v1/tiles'

📦 Starting migration: colonies -> colony/v1/colonies
📄 Found 50 documents to migrate
📝 Prepared final batch of 50 documents (total: 50)
🚀 Committing 1 batches...
✅ Successfully migrated 50 documents from 'colonies' to 'colony/v1/colonies'

--- 📊 Migration Summary ---
📦 Collections processed: 2
📦 Collections successfully migrated: 2/2
📄 Total documents processed: 300
❌ Errors encountered: 0

✅ Migration completed successfully!
```

### Notes

- The script preserves document IDs from the source collections
- It migrates all fields from each document
- When running in production, always do a dry run first to ensure everything is as expected 