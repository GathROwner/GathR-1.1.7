const COPIES = 5;
const MIDDLE_COPY = Math.floor(COPIES / 2);
const wrap = (value: number, period: number) => ((value % period) + period) % period;

export const getLoopingCarouselStartIndex = (count: number) => count > 1 ? count * MIDDLE_COPY : 0;

export function createLoopingCarouselItems<T>(items: readonly T[]) {
  return Array.from({ length: items.length * (items.length > 1 ? COPIES : 1) }, (_, slot) => ({
    item: items[slot % items.length],
    index: slot % items.length,
    slot,
  }));
}

export function getLoopingCarouselLogicalOffset(offset: number, count: number, stride: number) {
  if (count <= 1 || stride <= 0 || !Number.isFinite(offset)) return 0;
  return wrap(offset, count * stride);
}

/** Preserve the exact visible cards and fractional position while restoring space on both sides. */
export function getLoopingCarouselRestoredOffset(offset: number, count: number, stride: number) {
  return getLoopingCarouselStartIndex(count) * stride + getLoopingCarouselLogicalOffset(offset, count, stride);
}

/** Periodic dot stops give the same appearance on either side of the last-to-first seam. */
export function getLoopingCarouselDotStops(index: number, count: number, stride: number) {
  const period = count * stride;
  const inputRange = [...new Set([
    0, period,
    ...[-2, -1, 0, 1, 2].map(delta => wrap((index + delta) * stride, period)),
  ])].sort((first, second) => first - second);
  const distances = inputRange.map(offset => {
    const distance = Math.abs(offset / stride - index);
    return Math.min(distance, count - distance);
  });
  return { inputRange, distances };
}
