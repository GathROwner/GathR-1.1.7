import React from 'react';
import { Animated, StyleSheet } from 'react-native';

/** Fixed-size compositor wrapper: the iOS sheet inside retains static layout. */
export default function CalloutDismissSurface({ children, translateY, closing }: {
  children: React.ReactNode;
  translateY: Animated.AnimatedInterpolation<number>;
  closing: boolean;
}) {
  return (
    <Animated.View
      pointerEvents={closing ? 'none' : 'box-none'}
      testID="callout-dismiss-translation-surface"
      style={[StyleSheet.absoluteFillObject, { zIndex: 2, elevation: 50, transform: [{ translateY }] }]}
    >
      {children}
    </Animated.View>
  );
}
