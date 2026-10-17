import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { getAdjacentLightboxIndex } from '../utils/lightboxNavigation';
import { getCalloutLightboxSwipeDirection } from '../utils/calloutLightbox';

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
  const handoffOpacity = useRef(new Animated.Value(0)).current;
  const [handoffIndex, setHandoffIndex] = useState<number | null>(null);
  const latest = useRef(options);
  const cursor = useRef(options.index);
  const pending = useRef<-1 | 1 | null>(null);
  const committed = useRef<number | null>(null);
  const handoffReady = useRef<{ index: number; centered: boolean; mounted: boolean } | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const released = useRef(true);
  useLayoutEffect(() => { latest.current = options; });

  const reset = useCallback(() => {
    generation.current++;
    pending.current = null;
    committed.current = null;
    handoffReady.current = null;
    active.current = false;
    released.current = true;
    handoffOpacity.setValue(0);
    setHandoffIndex(null);
    dragX.stopAnimation();
    dragX.setValue(0);
  }, [dragX, handoffOpacity]);
  const settle = useCallback(() => {
    if (latest.current.reduceMotion) { dragX.setValue(0); return; }
    Animated.timing(dragX, {
      toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [dragX]);
  const commit = useCallback((direction: -1 | 1) => {
    const next = getAdjacentLightboxIndex(cursor.current, latest.current.count, direction);
    pending.current = null;
    if (next === null) { settle(); return; }
    cursor.current = next;
    committed.current = next;
    handoffReady.current = { index: next, centered: false, mounted: false };
    setHandoffIndex(next);
    // Hold the arriving preview above the native view mutations until the
    // zero-duration native recenter actually completes. JS layout timing alone
    // can expose the old page or an updated neighbor for a frame on Fabric.
    handoffOpacity.setValue(1);
    // The completion stack has synchronized before this runs, so React and
    // the native recenter start from the same centered value under the cover.
    dragX.stopAnimation();
    dragX.setValue(0);
    latest.current.onNavigate(next);
  }, [dragX, handoffOpacity, settle]);

  const revealPage = useCallback(() => {
    const ready = handoffReady.current;
    if (!ready?.centered || !ready.mounted) return;
    handoffReady.current = null;
    if (latest.current.reduceMotion) handoffOpacity.setValue(0);
    else Animated.timing(handoffOpacity, {
      toValue: 0, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [handoffOpacity]);
  const onPageLayout = useCallback((index: number) => {
    if (handoffReady.current?.index !== index) return;
    handoffReady.current.mounted = true;
    revealPage();
  }, [revealPage]);

  useLayoutEffect(() => {
    if (committed.current === options.index) {
      committed.current = null;
      if (!active.current && pending.current === null) {
        // Explicitly center on the native driver after the new page commits.
        // A JS-only setValue can leave an adjacent preview visible on Fabric.
        const epoch = generation.current;
        Animated.timing(dragX, { toValue: 0, duration: 0, useNativeDriver: true }).start(({ finished }) => {
          if (finished && epoch === generation.current) {
            // Layout effects can precede Fabric's native mounting. Keep the
            // cover until the new page acknowledges layout AND recenter ends.
            if (handoffReady.current) handoffReady.current.centered = true;
            revealPage();
          }
        });
      }
    } else {
      cursor.current = options.index;
      reset();
    }
  }, [options.index, options.count, reset, dragX, revealPage]);
  useEffect(() => { if (!options.enabled) reset(); }, [options.enabled, reset]);
  useEffect(() => reset, [reset]);

  const navigate = useCallback((direction: -1 | 1) => {
    if (!latest.current.enabled || getAdjacentLightboxIndex(cursor.current, latest.current.count, direction) === null) {
      settle(); return;
    }
    pending.current = direction;
    setHandoffIndex(getAdjacentLightboxIndex(cursor.current, latest.current.count, direction));
    if (latest.current.reduceMotion) { commit(direction); return; }
    const epoch = ++generation.current;
    Animated.timing(dragX, {
      toValue: -direction * latest.current.width, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && epoch === generation.current) {
        // RN invokes completion before synchronizing the native end value back
        // to JS. Let that stack finish before rendering/recentering a new page,
        // or its trailing prop update can restore the outgoing position.
        queueMicrotask(() => { if (epoch === generation.current) commit(direction); });
      }
    });
  }, [commit, dragX, settle]);
  const onStateChange = useCallback(({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
    if (nativeEvent.state === State.BEGAN) {
      const accepted = pending.current;
      const destination = committed.current;
      reset();
      committed.current = destination;
      if (accepted && latest.current.enabled) commit(accepted);
      released.current = false;
      return;
    }
    if (!latest.current.enabled) { reset(); return; }
    if (nativeEvent.state === State.ACTIVE) { active.current = true; return; }
    if (nativeEvent.state === State.FAILED) {
      const wasActive = active.current;
      active.current = false;
      // Tapping an arrow makes its surrounding pan fail. That failure must
      // not cancel the button's newly-started page transition.
      if (wasActive) settle();
      released.current = true;
      return;
    }
    if (nativeEvent.state !== State.END && nativeEvent.state !== State.CANCELLED) return;
    if (released.current) return;
    if (nativeEvent.state === State.CANCELLED && !active.current) { released.current = true; return; }
    released.current = true;
    active.current = false;
    const direction = getCalloutLightboxSwipeDirection({ x: nativeEvent.translationX, y: nativeEvent.translationY,
      velocityX: nativeEvent.velocityX, velocityY: nativeEvent.velocityY, width: latest.current.width,
      allowFlick: nativeEvent.state === State.END });
    if (!direction) { settle(); return; }
    navigate(direction);
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
  return { enabled: options.enabled, offsetX, onGestureEvent, onStateChange, step, reset, handoffIndex, handoffOpacity, onPageLayout };
}
