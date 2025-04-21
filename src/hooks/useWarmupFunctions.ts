import { useEffect, useRef } from 'react';
import { warmupAddTile } from '@/services/tiles';

/**
 * Hook to warm up cloud functions when needed.
 * This helps reduce cold start latency for the first user interaction.
 */
export function useWarmupFunctions() {
  const hasWarmedUp = useRef(false);

  useEffect(() => {
    const warmupFunctions = async () => {
      if (hasWarmedUp.current) return;
      
      try {
        // Warm up the addTile function
        await warmupAddTile();
        hasWarmedUp.current = true;
      } catch (error) {
        console.error('Error warming up functions:', error);
      }
    };

    warmupFunctions();
  }, []);
} 