import React, { useState } from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useCalloutLightboxPaging } from '../useCalloutLightboxPaging';

describe('callout-only lightbox paging', () => {
  let tree: renderer.ReactTestRenderer;
  let paging: ReturnType<typeof useCalloutLightboxPaging>;
  let index: number;
  let choose: React.Dispatch<React.SetStateAction<number>>;
  let completions: ((result: { finished: boolean }) => void)[];
  const navigate = jest.fn();
  function Probe({ enabled = true, reduceMotion = false, count = 4 }) {
    [index, choose] = useState(0);
    paging = useCalloutLightboxPaging({ index, count, width: 360, enabled, reduceMotion,
      onNavigate: (next) => { navigate(next); choose(next); },
    });
    return null;
  }
  function state(state: State, x = 0, y = 0, vx = 0) {
    act(() => paging.onStateChange({ nativeEvent: {
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

  it('commits one event after an accepted release, ignoring duplicate ends', () => {
    drag(); state(State.END, -100);
    expect(completions).toHaveLength(1);
    expect(navigate).not.toHaveBeenCalled();
    finish(0);
    expect(index).toBe(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('does not navigate on cancelled, failed, short or vertical gestures', () => {
    drag(-20);
    state(State.BEGAN); state(State.ACTIVE); state(State.CANCELLED, -100);
    state(State.BEGAN); state(State.FAILED, -100);
    state(State.BEGAN); state(State.ACTIVE); state(State.END, 10, 100);
    expect(navigate).not.toHaveBeenCalled(); expect(completions).toHaveLength(0);
  });
  it('interrupts settling without a stale completion double-advancing', () => {
    drag(); state(State.BEGAN);
    expect(index).toBe(1);
    finish(0); expect(navigate).toHaveBeenCalledTimes(1);
    state(State.ACTIVE); state(State.END, -100); finish(1);
    expect(index).toBe(2);
  });
  it('advances a synchronous cursor when the second release precedes React commit', () => {
    drag();
    act(() => {
      for (const [state, translationX] of [[State.BEGAN, 0], [State.ACTIVE, 0], [State.END, -100]]) {
        paging.onStateChange({ nativeEvent: { state, translationX, translationY: 0, velocityX: 0, velocityY: 0 } } as PanGestureHandlerStateChangeEvent);
      }
    });
    finish(0); finish(1);
    expect(index).toBe(2); expect(navigate).toHaveBeenCalledTimes(2);
  });
  it('uses the same transition for arrows and supports reverse navigation', () => {
    act(() => paging.step(1)); finish(0);
    act(() => paging.step(-1)); finish(1);
    expect(index).toBe(0);
  });
  it('does not let an unrecognized pan failure cancel an arrow tap', () => {
    state(State.BEGAN);
    act(() => paging.step(1));
    state(State.FAILED);
    expect(Animated.spring).not.toHaveBeenCalled();
    finish(0);
    expect(index).toBe(1);
  });
  it('snaps back at both ends without looping, dismissing or changing venue/tab', () => {
    drag(100); expect(completions).toHaveLength(0);
    act(() => choose(3)); drag();
    expect(completions).toHaveLength(0); expect(navigate).not.toHaveBeenCalled();
  });
  it('invalidates accepted navigation when disabled, explicitly reset, or unmounted', () => {
    drag(); act(() => paging.reset()); finish(0);
    drag(); act(() => tree.update(<Probe enabled={false} />)); finish(1);
    act(() => tree.update(<Probe />)); drag(); act(() => tree.unmount()); finish(2);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('accepts deliberate flicks, honors Reduce Motion, and leaves a single item unchanged', () => {
    act(() => tree.update(<Probe reduceMotion />));
    state(State.BEGAN); state(State.ACTIVE); state(State.END, -24, 4, -900);
    expect(index).toBe(1); expect(completions).toHaveLength(0);
    act(() => { choose(0); tree.update(<Probe reduceMotion count={1} />); });
    drag(); expect(navigate).toHaveBeenCalledTimes(1);
  });
});
