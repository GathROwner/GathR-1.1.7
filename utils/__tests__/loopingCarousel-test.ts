import {
  createLoopingCarouselItems, getLoopingCarouselStartIndex,
  getLoopingCarouselLogicalOffset, getLoopingCarouselRestoredOffset,
  getLoopingCarouselDotStops,
  getCarouselMetrics, getCarouselPeriod, getCarouselSlotLayout, getCarouselStartOffset,
  getCarouselAnchor, getCarouselAnchorOffset, resolveCarouselAnchor,
} from '../loopingCarousel';

describe('looping carousel', () => {
  it('keeps no items empty and a single item stationary', () => {
    expect(createLoopingCarouselItems([])).toEqual([]);
    expect(createLoopingCarouselItems(['only'])).toEqual([{ kind: 'event', item: 'only', index: 0, slot: 0 }]);
    expect(getLoopingCarouselStartIndex(1)).toBe(0);
    expect(getLoopingCarouselRestoredOffset(172, 1, 172)).toBe(0);
  });

  it('keeps two cards finite, in order, without clones or a seam', () => {
    const originals = [{ id: 'first' }, { id: 'last' }], slots = createLoopingCarouselItems(originals);
    expect(slots).toHaveLength(2); expect(slots.every(slot => slot.kind === 'event')).toBe(true);
    expect(slots.map(slot => slot.kind === 'event' && slot.item)).toEqual(originals);
    expect(getLoopingCarouselStartIndex(2)).toBe(0);
  });
  it.each([3, 13, 20])('preserves both neighbours and a passive seam for %i events', count => {
    const originals = Array.from({ length: count }, (_, id) => ({ id }));
    const repeated = createLoopingCarouselItems(originals);
    const start = getLoopingCarouselStartIndex(count);
    expect(repeated[start]).toMatchObject({ kind: 'event', item: originals[0], index: 0 });
    expect(repeated[start - 1].kind).toBe('seam');
    expect(repeated[start - 2]).toMatchObject({ item: originals[count - 1], index: count - 1 });
    expect(repeated[start + count].kind).toBe('seam');
    expect(repeated[start + count + 1]).toMatchObject({ item: originals[0], index: 0 });
    expect(new Set(repeated.map(card => card.slot)).size).toBe(repeated.length);
    expect(repeated.every(card => card.kind === 'seam' || originals[card.index] === card.item)).toBe(true);
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

  it.each([3, 13, 20])('keeps periodic, strictly ordered dot stops for %i items', count => {
    for (let index = 0; index < count; index++) {
      const { inputRange, distances } = getLoopingCarouselDotStops(index, count, 172);
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(count * 172);
      expect(inputRange.every((value, i) => i === 0 || value > inputRange[i - 1])).toBe(true);
      expect(distances[0]).toBe(distances.at(-1));
      expect(distances[inputRange.indexOf(index * 172)]).toBe(0);
    }
  });
  it.each([320, 360, 390, 768])('fits two complete readable cards plus seam at %i dp', width => {
    const metrics = getCarouselMetrics(width, 13);
    expect(2 * metrics.cardWidth + metrics.seamWidth + 2 * metrics.gap + 16).toBeLessThanOrEqual(width);
    expect(metrics.cardWidth).toBeGreaterThanOrEqual(126); expect(metrics.seamWidth).toBeGreaterThanOrEqual(28);
    expect(metrics.seamWidth).toBeLessThanOrEqual(36);
    const finite = getCarouselMetrics(width, 2);
    expect(2 * finite.cardWidth + finite.gap + 16).toBeLessThanOrEqual(width); expect(finite.seamWidth).toBe(0);
  });
  it.each([3, 13])('uses exact variable widths, no separator snap, and periodic dots through the seam for %i events', count => {
    const { cardWidth, gap, stride, seamWidth, seamSpan } = getCarouselMetrics(360, count);
    const slots = createLoopingCarouselItems(Array.from({ length: count }, (_, id) => ({ id })));
    const layouts = slots.map(slot => getCarouselSlotLayout(slot.slot, count, cardWidth, gap, seamWidth));
    layouts.forEach((layout, index) => { if (index) expect(layout.offset).toBe(layouts[index - 1].offset + layouts[index - 1].length + gap); });
    expect(layouts[count].length).toBe(seamWidth); expect(layouts[count + 1].offset).toBe(getCarouselPeriod(count, stride, seamSpan));
    const snaps = slots.filter(slot => slot.kind === 'event').map(slot => layouts[slot.slot].offset);
    slots.filter(slot => slot.kind === 'seam').forEach(slot => expect(snaps).not.toContain(layouts[slot.slot].offset));
    for (let offset = -2 * getCarouselPeriod(count, stride, seamSpan); offset < 5 * getCarouselPeriod(count, stride, seamSpan); offset += 19.5) {
      const restored = getLoopingCarouselRestoredOffset(offset, count, stride, seamSpan);
      expect(getLoopingCarouselLogicalOffset(restored, count, stride, seamSpan)).toBeCloseTo(getLoopingCarouselLogicalOffset(offset, count, stride, seamSpan), 8);
      const anchor = getCarouselAnchor(offset, count, stride, seamSpan);
      expect(getCarouselAnchor(restored, count, stride, seamSpan)).toEqual(anchor);
    }
    const dots = getLoopingCarouselDotStops(count - 1, count, stride, seamSpan);
    expect(dots.inputRange.at(-1)).toBe(getCarouselPeriod(count, stride, seamSpan));
    expect(dots.distances[0]).toBe(dots.distances.at(-1));
  });
  it('preserves last-card fractional progress through orientation/width changes and handles 2→3→2', () => {
    const old = getCarouselMetrics(360, 13), next = getCarouselMetrics(320, 13);
    const offset = getCarouselAnchorOffset(12, 0.63, 13, old.stride, old.seamSpan);
    expect(getCarouselAnchor(offset, 13, old.stride, old.seamSpan)).toEqual({ index: 12, fraction: expect.closeTo(0.63) });
    const resized = getCarouselAnchorOffset(12, 0.63, 13, next.stride, next.seamSpan);
    expect(getCarouselAnchor(resized, 13, next.stride, next.seamSpan)).toEqual({ index: 12, fraction: expect.closeTo(0.63) });
    expect(createLoopingCarouselItems(['a','b'])).toHaveLength(2);
    expect(createLoopingCarouselItems(['a','b','c']).filter(slot => slot.kind === 'event')).toHaveLength(15);
    expect(getCarouselAnchorOffset(1, 0, 2, 160, 0)).toBe(0);
    expect(getCarouselStartOffset(3, 160, 40)).toBe(1040);
  });
  it('resets an unrelated category to its first card, but retains matching ID/fraction across reorder and resize', () => {
    const previous = { id: 'music-last', fraction: 0.63 };
    expect(resolveCarouselAnchor([{ id: 'family-first' }, { id: 'family-next' }], previous)).toEqual({ index: 0, id: 'family-first', fraction: 0 });
    expect(resolveCarouselAnchor([{ id: 'other' }, { id: 'music-last' }], previous)).toEqual({ index: 1, id: 'music-last', fraction: 0.63 });
    expect(resolveCarouselAnchor([], previous)).toEqual({ index: 0, id: '', fraction: 0 });
  });
});
