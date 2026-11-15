import { useLayoutEffect, useMemo, useRef } from 'react';
import { createHybridTapDelivery, type HybridTapOptions } from '../utils/hybridTapDelivery';

export function useHybridTapDelivery<T>(options: HybridTapOptions<T>) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const delivery = useMemo(() => createHybridTapDelivery(() => latest.current), []);
  useLayoutEffect(() => { delivery.reset(); }, [options.active, delivery]);
  useLayoutEffect(() => () => delivery.invalidate(), [delivery]);
  return delivery;
}
