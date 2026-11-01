import { useLayoutEffect, useRef, useState } from 'react';

export const ACKNOWLEDGED_RING_ANIMATION_MS = 600;

/** Interpolate only inside the already acknowledged interval; never predict time. */
export function acknowledgedRingFrame(from: number, target: number, elapsedMs: number) {
  const t = Math.max(0, Math.min(1, elapsedMs / ACKNOWLEDGED_RING_ANIMATION_MS));
  return Math.min(target, from + (target - from) * (1 - (1 - t) ** 3));
}

export function useAcknowledgedRingProgress(target: number, resetKey?: string) {
  const [displayed, setDisplayed] = useState(target);
  const current = useRef(target);
  const previousKey = useRef(resetKey);
  useLayoutEffect(() => {
    let canceled = false;
    let frame: number | undefined;
    const update = (value: number) => { current.current = value; setDisplayed(value); };
    // Revocation/reset is immediate, including a new session with the same target.
    if (previousKey.current !== resetKey || target <= current.current) {
      previousKey.current = resetKey;
      update(target);
    } else {
      const from = current.current;
      const startedAt = performance.now();
      const tick = () => {
        if (canceled) return;
        const elapsed = performance.now() - startedAt;
        update(acknowledgedRingFrame(from, target, elapsed));
        if (elapsed < ACKNOWLEDGED_RING_ANIMATION_MS) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    return () => { canceled = true; if (frame !== undefined) cancelAnimationFrame(frame); };
  }, [target, resetKey]);
  return Math.min(displayed, target);
}
