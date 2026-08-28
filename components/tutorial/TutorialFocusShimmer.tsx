import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useReduceMotion } from '../../hooks/useReduceMotion';
import { getTutorialShimmerGeometry } from '../../utils/tutorialShimmerGeometry';

interface Props {
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A clipped, glass-like reflection across the complete tutorial focus area.
 * Two quick GathR-orange sweeps provide the cue, followed by a quiet pause.
 */
export const TutorialFocusShimmer: React.FC<Props> = ({
  borderRadius = 18,
  style,
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const [size, setSize] = useState({ height: 0, width: 0 });

  const geometry = useMemo(
    () => getTutorialShimmerGeometry(size.width, size.height),
    [size.height, size.width],
  );

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);

    if (reduceMotion || size.height <= 0 || size.width <= 0) return;

    const reset = () => Animated.timing(progress, {
      toValue: 0,
      duration: 1,
      useNativeDriver: true,
    });
    const sweep = () => Animated.timing(progress, {
      toValue: 1,
      duration: 680,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(460),
      sweep(),
      reset(),
      Animated.delay(190),
      sweep(),
      reset(),
      Animated.delay(2500),
    ]));

    loop.start();
    return () => {
      loop.stop();
      progress.stopAnimation();
      progress.setValue(0);
    };
  }, [progress, reduceMotion, size.height, size.width]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setSize((current) => (
      Math.abs(current.height - height) < 0.5 && Math.abs(current.width - width) < 0.5
        ? current
        : { height, width }
    ));
  };

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [geometry.travelStart, geometry.travelEnd],
  });

  return (
    <View
      onLayout={handleLayout}
      pointerEvents="none"
      style={[styles.container, { borderRadius }, style]}
    >
      {!reduceMotion && size.height > 0 && size.width > 0 ? (
        <Animated.View
          style={[
            styles.reflection,
            {
              height: size.height + (geometry.overscan * 2),
              top: -geometry.overscan,
              transform: [
                { translateX },
                { rotate: '-12deg' },
              ],
              width: geometry.bandWidth,
            },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(255, 107, 53, 0)',
              'rgba(255, 107, 53, 0.10)',
              'rgba(255, 107, 53, 0.36)',
              'rgba(255, 226, 191, 0.68)',
              'rgba(255, 107, 53, 0.42)',
              'rgba(255, 107, 53, 0.10)',
              'rgba(255, 107, 53, 0)',
            ]}
            end={{ x: 1, y: 0.5 }}
            locations={[0, 0.18, 0.36, 0.5, 0.64, 0.82, 1]}
            start={{ x: 0, y: 0.5 }}
            style={styles.gradient}
          />
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  reflection: {
    position: 'absolute',
    left: 0,
  },
  gradient: { flex: 1 },
});
