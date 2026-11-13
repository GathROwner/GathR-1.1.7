import { useLayoutEffect, useRef } from 'react';

const blockers = new Map<symbol, boolean>();
export function hasOtaSafetyBlock() { return [...blockers.values()].some(Boolean); }

// Keep mounted-but-unfocused drafts guarded too: another screen must not
// silently discard work by offering Update now.
export function useOtaSafetyBlock(blocked: boolean) {
  const key = useRef(Symbol('ota-flow')).current;
  useLayoutEffect(() => {
    blockers.set(key, blocked);
    return () => { blockers.delete(key); };
  }, [blocked, key]);
}
