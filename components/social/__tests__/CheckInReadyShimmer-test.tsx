import React from 'react';
import { Animated } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CheckInReadyShimmer } from '../CheckInReadyShimmer';

let mockReduceMotion = false;
jest.mock('../../../hooks/useReduceMotion', () => ({ useReduceMotion: () => mockReduceMotion }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));

let tree: renderer.ReactTestRenderer;
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(2_000_000_100_000); mockReduceMotion = false;
  jest.spyOn(Animated, 'timing');
  jest.spyOn(Animated, 'sequence').mockImplementation(() => ({
    start: callback => callback?.({ finished: true }), stop: jest.fn(), reset: jest.fn(),
  }));
});
afterEach(() => { act(() => tree?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
const mount = (active = true) => act(() => { tree = renderer.create(<CheckInReadyShimmer active={active} />); });

it('uses one short sweep after readiness, then waits 90 seconds before another', () => {
  mount();
  act(() => jest.advanceTimersByTime(1199)); expect(Animated.sequence).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1)); expect(Animated.sequence).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(89_999)); expect(Animated.sequence).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1)); expect(Animated.sequence).toHaveBeenCalledTimes(2);
});

it('stops while hidden and retains a cooldown when a check-in flow or background interruption ends', () => {
  mount(); act(() => jest.advanceTimersByTime(1200));
  act(() => tree.update(<CheckInReadyShimmer active={false} />));
  expect(tree.toJSON()).toBeNull();
  act(() => jest.advanceTimersByTime(0));
  act(() => tree.update(<CheckInReadyShimmer active />));
  act(() => jest.advanceTimersByTime(89_999)); expect(Animated.sequence).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(1)); expect(Animated.sequence).toHaveBeenCalledTimes(2);
});

it('respects Reduce Motion and cleans up its pending timer on unmount', () => {
  mockReduceMotion = true; mount();
  expect(tree.toJSON()).toBeNull(); expect(jest.getTimerCount()).toBe(0);
  mockReduceMotion = false;
  act(() => tree.update(<CheckInReadyShimmer active />));
  expect(jest.getTimerCount()).toBe(1);
  act(() => tree.unmount());
  act(() => jest.advanceTimersByTime(180_000));
  expect(Animated.sequence).not.toHaveBeenCalled();
});
