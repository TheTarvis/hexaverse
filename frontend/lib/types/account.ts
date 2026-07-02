// Account Domain Types

export interface Account {
  id: string
  organizations: string[]
  // Profile Fields (from Firebase Auth)
  name?: string
  given_name?: string
  family_name?: string
  nickname?: string
  email?: string
  email_verified?: boolean
  picture?: string
  profile?: string
}

export interface CreateAccountRequest {
  name?: string
  given_name?: string
  family_name?: string
  nickname?: string
  email?: string
  email_verified?: boolean
  picture?: string
  profile?: string
}

export interface AccountSetupStatus {
  hasAccount: boolean
  account?: Account
  needsSetup: boolean
  missingFields: string[]
}

// Limited DTO for public profile information
// Used when displaying account info to other users (e.g., "Created by")
export interface AccountProfile {
  id: string
  name?: string
  email?: string
  picture?: string
}