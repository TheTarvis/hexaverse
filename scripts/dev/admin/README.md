# Admin scripts

Developer utilities for managing Hexaverse admins.

## Setting admin claims

`set-admin-claims.js` grants the `admin: true` Firebase custom claim to a
user. The backend (`backend/middlewares/admin.go`, via `FirebaseJWTVerification`)
and frontend (`hooks/use-auth.ts`, `token.claims.admin`) both key off this
claim — nothing else makes a user an admin.

### Prerequisites

- Node.js
- `gcloud auth application-default login` (Application Default Credentials —
  no service-account JSON files)
- Your Google account needs admin access to the target Firebase project
  (not needed for the emulator)

### Setup

```bash
cd scripts/dev/admin
npm install
```

### Usage

```bash
# Real Firebase project (defaults to hexaverse; override with FIREBASE_PROJECT_ID)
npm run set-admin -- <UID>
FIREBASE_PROJECT_ID=hexaverse-game-dev npm run set-admin -- <UID>

# Local Auth emulator (localhost:9099, project hexaverse-emulator)
npm run set-admin:dev -- <UID>

# Revoke
npm run remove-admin -- <UID>
npm run remove-admin:dev -- <UID>
```

Find a UID in the Firebase console (Authentication → Users) or the emulator
UI at http://localhost:20210/auth.

Expected output:

```
🔑 Setting admin claim for user <UID> in PRODUCTION mode (project: hexaverse)
✅ Admin claim set for user <UID>
💡 User must sign out and back in (or force a token refresh) to pick up the change
```

### How admin claims work

1. Admin status lives as a custom claim (`admin: true`) in the user's Firebase
   ID token.
2. Frontend checks `token.claims.admin` via `getIdTokenResult()`.
3. Backend reads the claim from the verified JWT and sets `common.IsAdminKey`;
   `AdminOnlyMiddleware` gates admin routes on it.
4. Claims are baked into the token at sign-in, so the user must sign out and
   back in (or force-refresh the token) after a change.

### Emulator note

Emulator auth data is in-memory unless you run the emulators with
`--import/--export-on-exit`, so dev admin claims are lost when the emulator
restarts. Re-run `set-admin:dev` after a restart.

### Troubleshooting

- `auth/insufficient-permission` — re-run `gcloud auth application-default login`
  and check your account's role on the Firebase project.
- `auth/user-not-found` — wrong UID, or wrong project (check `FIREBASE_PROJECT_ID`
  / `--dev`).
- `Cannot find module 'firebase-admin'` — run `npm install` in `scripts/dev/admin`.
