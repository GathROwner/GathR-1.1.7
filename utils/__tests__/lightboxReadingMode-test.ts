import { initialLightboxReadingState as initial, reduceLightboxReadingMode as reduce } from '../lightboxReadingMode';

describe('lightbox reading gestures', () => {
  it('ignores layout offsets and tiny accidental movement', () => {
    expect(reduce(initial, { type: 'scroll', y: 30, canScroll: true })).toBe(initial);
    const drag = reduce(initial, { type: 'begin', y: 0 });
    expect(reduce(drag, { type: 'scroll', y: 5, canScroll: true }).reading).toBe(false);
    expect(reduce(drag, { type: 'scroll', y: 30, canScroll: false }).reading).toBe(false);
  });

  it('stays collapsed when gaining space clamps the offset during the same gesture', () => {
    let state = reduce(initial, { type: 'begin', y: 0 });
    state = reduce(state, { type: 'scroll', y: 20, canScroll: true });
    expect(state.reading).toBe(true);
    state = reduce(state, { type: 'scroll', y: 0, canScroll: false });
    expect(state.reading).toBe(true);
    state = reduce(state, { type: 'end' });
    expect(reduce(state, { type: 'scroll', y: 0, canScroll: false }).reading).toBe(true);
  });

  it('restores when a later gesture returns to the description start, without recollapsing', () => {
    let state = reduce({ ...initial, reading: true }, { type: 'begin', y: 80 });
    state = reduce(state, { type: 'scroll', y: 3, canScroll: true });
    expect(state.reading).toBe(false);
    expect(reduce(state, { type: 'scroll', y: 20, canScroll: true }).reading).toBe(false);
  });

  it('supports momentum returning to the start', () => {
    let state = reduce({ ...initial, reading: true }, { type: 'begin', y: 80 });
    state = reduce(state, { type: 'end' });
    state = reduce(state, { type: 'momentum' });
    expect(reduce(state, { type: 'scroll', y: 0, canScroll: true }).reading).toBe(false);
  });

  it('allows explicit restoration even when all remaining copy now fits', () => {
    expect(reduce({ ...initial, reading: true }, { type: 'restore' })).toEqual(initial);
  });
});
