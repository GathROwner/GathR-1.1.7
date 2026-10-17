import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useReduceMotion } from '../../hooks/useReduceMotion';

export default function VenueEventCount({ children, active }: { children: string; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  useEffect(() => {
    progress.setValue(0);
    if (!active || reduceMotion || !width) return;
    // Match the Trending pill's 700ms lead-in, 900ms sweep and 3s pause, but stop after three passes.
    const animation = Animated.sequence([
      Animated.delay(700),
      Animated.loop(Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false }),
        Animated.timing(progress, { toValue: 0, duration: 1, useNativeDriver: true, isInteraction: false }),
        Animated.delay(3000),
      ]), { iterations: 3 }),
    ]);
    animation.start();
    return () => { animation.stop(); progress.stopAnimation(); progress.setValue(0); };
  }, [active, children, progress, reduceMotion, width]);

  return <View style={styles.container} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text style={styles.text}>{children}</Text>
    {active && !reduceMotion && width > 0 && <MaskedView pointerEvents="none" style={StyleSheet.absoluteFill}
      androidRenderingMode="software" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      maskElement={<Text style={styles.text}>{children}</Text>}>
      <Animated.View style={[styles.shimmer, {
        opacity: progress.interpolate({ inputRange: [0, 0.18, 0.5, 0.82, 1], outputRange: [0, 0.28, 0.78, 0.28, 0] }),
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-40, width + 40] }) }, { rotate: '18deg' }],
      }]}>
        <LinearGradient colors={['rgba(255,246,214,0)', '#FFF6D6', 'rgba(255,246,214,0)']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </MaskedView>}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignSelf: 'flex-start', marginTop: 2, overflow: 'hidden', maxWidth: '100%' },
  text: { fontSize: 12, fontWeight: '600', color: '#966000' },
  shimmer: { position: 'absolute', top: -8, bottom: -8, width: 40 },
});
