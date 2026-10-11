import { advanceFeedChromeScroll as advance, initialFeedChromeScrollState as initial } from '../feedChromeScroll';

describe('feed chrome scroll intent', () => {
  it('keeps controls visible near the top and hides on downward travel', () => {
    let state = advance(initial(), 40, 1000);
    expect(state.hidden).toBe(false);
    state = advance(state, 65, 1000);
    expect(state.hidden).toBe(true);
    expect(advance(state, 18, 1000).hidden).toBe(false);
  });

  it('accumulates slow upward movement but ignores tiny reversals', () => {
    let state = advance(initial(), 200, 1000);
    state = advance(state, 198, 1000);
    expect(state.hidden).toBe(true);
    state = advance(state, 196, 1000);
    state = advance(state, 194, 1000);
    state = advance(state, 192, 1000);
    expect(state.hidden).toBe(false);
  });

  it('does not reveal from bottom bounce or hide from top bounce', () => {
    let state = advance(initial(), 1000, 1000);
    state = advance(state, 1040, 1000);
    expect(advance(state, 1000, 1000).hidden).toBe(true);
    state = advance(initial(), -40, 1000);
    expect(advance(state, 0, 1000).hidden).toBe(false);
    expect(advance(initial(), 200, -20).hidden).toBe(false);
  });
});
