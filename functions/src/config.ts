/**
 * Shared configuration for Firebase functions
 */

// Function configuration
export const functionConfig = {
  // Region should match the one in firebase.json
  region: 'us-central1',
  
  // Default timeouts
  defaultTimeoutSeconds: 60,
  extendedTimeoutSeconds: 120,
  
  // Memory allocation - must be one of the valid options
  memory: '256MiB' as const
};

// Game configuration constants
export const gameConfig = {
  // Colony settings
  colonySettings: {
    minSpawnDistance: 8,    // Minimum tiles between colonies
    maxSpawnDistance: 25,   // Maximum tiles between colonies
    baseVisibilityRadius: 4,
    tier1BaseInfluence: 3
  }
}; 