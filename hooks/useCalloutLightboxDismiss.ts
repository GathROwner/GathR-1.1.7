import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { shouldDismissCalloutLightbox } from '../utils/calloutLightbox';

type Options = {
  translateY: Animated.Value;
  backgroundOpacity: Animated.Value;
  height: number;
  reduceMotion: boolean;
  onBegin: () => void;
  onClose: () => void;
};

/** Media-only dismissal. Once accepted, unrelated terminal events cannot undo it. */
export function useCalloutLightboxDismiss(options: Options) {
  const latest = useRef(options);
  const closing = useRef(false);
  const active = useRef(false);
  const generation = useRef(0);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useLayoutEffect(() => { latest.current = options; });
  useEffect(() => () => {
    generation.current++;
    animation.current?.stop();
  }, []);

  const onGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationY: options.translateY } }], {
      useNativeDriver: true,
      listener: ({ nativeEvent }: { nativeEvent: { translationY: number } }) => {
        // A queued drag event can arrive after END. setValue would cancel
        // the fade and therefore the parallel close animation as well.
        if (closing.current) return;
        const progress = Math.min(Math.max(0, nativeEvent.translationY) / 150, 1);
        latest.current.backgroundOpacity.setValue(1 - progress * 0.7);
      },
    },
  ), [options.translateY]);

  const onStateChange = useCallback(({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
    // A simultaneous recognizer can finish after this one. It must not stop
    // the accepted close animation or produce a second close callback.
    if (closing.current) return;
    const { state, translationX: x, translationY: y, velocityY } = nativeEvent;
    const current = latest.current;
    if (state === State.BEGAN) {
      generation.current++;
      animation.current?.stop();
      active.current = false;
      current.onBegin();
      current.translateY.stopAnimation();
      current.translateY.setValue(0);
      current.backgroundOpacity.setValue(1);
      return;
    }
    if (state === State.ACTIVE) { active.current = true; return; }
    if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
    // A pan that fails on an ordinary tap has never moved the panel.
    if (state === State.FAILED && !active.current) return;
    active.current = false;
    // Preserve the old handler's END/CANCELLED dismissal path. A cancelled
    // pull must pass the distance threshold; only END can qualify by speed.
    const dismiss = shouldDismissCalloutLightbox({ ended: state !== State.FAILED,
      allowFlick: state === State.END, x, y, velocityY });
    const epoch = ++generation.current;
    animation.current?.stop();
    if (dismiss) {
      closing.current = true;
      animation.current = Animated.parallel([
        Animated.timing(current.translateY, { toValue: current.height, duration: current.reduceMotion ? 0 : 250, useNativeDriver: true }),
        Animated.timing(current.backgroundOpacity, { toValue: 0, duration: current.reduceMotion ? 0 : 250, useNativeDriver: true }),
      ]);
      animation.current.start(({ finished }) => {
        if (epoch !== generation.current) return;
        if (finished) {
          generation.current++;
          latest.current.onClose();
        } else closing.current = false;
      });
    } else {
      animation.current = Animated.parallel([
        current.reduceMotion
          ? Animated.timing(current.translateY, { toValue: 0, duration: 0, useNativeDriver: true })
          : Animated.spring(current.translateY, { toValue: 0, useNativeDriver: true, tension: 100, friction: 8 }),
        Animated.timing(current.backgroundOpacity, { toValue: 1, duration: current.reduceMotion ? 0 : 160, useNativeDriver: true }),
      ]);
      animation.current.start();
    }
  }, []);
  return { onStateChange, onGestureEvent };
}
