import {
  createLoopingCarouselItems, getLoopingCarouselStartIndex,
  getLoopingCarouselLogicalOffset, getLoopingCarouselRestoredOffset,
  getLoopingCarouselDotStops,
} from '../loopingCarousel';

describe('looping carousel', () => {
  it('keeps no items empty and a single item stationary', () => {
    expect(createLoopingCarouselItems([])).toEqual([]);
    expect(createLoopingCarouselItems(['only'])).toEqual([{ item: 'only', index: 0, slot: 0 }]);
    expect(getLoopingCarouselStartIndex(1)).toBe(0);
    expect(getLoopingCarouselRestoredOffset(172, 1, 172)).toBe(0);
  });

  it.each([2, 3, 20])('provides both neighbours from the initial position for %i items', count => {
    const originals = Array.from({ length: count }, (_, id) => ({ id }));
    const repeated = createLoopingCarouselItems(originals);
    const start = getLoopingCarouselStartIndex(count);
    expect(repeated[start].item).toBe(originals[0]);
    expect(repeated[start - 1].item).toBe(originals[count - 1]);
    expect(repeated[start + count].item).toBe(originals[0]);
    expect(new Set(repeated.map(card => card.slot)).size).toBe(repeated.length);
    expect(repeated.every(card => originals[card.index] === card.item)).toBe(true);
  });

  it.each([-0.5, -1, 0, 3.5, 4, 8, 12.25])('restores position %s without changing visible item or fractional offset', position => {
    const offset = position * 172;
    const restored = getLoopingCarouselRestoredOffset(offset, 4, 172);
    expect(restored).toBeGreaterThanOrEqual(8 * 172);
    expect(restored).toBeLessThan(12 * 172);
    expect(getLoopingCarouselLogicalOffset(restored, 4, 172)).toBe(getLoopingCarouselLogicalOffset(offset, 4, 172));
  });

  it('wraps backwards to the last item and forwards to the first', () => {
    expect(getLoopingCarouselLogicalOffset(-172, 4, 172)).toBe(3 * 172);
    expect(getLoopingCarouselLogicalOffset(4 * 172, 4, 172)).toBe(0);
  });

  it.each([2, 3, 20])('keeps periodic, strictly ordered dot stops for %i items', count => {
    for (let index = 0; index < count; index++) {
      const { inputRange, distances } = getLoopingCarouselDotStops(index, count, 172);
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(count * 172);
      expect(inputRange.every((value, i) => i === 0 || value > inputRange[i - 1])).toBe(true);
      expect(distances[0]).toBe(distances.at(-1));
      expect(distances[inputRange.indexOf(index * 172)]).toBe(0);
    }
  });
});
