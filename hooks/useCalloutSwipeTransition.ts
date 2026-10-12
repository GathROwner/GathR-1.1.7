import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import {
  getAdjacentCalloutPage, getCalloutSwipeDirection,
  type CalloutBrowsePage, type CalloutSwipeDirection,
} from '../utils/calloutSwipeNavigation';

type Cursor = { venueIndex: number; tab: 'events' | 'specials' | 'venue' };
type Options = {
  pages: readonly CalloutBrowsePage[];
  current: Cursor;
  width: number;
  enabled: boolean;
  reduceMotion: boolean;
  onNavigate: (page: CalloutBrowsePage) => void;
};
const samePage = (a: Cursor, b: Cursor) => a.venueIndex === b.venueIndex && a.tab === b.tab;

/** Native drag feedback; one accepted release commits once, even when settling is interrupted. */
export function useCalloutSwipeTransition(options: Options) {
  const { venueIndex, tab } = options.current;
  const translateX = useRef(new Animated.Value(0)).current;
  const optionsRef = useRef(options);
  const cursorRef = useRef(options.current);
  const pendingRef = useRef<CalloutSwipeDirection | null>(null);
  const entryRef = useRef<{ page: CalloutBrowsePage; animate: boolean } | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);

  useLayoutEffect(() => { optionsRef.current = options; });

  const reset = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    entryRef.current = null;
    activeRef.current = false;
    translateX.stopAnimation();
    translateX.setValue(0);
  }, [translateX]);

  const settle = useCallback(() => {
    if (optionsRef.current.reduceMotion) {
      translateX.setValue(0);
      return;
    }
    Animated.spring(translateX, {
      toValue: 0, stiffness: 260, damping: 30, mass: 0.8,
      overshootClamping: true, useNativeDriver: true,
    }).start();
  }, [translateX]);

  const commit = useCallback((direction: CalloutSwipeDirection, animateEntry: boolean) => {
    const latest = optionsRef.current;
    const next = getAdjacentCalloutPage(latest.pages, cursorRef.current, direction);
    pendingRef.current = null;
    if (!next) {
      settle();
      return;
    }
    // Advance the cursor synchronously so a rapid second gesture cannot reuse the old page.
    cursorRef.current = next;
    entryRef.current = { page: next, animate: animateEntry };
    translateX.setValue(animateEntry ? (direction === 'next' ? latest.width : -latest.width) : 0);
    latest.onNavigate(next);
  }, [settle, translateX]);

  useLayoutEffect(() => {
    cursorRef.current = { venueIndex, tab };
    if (entryRef.current && samePage(entryRef.current.page, { venueIndex, tab })) {
      const animate = entryRef.current.animate;
      entryRef.current = null;
      // Start only after the destination content has committed, avoiding an old-list flash.
      if (animate) settle();
    } else {
      reset();
    }
  }, [venueIndex, tab, reset, settle]);

  useEffect(() => {
    if (!options.enabled) reset();
  }, [options.enabled, reset]);
  useEffect(() => reset, [reset]);

  const onGestureEvent = useMemo(() => Animated.event(
    [{ nativeEvent: { translationX: translateX } }], { useNativeDriver: true },
  ), [translateX]);

  const onStateChange = useCallback(({ nativeEvent }: PanGestureHandlerStateChangeEvent) => {
    const latest = optionsRef.current;
    if (nativeEvent.state === State.BEGAN) {
      const pending = pendingRef.current;
      const committedEntry = entryRef.current;
      reset();
      // A committed page may still be waiting for React. Its layout effect must not
      // reset an already-started second gesture when that render arrives.
      if (committedEntry) entryRef.current = { ...committedEntry, animate: false };
      // Finish the prior accepted navigation before taking a fresh drag. No timed input lock.
      if (pending && latest.enabled) commit(pending, false);
      return;
    }
    if (!latest.enabled) { reset(); return; }
    if (nativeEvent.state === State.ACTIVE) { activeRef.current = true; return; }
    if (nativeEvent.state === State.CANCELLED || nativeEvent.state === State.FAILED) {
      activeRef.current = false;
      settle();
      return;
    }
    if (nativeEvent.state !== State.END || !activeRef.current) return;
    activeRef.current = false;
    const direction = getCalloutSwipeDirection(
      nativeEvent.translationX, nativeEvent.translationY, nativeEvent.velocityX, nativeEvent.velocityY,
    );
    if (!direction || !getAdjacentCalloutPage(latest.pages, cursorRef.current, direction)) {
      settle();
      return;
    }
    if (latest.reduceMotion) { commit(direction, false); return; }
    pendingRef.current = direction;
    const generation = ++generationRef.current;
    Animated.timing(translateX, {
      toValue: direction === 'next' ? -latest.width : latest.width,
      duration: 150, useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && generation === generationRef.current) commit(direction, true);
    });
  }, [commit, reset, settle, translateX]);

  return { translateX, onGestureEvent, onStateChange, reset };
}
