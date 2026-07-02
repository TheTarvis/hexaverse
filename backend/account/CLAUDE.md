# Accounts

## Overview
Accounts represent users in the system who can belong to multiple organizations.
- Are authenticated through Firebase Auth
- Can belong to multiple organizations
- Have permissions through organization memberships

## Data Model
Firestore document stored in `/accounts/{accountId}`:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "firebaseUid": "firestore|123456789",
  "organizations": [
    "824be115-eadf-4e10-b2fb-6249e92ea9d7",
    "000d3b90-cef8-11ef-9129-3aa3611bdd71"
  ],
  "createdAt": "2024-03-25T12:00:00Z",
  "updatedAt": "2024-03-25T12:00:00Z"
}
```

## API Endpoints
### Account Management
1. `GET /v1/accounts/firebase`
   - Description: Get the current authenticated account
   - Authentication: Required (Firebase JWT)
   - Response:
     ```json
     {
       "id": "123e4567-e89b-12d3-a456-426614174000",
       "organizations": [
         "824be115-eadf-4e10-b2fb-6249e92ea9d7",
         "000d3b90-cef8-11ef-9129-3aa3611bdd71"
       ]
     }
     ```
   - Error Responses:
     - 404: Account not found
     - 500: Internal server error

2. `GET /v1/accounts/:accountId`
   - Description: Get an account by ID (owner only)
   - Authentication: Required (Firebase JWT)
   - Authorization: User can only access their own account
   - Parameters:
     - accountId (path) - ID of the account
   - Response:
     ```json
     {
       "id": "123e4567-e89b-12d3-a456-426614174000",
       "organizations": [
         "824be115-eadf-4e10-b2fb-6249e92ea9d7",
         "000d3b90-cef8-11ef-9129-3aa3611bdd71"
       ]
     }
     ```
   - Error Responses:
     - 403: Forbidden (attempting to access another user's account)
     - 404: Account not found
     - 500: Internal server error

3. `GET /v1/accounts/:accountId/profile`
   - Description: Get limited public profile information for an account
   - Authentication: Required (Firebase JWT)
   - Authorization: None (accessible to any authenticated user)
   - Parameters:
     - accountId (path) - ID of the account
   - Response:
     ```json
     {
       "id": "123e4567-e89b-12d3-a456-426614174000",
       "name": "John Doe",
       "email": "john@example.com",
       "picture": "https://..."
     }
     ```
   - Error Responses:
     - 404: Account not found
     - 500: Internal server error
   - Notes:
     - Returns limited DTO for display purposes (e.g., "Created by" fields)
     - Does not include sensitive fields like organizations, admin status

4. `POST /v1/accounts`
   - Description: Create a new account
   - Authentication: Required (Firebase JWT)
   - Response:
     ```json
     {
       "id": "123e4567-e89b-12d3-a456-426614174000",
       "organizations": []
     }
     ```
   - Error Responses:
     - 400: Account already exists
     - 500: Internal server error

## Business Logic
- Account creation automatically happens on first authentication with Firebase
- Organizations are added/removed through membership operations
- Account data is kept in sync with Firebase Auth user information