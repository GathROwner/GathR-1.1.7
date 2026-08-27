import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useReduceMotion } from '../../hooks/useReduceMotion';

interface Props {
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A restrained GathR-blue/teal glint for tutorial focus boundaries. Two quick
 * sweeps provide the cue, followed by a long quiet pause. It deliberately
 * stays on the edge so the highlighted control remains readable.
 */
export const TutorialFocusShimmer: React.FC<Props> = ({
  borderRadius = 18,
  style,
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);

    if (reduceMotion) return;

    const reset = () => Animated.timing(progress, {
      toValue: 0,
      duration: 1,
      useNativeDriver: true,
    });
    const sweep = () => Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(420),
      sweep(),
      reset(),
      Animated.delay(170),
      sweep(),
      reset(),
      Animated.delay(2600),
    ]));

    loop.start();
    return () => {
      loop.stop();
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [progress, reduceMotion]);

  if (reduceMotion) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-70, windowWidth + 70],
  });

  const renderGlint = () => (
    <Animated.View style={[styles.glint, { transform: [{ translateX }] }]}>
      <LinearGradient
        colors={[
          'rgba(52, 204, 190, 0)',
          'rgba(52, 204, 190, 0.72)',
          'rgba(255, 255, 255, 0.98)',
          'rgba(36, 151, 243, 0.78)',
          'rgba(36, 151, 243, 0)',
        ]}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.gradient}
      />
    </Animated.View>
  );

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { borderRadius }, style]}
    >
      <View style={styles.topTrack}>{renderGlint()}</View>
      <View style={styles.bottomTrack}>{renderGlint()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
  },
  bottomTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
  },
  glint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 64,
  },
  gradient: { flex: 1 },
});
