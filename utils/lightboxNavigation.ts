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
