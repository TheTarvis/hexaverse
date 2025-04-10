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