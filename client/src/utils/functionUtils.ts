import { HttpsCallableResult, HttpsCallable } from 'firebase/functions';
import logger from '@/utils/logger';
import { IsWarmupable } from '@/types/functions';

/**
 * Makes a Firebase callable function warmupable
 * 
 * @param name The name of the function (for logging)
 * @param callable The Firebase callable function reference
 * @returns An IsWarmupable object that can be used with useWarmupFunctions
 */
export function makeWarmupable<TData, TResult>(
  name: string,
  callable: HttpsCallable<TData, TResult>
): IsWarmupable {
  return {
    name,
    warmup: async (): Promise<void> => {
      try {
        // Make an explicit warmup call
        // @ts-expect-error TypeScript doesn't know we handle warmup-only requests
        await callable({ warmup: true });
        logger.debug(`${name} function warmed up`);
      } catch (error) {
        logger.error(`Error warming up ${name} function:`, error);
      }
    }
  };
}

/**
 * Type to track which functions have been warmed up
 */
export type WarmupStatus = Record<string, boolean>;

/**
 * Type for a registry of warmupable functions
 */
export type WarmupableRegistry<T extends Record<string, IsWarmupable>> = T & {
  warmupAll: () => Promise<void>;
};

/**
 * Creates a Warmupable registry with known cloud functions
 * 
 * @returns An object containing all warmupable functions
 */
export function createWarmupableRegistry<T extends Record<string, IsWarmupable>>(warmupables: T): WarmupableRegistry<T> {
  return {
    ...warmupables,
    warmupAll: async (): Promise<void> => {
      await Promise.all(Object.values(warmupables).map(func => func.warmup()));
    }
  };
} 