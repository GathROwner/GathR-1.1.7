import { getAdjacentCalloutPage, getCalloutBrowsePages, getCalloutSwipeDirection } from '../calloutSwipeNavigation';

describe('callout browsing loop', () => {
  const pages = getCalloutBrowsePages([
    { hasEvents: true, hasSpecials: true },
    { hasEvents: false, hasSpecials: true },
    { hasEvents: false, hasSpecials: false },
    { hasEvents: true, hasSpecials: false },
  ]);

  it('orders lists by venue and skips empty lists and venues', () => {
    expect(pages).toEqual([
      { venueIndex: 0, tab: 'events' }, { venueIndex: 0, tab: 'specials' },
      { venueIndex: 1, tab: 'specials' }, { venueIndex: 3, tab: 'events' },
    ]);
  });

  it('moves forward and backward through every page, wrapping repeatedly', () => {
    let current = pages[0];
    for (let i = 1; i <= 12; i++) {
      current = getAdjacentCalloutPage(pages, current, 'next')!;
      expect(current).toEqual(pages[i % pages.length]);
    }
    for (let i = 1; i <= 12; i++) {
      current = getAdjacentCalloutPage(pages, current, 'previous')!;
      expect(current).toEqual(pages[(pages.length - (i % pages.length)) % pages.length]);
    }
  });

  it('keeps Venue Info out of swipe navigation, including when manually selected', () => {
    expect(getAdjacentCalloutPage(pages, { venueIndex: 0, tab: 'venue' }, 'next')).toBeNull();
    expect(getAdjacentCalloutPage(pages, { venueIndex: 0, tab: 'venue' }, 'previous')).toBeNull();
  });

  it('does nothing for an empty loop or when already on its only list', () => {
    expect(getAdjacentCalloutPage([], pages[0], 'next')).toBeNull();
    expect(getAdjacentCalloutPage([pages[0]], pages[0], 'next')).toBeNull();
  });

  it('continues in either direction if the current list becomes empty', () => {
    expect(getAdjacentCalloutPage(pages, { venueIndex: 1, tab: 'events' }, 'next')).toEqual(pages[2]);
    expect(getAdjacentCalloutPage(pages, { venueIndex: 1, tab: 'events' }, 'previous')).toEqual(pages[1]);
    expect(getAdjacentCalloutPage([pages[3]], pages[0], 'next')).toEqual(pages[3]);
  });

  it('loops between Events and Specials for a single venue with both', () => {
    const single = pages.slice(0, 2);
    expect(getAdjacentCalloutPage(single, single[1], 'next')).toEqual(single[0]);
    expect(getAdjacentCalloutPage(single, single[0], 'previous')).toEqual(single[1]);
  });
});

describe('deliberate horizontal swipes', () => {
  it.each([
    [-100, 0, 'next'], [100, 0, 'previous'], [-60, 10, 'next'],
    [0, 100, null], [40, 0, null], [-100, 80, null], [100, -40, 'previous'],
    [NaN, 0, null], [100, Infinity, null],
  ])('classifies (%s, %s) as %s', (x, y, expected) => {
    expect(getCalloutSwipeDirection(x as number, y as number)).toBe(expected);
  });

  it('accepts a deliberate drag with natural vertical drift', () => {
    expect(getCalloutSwipeDirection(-120, 60)).toBe('next');
    expect(getCalloutSwipeDirection(48, 20)).toBe('previous');
    expect(getCalloutSwipeDirection(80, 90, 1000, 1200)).toBeNull();
  });

  it('accepts short horizontal flicks without treating taps or vertical flicks as navigation', () => {
    expect(getCalloutSwipeDirection(-24, 5, -900, 80)).toBe('next');
    expect(getCalloutSwipeDirection(20, 3, 800, 100)).toBe('previous');
    expect(getCalloutSwipeDirection(12, 0, 1000, 0)).toBeNull();
    expect(getCalloutSwipeDirection(24, 0, 300, 0)).toBeNull();
    expect(getCalloutSwipeDirection(24, 5, -900, 0)).toBeNull();
    expect(getCalloutSwipeDirection(24, 5, 900, 1000)).toBeNull();
    expect(getCalloutSwipeDirection(80, 0, NaN, 0)).toBeNull();
  });
});
