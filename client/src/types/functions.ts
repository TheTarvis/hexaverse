/**
 * Interface for functions that can be warmed up
 */
export interface IsWarmupable {
  /**
   * Warms up a cloud function to reduce cold start latency
   */
  warmup: () => Promise<void>;
  
  /**
   * Display name for the function (used for logging)
   */
  name: string;
} 