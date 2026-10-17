import React, { useState } from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useCalloutSwipeTransition } from '../useCalloutSwipeTransition';
import { getCalloutBrowsePages, type CalloutBrowsePage } from '../../utils/calloutSwipeNavigation';

describe('interruptible callout swipe navigation', () => {
  const pages = getCalloutBrowsePages([
    { hasEvents: true, hasSpecials: true }, { hasEvents: true, hasSpecials: true },
  ]);
  let tree: renderer.ReactTestRenderer;
  let swipe: ReturnType<typeof useCalloutSwipeTransition>;
  let current: CalloutBrowsePage;
  let choosePage: React.Dispatch<React.SetStateAction<CalloutBrowsePage>>;
  let completions: ((result: { finished: boolean }) => void)[];
  const navigate = jest.fn();

  function Probe({ enabled = true, reduceMotion = false }) {
    [current, choosePage] = useState(pages[0]);
    swipe = useCalloutSwipeTransition({ pages, current, width: 360, enabled, reduceMotion,
      onNavigate: (page) => { navigate(page); choosePage(page); },
    });
    return null;
  }
  function state(state: State, x = 0, y = 0, vx = 0) {
    act(() => swipe.onStateChange({ nativeEvent: {
      state, translationX: x, translationY: y, velocityX: vx, velocityY: 0,
    } } as PanGestureHandlerStateChangeEvent));
  }
  function drag(x = -100) { state(State.BEGAN); state(State.ACTIVE); state(State.END, x); }
  const finish = (index: number) => act(() => completions[index]({ finished: true }));

  beforeEach(() => {
    completions = []; navigate.mockClear();
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: (callback?: (result: { finished: boolean }) => void) => { if (callback) completions.push(callback); },
      stop: jest.fn(), reset: jest.fn(),
    }));
    jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

  it('commits once after sliding out and ignores a duplicate end event', () => {
    drag();
    expect(navigate).not.toHaveBeenCalled();
    state(State.END, -100);
    expect(completions).toHaveLength(1);
    finish(0);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(current).toEqual(pages[1]);
    expect(Animated.spring).toHaveBeenCalled();
  });

  it('finishes an interrupted accepted swipe and accepts the next, without a timed input lock', () => {
    drag();
    state(State.BEGAN);
    expect(current).toEqual(pages[1]);
    finish(0); // Late completion from the interrupted exit cannot navigate again.
    expect(navigate).toHaveBeenCalledTimes(1);
    state(State.ACTIVE); state(State.END, -100);
    finish(1);
    expect(current).toEqual(pages[2]);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('allows reversing direction while the prior entry is still settling', () => {
    drag(); finish(0);
    drag(100); finish(1);
    expect(current).toEqual(pages[0]);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('keeps a second release when it arrives before React commits the interrupted first page', () => {
    drag();
    act(() => {
      for (const [state, translationX] of [[State.BEGAN, 0], [State.ACTIVE, 0], [State.END, -100]]) {
        swipe.onStateChange({ nativeEvent: {
          state, translationX, translationY: 0, velocityX: 0, velocityY: 0,
        } } as PanGestureHandlerStateChangeEvent);
      }
    });
    expect(current).toEqual(pages[1]);
    finish(0);
    finish(1);
    expect(current).toEqual(pages[2]);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('snaps back after a short drag, cancellation, or vertical recognition failure', () => {
    drag(-20);
    state(State.BEGAN); state(State.ACTIVE); state(State.CANCELLED, -100);
    state(State.BEGAN); state(State.FAILED, 5, 60);
    expect(navigate).not.toHaveBeenCalled();
    expect(completions).toHaveLength(0);
    expect(Animated.spring).toHaveBeenCalled();
  });

  it('does not let a pending swipe override an explicit tab/venue choice', () => {
    drag();
    act(() => { swipe.reset(); choosePage(pages[3]); });
    finish(0);
    expect(current).toEqual(pages[3]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels pending navigation when the lightbox or minimized state disables browsing', () => {
    drag();
    act(() => { tree.update(<Probe enabled={false} />); });
    finish(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('invalidates callbacks after unmount', () => {
    drag();
    act(() => tree.unmount());
    finish(0);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('supports velocity flicks and reduce motion without waiting for an animation', () => {
    act(() => { tree.update(<Probe reduceMotion />); });
    state(State.BEGAN); state(State.ACTIVE); state(State.END, -24, 4, -900);
    expect(current).toEqual(pages[1]);
    expect(completions).toHaveLength(0);
  });
});
