import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { getAdjacentLightboxIndex } from '../utils/lightboxNavigation';
import { getCalloutSwipeDirection } from '../utils/calloutSwipeNavigation';

type Options = {
  index: number;
  count: number;
  width: number;
  enabled: boolean;
  reduceMotion: boolean;
  onNavigate: (index: number) => void;
};

/** Callout-only bounded pages. Adjacent previews arrive as the current page exits. */
export function useCalloutLightboxPaging(options: Options) {
  const dragX = useRef(new Animated.Value(0)).current;
  const latest = useRef(options);
  const cursor = useRef(options.index);
  const pending = useRef<-1 | 1 | null>(null);
  const committed = useRef<number | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  useLayoutEffect(() => { latest.current = options; });

  const reset = useCallback(() => {
    generation.current++;
    pending.current = null;
    committed.current = null;
    active.current = false;
    dragX.stopAnimation();
    dragX.setValue(0);
  }, [dragX]);
  const settle = useCallback(() => {
    if (latest.current.reduceMotion) { dragX.setValue(0); return; }
    Animated.spring(dragX, {
      toValue: 0, stiffness: 260, damping: 30, mass: 0.8,
      overshootClamping: true, useNativeDriver: true,
    }).start();
  }, [dragX]);
  const commit = useCallback((direction: -1 | 1) => {
    const next = getAdjacentLightboxIndex(cursor.current, latest.current.count, direction);
    pending.current = null;
    if (next === null) { settle(); return; }
    cursor.current = next;
    committed.current = next;
    // Keep the JS value centered while React commits the destination page.
    dragX.stopAnimation();
    dragX.setValue(0);
    latest.current.onNavigate(next);
  }, [dragX, settle]);

  useLayoutEffect(() => {
    if (committed.current === options.index) {
      committed.current = null;
      if (!active.current && pending.current === null) {
        // Explicitly center on the native driver after the new page commits.
        // A JS-only setValue can leave an adjacent preview visible on Fabric.
        Animated.timing(dragX, { toValue: 0, duration: 0, useNativeDriver: true }).start();
      }
    } else {
      cursor.current = options.index;
      reset();
    }
  }, [options.index, options.count, reset, dragX]);
  useEffect(() => { if (!options.enabled) reset(); }, [options.enabled, reset]);
  useEffect(() => reset, [reset]);

  const navigate = useCallback((direction: -1 | 1) => {
    if (!latest.current.enabled || getAdjacentLightboxIndex(cursor.current, latest.current.count, direction) === null) {
      settle(); return;
    }
    pending.current = direction;
    if (latest.current.reduceMotion) { commit(direction); return; }
    const epoch = ++generation.current;
    Animated.timing(dragX, {
      toValue: -direction * latest.current.width, duration: 160, useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && epoch === generation.current) commit(direction);
    });
  }, [commit, dragX, settle]);
  const onStateChange = useCallback(({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
    if (nativeEvent.state === State.BEGAN) {
      const accepted = pending.current;
      const destination = committed.current;
      reset();
      committed.current = destination;
      if (accepted && latest.current.enabled) commit(accepted);
      return;
    }
    if (!latest.current.enabled) { reset(); return; }
    if (nativeEvent.state === State.ACTIVE) { active.current = true; return; }
    if (nativeEvent.state === State.CANCELLED || nativeEvent.state === State.FAILED) {
      const wasActive = active.current;
      active.current = false;
      // Tapping an arrow makes its surrounding pan fail. That failure must
      // not cancel the button's newly-started page transition.
      if (wasActive) settle();
      return;
    }
    if (nativeEvent.state !== State.END || !active.current) return;
    active.current = false;
    const direction = getCalloutSwipeDirection(nativeEvent.translationX, nativeEvent.translationY,
      nativeEvent.velocityX, nativeEvent.velocityY);
    if (!direction) { settle(); return; }
    navigate(direction === 'next' ? 1 : -1);
  }, [commit, navigate, reset, settle]);
  const onGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationX: dragX } }], { useNativeDriver: true },
  ), [dragX]);
  const offsetX = dragX;
  const step = useCallback((direction: -1 | 1) => {
    const accepted = pending.current;
    reset();
    if (accepted) commit(accepted);
    navigate(direction);
  }, [commit, navigate, reset]);
  return { enabled: options.enabled, offsetX, onGestureEvent, onStateChange, step, reset };
}
