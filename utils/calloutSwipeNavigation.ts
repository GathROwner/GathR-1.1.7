export type CalloutBrowseTab = 'events' | 'specials';
export type CalloutBrowsePage = { venueIndex: number; tab: CalloutBrowseTab };
export type CalloutSwipeDirection = 'next' | 'previous';

/** Flatten the visible lists in venue-selector order. Venue Info is tap-only. */
export function getCalloutBrowsePages(
  venues: readonly { hasEvents: boolean; hasSpecials: boolean }[],
): CalloutBrowsePage[] {
  return venues.flatMap((venue, venueIndex) => {
    const pages: CalloutBrowsePage[] = [];
    if (venue.hasEvents) pages.push({ venueIndex, tab: 'events' });
    if (venue.hasSpecials) pages.push({ venueIndex, tab: 'specials' });
    return pages;
  });
}

export function getAdjacentCalloutPage(
  pages: readonly CalloutBrowsePage[],
  current: { venueIndex: number; tab: CalloutBrowseTab | 'venue' },
  direction: CalloutSwipeDirection,
): CalloutBrowsePage | null {
  if (current.tab === 'venue' || pages.length === 0) return null;
  const index = pages.findIndex((page) => page.venueIndex === current.venueIndex && page.tab === current.tab);
  if (index < 0) {
    // A list can disappear as its last event expires. Continue from its place
    // in the sequence rather than stranding the user on that empty list.
    const position = (page: { venueIndex: number; tab: CalloutBrowseTab }) => page.venueIndex * 2 + (page.tab === 'specials' ? 1 : 0);
    const cursor = position({ venueIndex: current.venueIndex, tab: current.tab });
    return direction === 'next'
      ? pages.find((page) => position(page) > cursor) ?? pages[0]
      : [...pages].reverse().find((page) => position(page) < cursor) ?? pages[pages.length - 1];
  }
  if (pages.length === 1) return null;
  const step = direction === 'next' ? 1 : -1;
  return pages[(index + step + pages.length) % pages.length];
}

/** Once native axis locking selects horizontal intent, allow natural drift and short flicks. */
export function getCalloutSwipeDirection(
  x: number, y: number, velocityX = 0, velocityY = 0,
): CalloutSwipeDirection | null {
  if (![x, y, velocityX, velocityY].every(Number.isFinite) || Math.abs(x) < Math.abs(y) * 1.35) {
    return null;
  }
  const isDrag = Math.abs(x) >= 48;
  const isFlick = Math.abs(x) >= 16 && Math.abs(velocityX) >= 650 &&
    Math.sign(velocityX) === Math.sign(x) && Math.abs(velocityX) > Math.abs(velocityY) * 1.35;
  if (!isDrag && !isFlick) return null;
  return x < 0 ? 'next' : 'previous';
}
