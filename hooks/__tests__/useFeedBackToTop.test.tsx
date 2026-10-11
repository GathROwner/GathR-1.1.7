import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useFeedBackToTop } from '../useFeedBackToTop';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));

describe('back-to-top scroll lifecycle', () => {
  let tree: renderer.ReactTestRenderer;
  let button: ReturnType<typeof useFeedBackToTop>;
  function Probe() { button = useFeedBackToTop(800); return null; }
  beforeEach(() => {
    jest.useFakeTimers(); mockFocused = true;
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });
  const wait = () => act(() => jest.advanceTimersByTime(250));

  it('waits for dragging and momentum to stop before appearing', () => {
    act(() => { button.onScrollBeginDrag(); button.onScroll(1200); });
    wait(); expect(button.visible).toBe(false);
    act(() => { button.onScrollEndDrag(); button.onMomentumScrollBegin(); });
    wait(); expect(button.visible).toBe(false);
    act(() => button.onMomentumScrollEnd());
    expect(button.visible).toBe(false);
    wait(); expect(button.visible).toBe(true);
    act(() => button.onScrollBeginDrag());
    expect(button.visible).toBe(false);
  });
  it('debounces programmatic scrolling and stays hidden near the top', () => {
    act(() => button.onScroll(1200));
    act(() => jest.advanceTimersByTime(150));
    act(() => button.onScroll(1300));
    act(() => jest.advanceTimersByTime(150));
    expect(button.visible).toBe(false);
    wait(); expect(button.visible).toBe(true);
    act(() => button.onScroll(0));
    wait(); expect(button.visible).toBe(false);
  });
  it('cancels pending appearance when leaving the tab', () => {
    act(() => button.onScroll(1200));
    mockFocused = false;
    act(() => tree.update(<Probe />));
    wait(); expect(button.visible).toBe(false);
  });
});
