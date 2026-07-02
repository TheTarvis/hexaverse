import { useEffect, useRef } from 'react';
import { IsWarmupable } from '@/types/functions';
import { WarmupableFunctions } from '@/services/colony/ColonyTilesService';
import logger from '@/utils/logger';

/**
 * Hook to warm up cloud functions when needed.
 * This helps reduce cold start latency for the first user interaction.
 * 
 * @param functionsToWarmup - Array of warmupable functions to warm up. If not provided, all known functions are warmed up.
 */
export function useWarmupFunctions(functionsToWarmup?: IsWarmupable[] | null) {
  const hasWarmedUp = useRef<Set<string>>(new Set());

  useEffect(() => {
    const warmupFunctions = async () => {
      // Determine which functions to warm up
      const targetFunctions = functionsToWarmup || Object.values(WarmupableFunctions);
      
      if (targetFunctions.length === 0) return;
      
      try {
        // Warm up each function that hasn't been warmed up already
        await Promise.all(targetFunctions.map(async (func) => {
          if (!hasWarmedUp.current.has(func.name)) {
            logger.info(`Warming up ${func.name} function...`);
            // Make sure func is IsWarmupable before calling warmup
            if ('warmup' in func && typeof func.warmup === 'function') {
              await func.warmup();
              hasWarmedUp.current.add(func.name);
            } else {
              logger.error(`Function ${func.name} doesn't have a warmup method`);
            }
          }
        }));
      } catch (error) {
        logger.error('Error warming up functions:', error);
      }
    };

    warmupFunctions();
  }, [functionsToWarmup]);
} 