import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, StyleSheet, View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { useCalloutPullDismiss } from '../../../hooks/useCalloutPullDismiss';
import CalloutDismissSurface from '../CalloutDismissSurface';

jest.mock('react-native-gesture-handler/lib/commonjs/RNGestureHandlerModule', () => ({
  __esModule: true,
  default: require('react-native-gesture-handler/lib/commonjs/mocks/mocks').default,
}));
const { PanGestureHandler } = jest.requireActual('react-native-gesture-handler/lib/commonjs/handlers/PanGestureHandler');

describe('native callout terminal ownership and stacking', () => {
  let tree: renderer.ReactTestRenderer;
  let pull: ReturnType<typeof useCalloutPullDismiss>;
  let scrollY = 0;
  let motions: { value: Animated.Value; to: number; complete?: (r: { finished: boolean }) => void; kind: string }[];
  const onClose = jest.fn<boolean | void, []>();
  function Probe({ enabled = true, reduceMotion = false }) {
    pull = useCalloutPullDismiss({ enabled, reduceMotion, sheetHeight: 500, screenHeight: 844, scrollY: () => scrollY, onClose });
    return <View>
      <View testID="backdrop" style={{ zIndex: 1, opacity: 0.5 }} />
      <CalloutDismissSurface translateY={pull.translateY} closing={pull.isClosing}>
        <PanGestureHandler onGestureEvent={pull.onGestureEvent} onHandlerStateChange={pull.onStateChange}>
          <Animated.View />
        </PanGestureHandler>
      </CalloutDismissSurface>
    </View>;
  }
  function state(state: State, y = 0, velocityY = 0, oldState: State = State.ACTIVE) {
    const instance = tree.root.findByType(PanGestureHandler).instance;
    act(() => instance.onGestureHandlerStateChange({ nativeEvent: {
      handlerTag: instance.handlerTag, state, oldState, translationX: 0, translationY: y, velocityY,
    } }));
  }
  const raw = () => (pull.onGestureEvent as any)._argMapping[0].nativeEvent.translationY as Animated.Value;
  const position = () => (pull.translateY as any).__getValue() as number;
  function drag(y: number) { state(State.BEGAN, 0, 0, State.UNDETERMINED); state(State.ACTIVE, 15, 0, State.BEGAN); act(() => raw().setValue(y)); }
  function complete(index = motions.length - 1, finished = true) {
    const motion = motions[index];
    act(() => { if (finished) motion.value.setValue(motion.to); motion.complete?.({ finished }); });
  }
  beforeEach(() => {
    scrollY = 0; motions = []; onClose.mockReset();
    for (const kind of ['timing', 'spring'] as const) jest.spyOn(Animated, kind).mockImplementation((value, config: any) => ({
      start: callback => { motions.push({ value: value as Animated.Value, to: config.toValue, complete: callback, kind }); }, stop: jest.fn(), reset: jest.fn(),
    }));
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); });

  it('places the actual sheet surface above its backdrop sibling', () => {
    const surface = tree.root.findByProps({ testID: 'callout-dismiss-translation-surface' });
    const backdrop = tree.root.findByProps({ testID: 'backdrop' });
    expect(StyleSheet.flatten(surface.props.style).zIndex ?? 0).toBeGreaterThan(StyleSheet.flatten(backdrop.props.style).zIndex);
  });
  it('starts END completion without any native value-read callback, using terminal distance', () => {
    drag(15);
    const stop = jest.spyOn(raw(), 'stopAnimation').mockImplementation(() => {});
    state(State.END, 120);
    expect(motions).toHaveLength(1); expect(motions[0].kind).toBe('timing');
    expect(stop.mock.calls.every(args => args.length === 0)).toBe(true);
    expect(onClose).not.toHaveBeenCalled(); complete(); expect(onClose).toHaveBeenCalledTimes(1);
  });
  it.each([State.END, State.CANCELLED, State.FAILED])('hands terminal state %s to an independent settling value', terminal => {
    drag(50); state(terminal, 50);
    expect(motions).toHaveLength(1); expect(motions[0].kind).toBe('spring');
    expect(motions[0].value).not.toBe(raw());
    expect(position()).toBe(50);
    act(() => raw().setValue(170)); // A late native event must not own or move the settling sheet.
    expect(position()).toBe(50);
    complete(); expect(position()).toBe(0); expect(onClose).not.toHaveBeenCalled();
  });
  it('uses terminal velocity for a short flick and snaps back on upward reversal', () => {
    drag(24); state(State.END, 24, 900);
    expect(motions[0].kind).toBe('timing'); complete(); expect(onClose).toHaveBeenCalledTimes(1);
    act(() => pull.reset()); onClose.mockClear();
    drag(180); state(State.END, 180, -300);
    expect(motions[1].kind).toBe('spring'); complete(); expect(position()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('preserves a regrabbed native position and ignores stale and duplicate finalization', () => {
    drag(60); state(State.CANCELLED, 60);
    act(() => motions[0].value.setValue(30)); // Spring's current native position.
    state(State.BEGAN, 0, 0, State.UNDETERMINED);
    expect(position()).toBe(30);
    state(State.ACTIVE, 15, 0, State.BEGAN); act(() => raw().setValue(15));
    expect(position()).toBe(45);
    state(State.END, 15); expect(position()).toBe(45); expect(motions).toHaveLength(2);
    state(State.END, 15); expect(position()).toBe(45); expect(motions).toHaveLength(2);
    // A native interrupted animation reports finished:false after the new gesture.
    act(() => motions[0].complete?.({ finished: false })); expect(position()).toBe(45);
    complete(); expect(position()).toBe(0); expect(onClose).not.toHaveBeenCalled();
  });
  it('finishes cancellation even when an ineligible list scroll starts during snap-back', () => {
    drag(50); state(State.CANCELLED, 50); scrollY = 80;
    state(State.BEGAN, 0, 0, State.UNDETERMINED);
    state(State.ACTIVE, 15, 0, State.BEGAN); act(() => raw().setValue(120));
    state(State.END, 120, 1000);
    expect(position()).toBe(50); expect(motions).toHaveLength(1);
    complete(); expect(position()).toBe(0); expect(onClose).not.toHaveBeenCalled();
  });
  it('recovers when close is interrupted or refused and completes the recovery', () => {
    drag(120); state(State.END, 120); complete(0, false);
    expect(motions[1].kind).toBe('spring'); complete(); expect(position()).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
    onClose.mockReturnValue(false); drag(120); state(State.END, 120); complete();
    expect(motions[3].kind).toBe('spring'); complete(); expect(position()).toBe(0);
    expect(pull.isClosing).toBe(false);
  });
  it('retains direct manipulation but skips settling motion under Reduce Motion', () => {
    act(() => tree.update(<Probe reduceMotion />));
    drag(50); expect(position()).toBe(50); state(State.CANCELLED, 50);
    expect(position()).toBe(0); expect(motions).toHaveLength(0);
    drag(24); state(State.END, 24, 900);
    expect(onClose).toHaveBeenCalledTimes(1); expect(motions).toHaveLength(0);
  });

});
