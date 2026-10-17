const COPIES = 5;
const MIDDLE_COPY = Math.floor(COPIES / 2);
const wrap = (value: number, period: number) => ((value % period) + period) % period;
export const isLoopingCarousel = (count: number) => count >= 3;
export type CarouselSlot<T> = { kind: 'event'; item: T; index: number; slot: number } | { kind: 'seam'; slot: number };

/** Separators are passive geometry, never an event index or a snap destination. */
export function createLoopingCarouselItems<T>(items: readonly T[]): CarouselSlot<T>[] {
  const loop = isLoopingCarousel(items.length), slots: CarouselSlot<T>[] = [];
  for (let copy = 0; copy < (loop ? COPIES : 1); copy++) {
    items.forEach((item, index) => slots.push({ kind: 'event', item, index, slot: slots.length }));
    if (loop) slots.push({ kind: 'seam', slot: slots.length });
  }
  return slots;
}
export const getLoopingCarouselStartIndex = (count: number) => isLoopingCarousel(count) ? (count + 1) * MIDDLE_COPY : 0;
export const getCarouselPeriod = (count: number, stride: number, seamSpan = 0) => count * stride + (isLoopingCarousel(count) ? seamSpan : 0);
export const getCarouselStartOffset = (count: number, stride: number, seamSpan = 0) =>
  isLoopingCarousel(count) ? MIDDLE_COPY * getCarouselPeriod(count, stride, seamSpan) : 0;
export function getLoopingCarouselLogicalOffset(offset: number, count: number, stride: number, seamSpan = 0) {
  if (count <= 1 || stride <= 0 || !Number.isFinite(offset)) return 0;
  return isLoopingCarousel(count) ? wrap(offset, getCarouselPeriod(count, stride, seamSpan)) : Math.max(0, offset);
}
export function getLoopingCarouselRestoredOffset(offset: number, count: number, stride: number, seamSpan = 0) {
  return getCarouselStartOffset(count, stride, seamSpan) + getLoopingCarouselLogicalOffset(offset, count, stride, seamSpan);
}
/** Fractional logical position includes the wider last-to-first interval. */
export function getCarouselAnchor(offset: number, count: number, stride: number, seamSpan = 0) {
  if (count <= 1 || stride <= 0) return { index: 0, fraction: 0 };
  const logical = getLoopingCarouselLogicalOffset(offset, count, stride, seamSpan);
  const index = Math.min(count - 1, Math.floor(logical / stride));
  const interval = stride + (isLoopingCarousel(count) && index === count - 1 ? seamSpan : 0);
  return { index, fraction: Math.min(1, Math.max(0, (logical - index * stride) / interval)) };
}
export function getCarouselAnchorOffset(index: number, fraction: number, count: number, stride: number, seamSpan = 0) {
  if (count <= 2) return 0; // Both finite cards fit in the measured viewport.
  const validIndex = Math.max(0, Math.min(count - 1, index));
  return getCarouselStartOffset(count, stride, seamSpan) + validIndex * stride
    + Math.max(0, Math.min(1, fraction)) * (stride + (validIndex === count - 1 ? seamSpan : 0));
}
export function resolveCarouselAnchor(items: readonly { id: string | number }[], anchor: { id: string; fraction: number }) {
  const match = items.findIndex(item => String(item.id) === anchor.id);
  const index = Math.max(0, match);
  return { index, id: String(items[index]?.id ?? ''), fraction: match >= 0 ? anchor.fraction : 0 };
}
export function getCarouselSlotLayout(slot: number, count: number, cardWidth: number, gap: number, seamWidth: number) {
  const stride = cardWidth + gap, loop = isLoopingCarousel(count), block = count + (loop ? 1 : 0);
  const cycle = block ? Math.floor(slot / block) : 0, within = block ? slot % block : 0;
  return { index: slot, length: loop && within === count ? seamWidth : cardWidth,
    offset: cycle * getCarouselPeriod(count, stride, seamWidth + gap) + within * stride };
}
export function getCarouselMetrics(viewportWidth: number, count: number) {
  const width = Math.max(1, viewportWidth), gap = 12, padding = 8;
  const seamWidth = isLoopingCarousel(count) ? Math.round(Math.max(28, Math.min(36, width * 0.085))) : 0;
  const reserved = 2 * padding + (isLoopingCarousel(count) ? seamWidth + 2 * gap : gap);
  const cardWidth = count <= 1 ? Math.min(160, width - 2 * padding) : Math.max(1, Math.min(160, Math.floor((width - reserved) / 2)));
  return { cardWidth, gap, seamWidth, stride: cardWidth + gap, seamSpan: isLoopingCarousel(count) ? seamWidth + gap : 0 };
}
/** Existing dot footprint, interpolated through real card starts, without a separator page. */
export function getLoopingCarouselDotStops(index: number, count: number, stride: number, seamSpan = 0) {
  if (count <= 2) return { inputRange: [0, stride], distances: [index, Math.abs(1 - index)] };
  const period = getCarouselPeriod(count, stride, seamSpan);
  const inputRange = [...new Set([0, period, ...[-2, -1, 0, 1, 2].map(delta => wrap(index + delta, count) * stride)])].sort((a, b) => a - b);
  const distances = inputRange.map(offset => {
    const position = offset === period ? count : offset / stride;
    const distance = Math.abs(position - index);
    return Math.min(distance, count - distance);
  });
  return { inputRange, distances };
}
