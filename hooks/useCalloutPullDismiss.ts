import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { isCalloutContentAtTop, shouldDismissCalloutPull } from '../utils/calloutPullDismiss';

type Options = {
  enabled: boolean;
  reduceMotion: boolean;
  sheetHeight: number;
  screenHeight: number;
  scrollY: () => number;
  onClose: () => boolean | void;
  onCloseAccepted?: () => void;
};

/** Raw native events and settling animations never own the same value. */
export function useCalloutPullDismiss(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const dragY = useRef(new Animated.Value(0)).current;
  const positionY = useRef(new Animated.Value(0)).current;
  const gate = useRef(new Animated.Value(0)).current;
  const position = useRef(0);
  const lastRawY = useRef(0);
  const eligible = useRef(false);
  const active = useRef(false);
  const settling = useRef(false);
  const heldOnBegin = useRef(false);
  const closing = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const generation = useRef(0);

  const reset = useCallback(() => {
    generation.current += 1;
    closing.current = false;
    setIsClosing(false);
    active.current = false;
    eligible.current = false;
    settling.current = false;
    heldOnBegin.current = false;
    gate.setValue(0);
    positionY.stopAnimation();
    positionY.setOffset(0);
    positionY.setValue(0);
    dragY.setValue(0);
    position.current = 0;
    lastRawY.current = 0;
  }, [dragY, gate, positionY]);

  const snapBack = useCallback(() => {
    const ticket = ++generation.current;
    closing.current = false;
    setIsClosing(false);
    active.current = false;
    eligible.current = false;
    heldOnBegin.current = false;
    settling.current = true;
    gate.setValue(0);
    if (latest.current.reduceMotion) { reset(); return; }
    Animated.spring(positionY, {
      toValue: 0, stiffness: 260, damping: 30, mass: 0.8,
      overshootClamping: true, useNativeDriver: true,
    }).start(() => { if (ticket === generation.current) reset(); });
  }, [gate, positionY, reset]);

  // Transfer the terminal payload exactly once. Offset operations preserve the
  // actual native held base, including a spring interrupted by another gesture.
  const handoff = useCallback((translation = lastRawY.current): number | undefined => {
    if (!eligible.current || closing.current) return undefined;
    const delta = active.current && Number.isFinite(translation) ? translation : 0;
    const distance = Math.max(0, position.current + delta);
    gate.setValue(0);
    positionY.setOffset(delta);
    positionY.flattenOffset();
    position.current += delta;
    dragY.setValue(0);
    lastRawY.current = 0;
    eligible.current = false;
    active.current = false;
    heldOnBegin.current = false;
    return distance;
  }, [dragY, gate, positionY]);

  const close = useCallback(() => {
    if (closing.current || !latest.current.enabled) return;
    if (eligible.current) handoff();
    closing.current = true;
    setIsClosing(true);
    eligible.current = false;
    active.current = false;
    settling.current = false;
    gate.setValue(0);
    const ticket = ++generation.current;
    positionY.stopAnimation();
    const complete = () => {
      if (ticket !== generation.current) return;
      const accepted = latest.current.onClose() !== false;
      if (accepted) latest.current.onCloseAccepted?.();
      else snapBack();
    };
    if (latest.current.reduceMotion) { complete(); return; }
    Animated.timing(positionY, {
      toValue: latest.current.screenHeight, duration: 220, useNativeDriver: true,
    }).start(({ finished }) => {
      if (ticket !== generation.current) return;
      if (finished) complete(); else snapBack();
    });
  }, [gate, handoff, positionY, snapBack]);

  const begin = useCallback((fromContent = false) => {
    if (closing.current) return;
    const allowed = latest.current.enabled && (!fromContent || isCalloutContentAtTop(latest.current.scrollY()));
    // An ineligible scroll must not interrupt an already running snap-back.
    if (!allowed) {
      eligible.current = false;
      active.current = false;
      heldOnBegin.current = false;
      gate.setValue(0);
      return;
    }
    generation.current += 1;
    heldOnBegin.current = settling.current;
    settling.current = false;
    eligible.current = allowed;
    active.current = allowed && !fromContent;
    // Never wait for native getValue before recognition or terminal settling.
    positionY.stopAnimation();
    dragY.setValue(0);
    lastRawY.current = 0;
    gate.setValue(active.current ? 1 : 0);
  }, [dragY, gate, positionY]);

  const move = useCallback((distance: number) => {
    if (eligible.current && !closing.current) {
      lastRawY.current = Math.max(0, distance);
      dragY.setValue(lastRawY.current);
    }
  }, [dragY]);

  const finish = useCallback((velocity: number, terminalTranslation?: number) => {
    const distance = handoff(terminalTranslation);
    if (distance === undefined) return;
    if (shouldDismissCalloutPull(distance, velocity, latest.current.sheetHeight)) close();
    else snapBack();
  }, [close, handoff, snapBack]);

  const cancel = useCallback((terminalTranslation?: number) => {
    if (closing.current) return;
    if (eligible.current) handoff(terminalTranslation);
    snapBack();
  }, [handoff, snapBack]);

  const onGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationY: dragY } }], { useNativeDriver: true },
  ), [dragY]);
  const onStateChange = useCallback(({ nativeEvent: e }: PanGestureHandlerStateChangeEvent) => {
    if (closing.current) return;
    if (e.state === State.BEGAN) { begin(true); return; }
    if (e.state === State.ACTIVE) {
      eligible.current = eligible.current && e.translationY > 0 && e.translationY > Math.abs(e.translationX) * 1.5;
      active.current = eligible.current;
      lastRawY.current = e.translationY;
      gate.setValue(active.current ? 1 : 0);
      return;
    }
    if (e.state !== State.END && e.state !== State.CANCELLED && e.state !== State.FAILED) return;
    // Duplicate terminal events cannot add distance twice or stop a settle.
    if (!eligible.current && !heldOnBegin.current) {
      if (!settling.current) reset();
      return;
    }
    if (e.state === State.END && active.current) { finish(e.velocityY, e.translationY); return; }
    if (active.current) cancel(e.translationY);
    else if (heldOnBegin.current) cancel(0);
    else reset();
  }, [begin, cancel, finish, gate, reset]);

  useEffect(() => { if (!options.enabled) reset(); }, [options.enabled, reset]);
  useEffect(() => {
    // A ref-only listener tracks the held base for regrab thresholds; animation
    // position stays native, and terminal events never depend on this delivery.
    const listener = positionY.addListener(({ value }) => { position.current = value; });
    return () => {
      generation.current += 1;
      positionY.removeListener(listener);
      positionY.stopAnimation();
    };
  }, [positionY]);
  const translateY = useMemo(() => Animated.add(positionY, Animated.multiply(gate, dragY)).interpolate({
    inputRange: [0, options.screenHeight], outputRange: [0, options.screenHeight], extrapolate: 'clamp',
  }), [dragY, gate, positionY, options.screenHeight]);
  const backdropFactor = useMemo(() => translateY.interpolate({
    inputRange: [0, options.screenHeight], outputRange: [1, 0], extrapolate: 'clamp',
  }), [translateY, options.screenHeight]);
  return { translateY, backdropFactor, isClosing, begin, move, finish, cancel, close, reset, onGestureEvent, onStateChange };
}
