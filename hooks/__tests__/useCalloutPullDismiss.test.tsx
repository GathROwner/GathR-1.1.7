import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useCalloutPullDismiss } from '../useCalloutPullDismiss';

describe('callout dismissal ownership and completion', () => {
  let tree: renderer.ReactTestRenderer;
  let pull: ReturnType<typeof useCalloutPullDismiss>;
  let scrollY: number;
  let completions: ((result: { finished: boolean }) => void)[];
  const close = jest.fn<boolean | void, []>();
  const accepted = jest.fn();
  function Probe({ enabled = true, reduceMotion = false }) {
    pull = useCalloutPullDismiss({ enabled, reduceMotion, sheetHeight: 500, screenHeight: 844,
      scrollY: () => scrollY, onClose: close, onCloseAccepted: accepted });
    return <Animated.View style={{ transform: [{ translateY: pull.translateY }] }} />;
  }
  function state(state: State, x = 0, y = 0, velocity = 0) {
    act(() => pull.onStateChange({ nativeEvent: { state, translationX: x, translationY: y, velocityY: velocity } } as PanGestureHandlerStateChangeEvent));
  }
  function drag(distance: number, velocity = 0) {
    act(() => { pull.begin(); pull.move(distance); pull.finish(velocity); });
  }
  function nativeDrag(y: number, x = 0) {
    // Native Animated.event is an AnimatedEvent object; RN's Jest shim exposes
    // its argument mapping. Write the mapped value as the native driver does.
    const event = pull.onGestureEvent as any;
    act(() => event._argMapping[0].nativeEvent.translationY.setValue(y));
  }
  beforeEach(() => {
    scrollY = 0; completions = []; close.mockReset(); accepted.mockReset();
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({
      start: callback => { if (callback) completions.push(callback); }, stop: jest.fn(), reset: jest.fn(),
    }));
    jest.spyOn(Animated, 'spring').mockImplementation(() => ({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() }));
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

  it('follows a slow pull continuously and closes once after completion', () => {
    act(() => { pull.begin(); pull.move(60); });
    expect((pull.translateY as any).__getValue()).toBe(60);
    act(() => { pull.move(120); pull.finish(0); });
    expect(close).not.toHaveBeenCalled();
    act(() => completions[0]({ finished: true }));
    expect(close).toHaveBeenCalledTimes(1); expect(accepted).toHaveBeenCalledTimes(1);
    act(() => pull.close()); expect(close).toHaveBeenCalledTimes(1);
  });
  it('snaps back on short pull, reversal, cancellation, and parent rejection', () => {
    drag(40); expect(Animated.spring).toHaveBeenCalled();
    drag(180, -300); expect(completions).toHaveLength(0);
    state(State.BEGAN); state(State.ACTIVE, 0, 20); state(State.CANCELLED);
    expect(close).not.toHaveBeenCalled();
    close.mockReturnValue(false); drag(120);
    act(() => completions[0]({ finished: true }));
    expect(accepted).not.toHaveBeenCalled(); expect(pull.isClosing).toBe(false);
    close.mockReturnValue(true); drag(120);
    act(() => completions[1]({ finished: true }));
    expect(accepted).toHaveBeenCalledTimes(1);
  });
  it('does not take over a gesture started in a scrolled list or horizontal content', () => {
    scrollY = 70; state(State.BEGAN); scrollY = 0;
    state(State.ACTIVE, 0, 20); state(State.END, 0, 150, 1000);
    expect(completions).toHaveLength(0); expect(close).not.toHaveBeenCalled();
    state(State.BEGAN); state(State.ACTIVE, 20, 14); state(State.END, 150, 30, 1000);
    expect(completions).toHaveLength(0);
  });
  it('discards raw native scroll distances before the next eligible short pull', () => {
    scrollY = 70; state(State.BEGAN); state(State.ACTIVE, 0, 20); nativeDrag(150);
    expect((pull.translateY as any).__getValue()).toBe(0);
    state(State.END, 0, 150, 1000); scrollY = 0;
    state(State.BEGAN); state(State.ACTIVE, 0, 15); nativeDrag(15);
    expect((pull.translateY as any).__getValue()).toBe(15);
    state(State.END, 0, 15); expect(completions).toHaveLength(0); expect(close).not.toHaveBeenCalled();
  });
  it('does not reveal a rejected horizontal drag on native cancellation', () => {
    state(State.BEGAN); state(State.ACTIVE, 30, 14); nativeDrag(90, 120);
    state(State.CANCELLED, 120, 90);
    expect((pull.translateY as any).__getValue()).toBe(0); expect(close).not.toHaveBeenCalled();
  });
  it('holds the visible position while regrabbing a cancelled pull', () => {
    act(() => { pull.begin(); pull.move(60); pull.cancel(); });
    state(State.BEGAN);
    expect((pull.translateY as any).__getValue()).toBe(60);
    state(State.ACTIVE, 0, 15); nativeDrag(15);
    expect((pull.translateY as any).__getValue()).toBe(75);
    state(State.END, 0, 15); expect(close).not.toHaveBeenCalled();
  });
  it('keeps recognition failures still, including defensive late raw updates', () => {
    state(State.BEGAN); nativeDrag(10, 30); state(State.FAILED, 30, 10);
    expect((pull.translateY as any).__getValue()).toBe(0);
    expect(Animated.spring).not.toHaveBeenCalled();
  });
  it('begins synchronously and invalidates a delayed release value under UI pressure', () => {
    const value = (pull.onGestureEvent as any)._argMapping[0].nativeEvent.translationY;
    const pending: ((value: number) => void)[] = [];
    jest.spyOn(value, 'stopAnimation').mockImplementation((callback: any) => { if (callback) pending.push(callback); });
    act(() => { pull.begin(); pull.move(120); });
    expect(pending).toHaveLength(0);
    act(() => pull.finish(0)); expect(pending).toHaveLength(1);
    act(() => { pull.begin(); pull.move(15); pending[0](120); });
    expect(close).not.toHaveBeenCalled(); expect(completions).toHaveLength(0);
  });
  it('ignores interrupted or stale completion after lightbox ownership/unmount', () => {
    drag(120); act(() => { tree.update(<Probe enabled={false} />); });
    act(() => completions[0]({ finished: true })); expect(close).not.toHaveBeenCalled();
    act(() => { tree.update(<Probe />); }); drag(120);
    act(() => tree.unmount()); act(() => completions[1]({ finished: true }));
    expect(close).not.toHaveBeenCalled();
  });
  it('keeps direct manipulation under Reduce Motion and skips completion/snap animations', () => {
    act(() => { tree.update(<Probe reduceMotion />); });
    act(() => { pull.begin(); pull.move(50); });
    expect((pull.translateY as any).__getValue()).toBe(50);
    act(() => pull.cancel()); expect((pull.translateY as any).__getValue()).toBe(0);
    drag(24, 900); expect(close).toHaveBeenCalledTimes(1); expect(completions).toHaveLength(0);
  });
});
