import { useState, useEffect, useRef } from 'react';

export interface AdPlacement {
  show: boolean;
}

/**
 * This hook simply determines positions where ads should be shown,
 * without managing ad objects directly.
 */
export default function useAdPlacement(
  count: number = 3,
  onDebugLog?: (message: string) => void
): AdPlacement[] {
  const [adPlacements, setAdPlacements] = useState<AdPlacement[]>([]);
  const lastAdLoadTimeRef = useRef<number>(0);
  const AD_PLACEMENT_COOLDOWN = 30000; // 30 seconds
  
  const logMessage = (message: string) => {
    console.log(`[AD_PLACEMENT]: ${message}`);
    if (onDebugLog) {
      onDebugLog(`[AD_PLACEMENT]: ${message}`);
    }
  };

  useEffect(() => {
    const now = Date.now();
    if (now - lastAdLoadTimeRef.current < AD_PLACEMENT_COOLDOWN) {
      logMessage(`⏳ Skipping ad placement: throttled (${now - lastAdLoadTimeRef.current}ms since last placement)`);
      return;
    }

    lastAdLoadTimeRef.current = now;
    logMessage(`Setting up ${count} ad placements`);

    // Create placement indicators
    setAdPlacements(Array(count).fill(0).map(() => ({
      show: true
    })));
    
  }, [count, onDebugLog]);

  return adPlacements;
}