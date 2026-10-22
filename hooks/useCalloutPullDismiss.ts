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

/** Transform a fixed-size surface; the iOS sheet itself keeps its static layout. */
export function useCalloutPullDismiss(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => { latest.current = options; });
  const dragY = useRef(new Animated.Value(0)).current;
  const gate = useRef(new Animated.Value(0)).current;
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
    settling.current = false;
    heldOnBegin.current = false;
    eligible.current = false;
    gate.setValue(0);
    dragY.stopAnimation();
    dragY.setOffset(0);
    dragY.setValue(0);
  }, [dragY, gate]);

  const snapBack = useCallback(() => {
    const ticket = ++generation.current;
    closing.current = false;
    setIsClosing(false);
    active.current = false;
    settling.current = true;
    dragY.flattenOffset();
    if (latest.current.reduceMotion) { reset(); return; }
    Animated.spring(dragY, {
      toValue: 0, stiffness: 260, damping: 30, mass: 0.8,
      overshootClamping: true, useNativeDriver: true,
    }).start(({ finished }) => { if (finished && ticket === generation.current) reset(); });
  }, [dragY, reset]);

  const close = useCallback(() => {
    if (closing.current || !latest.current.enabled) return;
    closing.current = true;
    setIsClosing(true);
    active.current = false;
    eligible.current = false;
    gate.setValue(1);
    dragY.flattenOffset();
    const ticket = ++generation.current;
    const complete = () => {
      if (ticket !== generation.current) return;
      const accepted = latest.current.onClose() !== false;
      if (accepted) latest.current.onCloseAccepted?.();
      else snapBack();
    };
    if (latest.current.reduceMotion) { complete(); return; }
    Animated.timing(dragY, {
      toValue: latest.current.screenHeight, duration: 220, useNativeDriver: true,
    }).start(({ finished }) => {
      if (ticket !== generation.current) return;
      if (finished) complete();
      else snapBack();
    });
  }, [dragY, gate, snapBack]);

  const begin = useCallback((fromContent = false) => {
    if (closing.current) return;
    const allowed = latest.current.enabled && (!fromContent || isCalloutContentAtTop(latest.current.scrollY()));
    generation.current += 1;
    heldOnBegin.current = allowed && settling.current;
    settling.current = false;
    eligible.current = allowed;
    active.current = false;
    // extractOffset also runs on the native node. No asynchronous getValue
    // callback can overwrite the next ACTIVE event during an interrupted settle.
    dragY.stopAnimation();
    if (allowed) dragY.extractOffset();
    else { dragY.setOffset(0); dragY.setValue(0); }
    gate.setValue(allowed ? 1 : 0);
  }, [dragY, gate]);

  const move = useCallback((distance: number) => {
    if (eligible.current && !closing.current) dragY.setValue(Math.max(0, distance));
  }, [dragY]);

  const finish = useCallback((velocity: number) => {
    if (!eligible.current || closing.current) return;
    active.current = false;
    const ticket = generation.current;
    dragY.flattenOffset();
    dragY.stopAnimation((distance) => {
      if (ticket !== generation.current) return;
      if (shouldDismissCalloutPull(distance, velocity, latest.current.sheetHeight)) close();
      else snapBack();
    });
  }, [close, dragY, snapBack]);

  const onGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationY: dragY } }], { useNativeDriver: true },
  ), [dragY]);
  const onStateChange = useCallback(({ nativeEvent: e }: PanGestureHandlerStateChangeEvent) => {
    if (e.state === State.BEGAN) { begin(true); return; }
    if (e.state === State.ACTIVE) {
      eligible.current = eligible.current && e.translationY > 0 && e.translationY > Math.abs(e.translationX) * 1.5;
      active.current = eligible.current;
      gate.setValue(eligible.current ? 1 : 0);
      return;
    }
    if (e.state === State.END) {
      if (active.current) finish(e.velocityY);
      else if (!closing.current) reset();
      return;
    }
    if ((e.state === State.CANCELLED || e.state === State.FAILED) && !closing.current) {
      if (active.current) snapBack();
      else if (heldOnBegin.current) { dragY.setValue(0); gate.setValue(1); snapBack(); }
      else reset();
    }
  }, [begin, dragY, finish, gate, reset, snapBack]);

  useEffect(() => { if (!options.enabled) reset(); }, [options.enabled, reset]);
  useEffect(() => () => {
    generation.current += 1;
    dragY.stopAnimation();
  }, [dragY]);
  const translateY = useMemo(() => Animated.multiply(gate, dragY).interpolate({
    inputRange: [0, options.screenHeight], outputRange: [0, options.screenHeight], extrapolate: 'clamp',
  }), [dragY, gate, options.screenHeight]);
  const backdropFactor = useMemo(() => translateY.interpolate({
    inputRange: [0, options.screenHeight], outputRange: [1, 0], extrapolate: 'clamp',
  }), [translateY, options.screenHeight]);
  return { translateY, backdropFactor, isClosing, begin, move, finish, cancel: snapBack, close, reset, onGestureEvent, onStateChange };
}
