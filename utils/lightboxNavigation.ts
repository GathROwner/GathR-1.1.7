/** Parent overview carousels share a loop contract across their two modal hosts. */
export function shouldLoopGlobalLightbox(source?: string | null): boolean {
  return source === 'trending_manual' || source === 'trending_auto' || source === 'city_event_marker';
}

/** Resolve original item indices for both arrow and swipe navigation. */
export function getAdjacentLightboxIndex(
  index: number | undefined,
  count: number,
  direction: -1 | 1,
  loop = false,
): number | null {
  if (index === undefined || !Number.isInteger(index) || count <= 1 || index < 0 || index >= count) return null;
  const next = index + direction;
  if (loop) return (next + count) % count;
  return next >= 0 && next < count ? next : null;
}

/** Event-list position is independent of source media/gallery position. */
export function getLightboxEventPosition(index: number | undefined, count: number, loop: boolean) {
  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= count) return null;
  return { label: `Event ${index + 1} of ${count}`,
    previousLabel: loop && count > 1 && index === 0 ? 'Last event' : null,
    nextLabel: loop && count > 1 && index === count - 1 ? 'First event' : null };
}
