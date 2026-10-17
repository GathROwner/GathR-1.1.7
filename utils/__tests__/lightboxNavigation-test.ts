import { getAdjacentLightboxIndex, getLightboxEventPosition } from '../lightboxNavigation';

describe('lightbox item navigation', () => {
  it.each([2, 5, 13])('labels actual wrap destinations and event-list count for %i events', count => {
    expect(getLightboxEventPosition(0, count, true)).toEqual({ label: `Event 1 of ${count}`, previousLabel: 'Last event', nextLabel: null });
    expect(getLightboxEventPosition(count - 1, count, true)).toEqual({ label: `Event ${count} of ${count}`, previousLabel: null, nextLabel: 'First event' });
    expect(getLightboxEventPosition(0, count, false)?.previousLabel).toBeNull();
    expect(getLightboxEventPosition(count - 1, count, false)?.nextLabel).toBeNull();
  });
  it('keeps interior arrows normal, one event honest and invalid source positions hidden', () => {
    expect(getLightboxEventPosition(2, 5, true)).toEqual({ label: 'Event 3 of 5', previousLabel: null, nextLabel: null });
    expect(getLightboxEventPosition(0, 1, true)).toEqual({ label: 'Event 1 of 1', previousLabel: null, nextLabel: null });
    expect(getLightboxEventPosition(5, 5, true)).toBeNull(); expect(getLightboxEventPosition(undefined, 5, true)).toBeNull();
  });
  it('wraps first to last and last to first for carousel lightboxes', () => {
    expect(getAdjacentLightboxIndex(0, 20, -1, true)).toBe(19);
    expect(getAdjacentLightboxIndex(19, 20, 1, true)).toBe(0);
    expect(getAdjacentLightboxIndex(7, 20, -1, true)).toBe(6);
    expect(getAdjacentLightboxIndex(7, 20, 1, true)).toBe(8);
  });

  it('can keep navigating through multiple complete cycles in either direction', () => {
    for (const direction of [-1, 1] as const) {
      let index = 0;
      const visited: number[] = [];
      for (let step = 0; step < 9; step++) {
        index = getAdjacentLightboxIndex(index, 3, direction, true)!;
        visited.push(index);
      }
      expect(visited).toEqual(direction === 1 ? [1, 2, 0, 1, 2, 0, 1, 2, 0] : [2, 1, 0, 2, 1, 0, 2, 1, 0]);
    }
  });

  it('retains bounded navigation when looping is not enabled', () => {
    expect(getAdjacentLightboxIndex(0, 3, -1)).toBeNull();
    expect(getAdjacentLightboxIndex(2, 3, 1)).toBeNull();
    expect(getAdjacentLightboxIndex(1, 3, -1)).toBe(0);
    expect(getAdjacentLightboxIndex(1, 3, 1)).toBe(2);
  });

  it('shows both directions for two items without duplicating the logical count', () => {
    expect(getAdjacentLightboxIndex(0, 2, -1, true)).toBe(1);
    expect(getAdjacentLightboxIndex(0, 2, 1, true)).toBe(1);
    expect(getAdjacentLightboxIndex(1, 2, -1, true)).toBe(0);
    expect(getAdjacentLightboxIndex(1, 2, 1, true)).toBe(0);
  });

  it.each([undefined, -1, 3, 0.5])('does not navigate an invalid current index %s', index => {
    expect(getAdjacentLightboxIndex(index, 3, 1, true)).toBeNull();
  });

  it.each([0, 1])('does not navigate %i items even with looping enabled', count => {
    expect(getAdjacentLightboxIndex(0, count, -1, true)).toBeNull();
    expect(getAdjacentLightboxIndex(0, count, 1, true)).toBeNull();
  });
});
