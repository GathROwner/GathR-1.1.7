import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useCalloutLightboxDismiss } from '../useCalloutLightboxDismiss';

describe('callout media swipe-down dismissal', () => {
  let tree: renderer.ReactTestRenderer;
  let handler: ReturnType<typeof useCalloutLightboxDismiss>;
  let completions: ((result: { finished: boolean }) => void)[];
  let stops: jest.Mock[];
  const close = jest.fn();
  const begin = jest.fn();
  const y = new Animated.Value(0);
  const opacity = new Animated.Value(1);
  function Probe({ onClose = close, reduceMotion = false }) {
    handler = useCalloutLightboxDismiss({ translateY: y, backgroundOpacity: opacity,
      height: 800, reduceMotion, onBegin: begin, onClose });
    return null;
  }
  function state(state: State, translationY = 0, velocityY = 0, translationX = 0) {
    act(() => handler.onStateChange({ nativeEvent: { state, translationX, translationY, velocityY } } as PanGestureHandlerStateChangeEvent));
  }
  function pull(end: State = State.END, distance = 90, velocity = 0) {
    state(State.BEGAN); state(State.ACTIVE); state(end, distance, velocity);
  }
  beforeEach(() => {
    completions = []; stops = []; close.mockClear(); begin.mockClear();
    jest.spyOn(Animated, 'event').mockImplementation((_mapping, config) => (event) => config?.listener?.(event));
    jest.spyOn(Animated, 'parallel').mockImplementation(() => {
      const stop = jest.fn(); stops.push(stop);
      return { start: (callback) => { if (callback) completions.push(callback); }, stop, reset: jest.fn() };
    });
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

  it('closes a completed pull without relying on oldState or a final velocity', () => {
    pull(State.END, 90, NaN);
    expect(completions).toHaveLength(1);
    act(() => completions[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('preserves dismissal after a long native-cancelled pull', () => {
    pull(State.CANCELLED, 180);
    act(() => completions[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('does not let late failed/cancelled/end/began events snap an accepted close back', () => {
    pull();
    for (const late of [State.FAILED, State.CANCELLED, State.END, State.BEGAN]) state(late);
    expect(stops[0]).not.toHaveBeenCalled();
    expect(begin).toHaveBeenCalledTimes(1);
    act(() => { completions[0]({ finished: true }); completions[0]({ finished: true }); });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('ignores queued drag fade writes once closing starts', () => {
    const setOpacity = jest.spyOn(opacity, 'setValue');
    state(State.BEGAN);
    act(() => handler.onGestureEvent({ nativeEvent: { translationY: 60 } }));
    expect(setOpacity).toHaveBeenLastCalledWith(0.72);
    state(State.ACTIVE); state(State.END, 90);
    setOpacity.mockClear();
    act(() => handler.onGestureEvent({ nativeEvent: { translationY: 90 } }));
    expect(setOpacity).not.toHaveBeenCalled();
    act(() => completions[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('snaps short/upward/sideways pulls back and ignores tap failures', () => {
    state(State.BEGAN); state(State.FAILED);
    expect(stops).toHaveLength(0);
    pull(State.END, 12, 900);
    pull(State.CANCELLED, 24, 900);
    pull(State.END, -180, -900);
    state(State.BEGAN); state(State.ACTIVE); state(State.END, 100, 900, 180);
    state(State.BEGAN); state(State.ACTIVE); state(State.FAILED, 180, 900);
    expect(completions).toHaveLength(0);
    expect(close).not.toHaveBeenCalled();
  });
  it('allows a quick short downward flick and uses the newest close callback', () => {
    const updatedClose = jest.fn();
    pull(State.END, 24, 350);
    act(() => tree.update(<Probe onClose={updatedClose} />));
    act(() => completions[0]({ finished: true }));
    expect(updatedClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });
  it('allows retry after an interrupted close and invalidates callbacks on unmount', () => {
    pull(); act(() => completions[0]({ finished: false }));
    pull(); act(() => tree.unmount());
    act(() => completions[1]({ finished: true }));
    expect(close).not.toHaveBeenCalled();
    expect(stops[1]).toHaveBeenCalled();
  });
  it('honors Reduce Motion with zero-duration close animations', () => {
    const timing = jest.spyOn(Animated, 'timing');
    act(() => tree.update(<Probe reduceMotion />));
    pull();
    expect(timing).toHaveBeenCalledWith(y, expect.objectContaining({ toValue: 800, duration: 0 }));
    act(() => completions[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
