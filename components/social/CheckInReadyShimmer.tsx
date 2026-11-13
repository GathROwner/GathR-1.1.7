import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReduceMotion } from '../../hooks/useReduceMotion';

const CUE_COOLDOWN_MS = 90_000;

/** A quiet cue for an already available action; never changes readiness. */
export function CheckInReadyShimmer({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const lastCueAt = useRef(0);

  useEffect(() => {
    progress.setValue(0);
    if (!active || reduceMotion) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    let animation: Animated.CompositeAnimation | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        if (canceled) return;
        lastCueAt.current = Date.now();
        animation = Animated.sequence([
          Animated.timing(progress, { toValue: 1, duration: 1000,
            easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }),
          Animated.timing(progress, { toValue: 0, duration: 0,
            useNativeDriver: true, isInteraction: false }),
        ]);
        animation.start(({ finished }) => { if (finished && !canceled) schedule(); });
      }, Math.max(1200, CUE_COOLDOWN_MS - (Date.now() - lastCueAt.current)));
    };
    schedule();
    return () => {
      canceled = true;
      clearTimeout(timer);
      animation?.stop();
      progress.stopAnimation();
      progress.setValue(0);
      // Returning from a flow or the background should not immediately cue again.
      lastCueAt.current = Date.now();
    };
  }, [active, progress, reduceMotion]);

  if (!active || reduceMotion) return null;
  return <View pointerEvents="none" accessible={false} style={styles.clip} testID="check-in-ready-shimmer">
    <Animated.View style={[styles.sweep, { transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 48] }) },
      { rotate: '-20deg' },
    ] }]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 18 },
  sweep: { position: 'absolute', left: 0, top: -8, bottom: -8, width: 16 },
});
