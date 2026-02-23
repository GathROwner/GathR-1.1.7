/**
 * GathR Tutorial System - Enhanced Tutorial Spotlight Component
 *
 * Updated: Restored overlay opacity to 0.85. Overlay now uses rgba(0,0,0,0.85) explicitly.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Rect, Defs, Mask, Circle } from 'react-native-svg';
import { TutorialSpotlightProps } from '../../types/tutorial';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SPOTLIGHT_PADDING = 8;

export const TutorialSpotlight: React.FC<TutorialSpotlightProps> = ({
  spotlight,
  children,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (spotlight) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000, // pulse duration
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]);
      const looping = Animated.loop(pulse);
      looping.start();
      return () => {
        looping.stop();
        pulseAnim.stopAnimation();
      };
    }
  }, [spotlight, pulseAnim]);

  if (!spotlight) {
    return (
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.fullOverlay} pointerEvents="none" />
        {children}
      </View>
    );
  }

  /* 
  SpotlightConfig controls both geometry and visuals:
    • x,y,width,height — measured target rect (in window coords)
    • borderRadius     — rounded-rect corners (non-cluster steps)
    • showPulse        — pulsing ring effect
    • forceCircle      — true only for the cluster step to render a perfect circle
*/
  const { x, y, width, height, borderRadius = 8, showPulse = true, forceCircle = false } = spotlight;
  const isCircle = borderRadius >= Math.min(width, height) / 2;
  const effectiveRadius = isCircle ? Math.min(width, height) / 2 : borderRadius;

// padded bounds
const paddedX = x - SPOTLIGHT_PADDING;
const paddedY = y - SPOTLIGHT_PADDING;
const paddedWidth = width + SPOTLIGHT_PADDING * 2;
const paddedHeight = height + SPOTLIGHT_PADDING * 2;

// iOS keeps MaskedView (nice rounded rect / circle).
const SpotlightMasked = (
  <MaskedView style={styles.maskContainer} pointerEvents="none"
    maskElement={
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT}>
        <Defs>
          <Mask
            id="spotlight-mask"
            x="0"
            y="0"
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            <Rect
              x={paddedX}
              y={paddedY}
              width={paddedWidth}
              height={paddedHeight}
              rx={effectiveRadius + SPOTLIGHT_PADDING}
              ry={effectiveRadius + SPOTLIGHT_PADDING}
              fill="black"
            />
          </Mask>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.85)"
          mask="url(#spotlight-mask)"
        />
      </Svg>
    }>
    <View style={styles.fullOverlay} pointerEvents="none" />
  </MaskedView>
);

// ANDROID: full-screen circular mask overlay (pointerEvents="none").
// This supplies the DIMMING visually with a TRUE circular hole; interceptors remain transparent
// and only block touches outside the hole.
const AndroidCircularOverlay = (
  <Svg
    width={SCREEN_WIDTH}
    height={SCREEN_HEIGHT}
    pointerEvents="none"
    style={styles.maskContainer}
  >
    <Defs>
      <Mask
        id="android-spotlight-circle"
        x="0"
        y="0"
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        maskUnits="userSpaceOnUse"
        maskContentUnits="userSpaceOnUse"
      >
        <Rect x="0" y="0" width="100%" height="100%" fill="white" />
        <Circle
          cx={paddedX + paddedWidth / 2}
          cy={paddedY + paddedHeight / 2}
          r={Math.min(paddedWidth, paddedHeight) / 2}
          fill="black"
        />
      </Mask>
    </Defs>
    <Rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="rgba(0,0,0,0.85)"
      mask="url(#android-spotlight-circle)"
    />
  </Svg>
);

// ANDROID: rectangular overlay (default behavior)
const AndroidRectangularOverlay = (
  <Svg
    width={SCREEN_WIDTH}
    height={SCREEN_HEIGHT}
    pointerEvents="none"
    style={styles.maskContainer}
  >
    <Defs>
      <Mask
        id="android-spotlight-rect"
        x="0"
        y="0"
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        maskUnits="userSpaceOnUse"
        maskContentUnits="userSpaceOnUse"
      >
        <Rect x="0" y="0" width="100%" height="100%" fill="white" />
        <Rect
          x={paddedX}
          y={paddedY}
          width={paddedWidth}
          height={paddedHeight}
          rx={effectiveRadius + SPOTLIGHT_PADDING}
          ry={effectiveRadius + SPOTLIGHT_PADDING}
          fill="black"
        />
      </Mask>
    </Defs>
    <Rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="rgba(0,0,0,0.85)"
      mask="url(#android-spotlight-rect)"
    />
  </Svg>
);


/*
  ──────────────────────────────────────────────────────────────────────────────
  OVERLAY RENDERING & TOUCH HANDLING
  ──────────────────────────────────────────────────────────────────────────────
  iOS:
    • Use <MaskedView> with an SVG mask (rounded rect or circle).
    • pointerEvents="none" so taps fall through the hole.

  Android:
    • Do NOT use MaskedView (can swallow touches). Instead:
      - Draw a full-screen SVG overlay (pointerEvents="none"):
          • circular hole when forceCircle=true (cluster step)
          • rounded-rect hole otherwise
      - Keep four transparent “interceptor” Views to catch taps OUTSIDE the hole.
        The hole area remains empty, so taps reach the underlying component.

  Result:
    • Identical visuals cross-platform; reliable tap-through inside the spotlight.
*/
const useMask = Platform.OS !== 'android';
const OverlayVisual = useMask 
  ? SpotlightMasked 
  : (forceCircle ? AndroidCircularOverlay : AndroidRectangularOverlay);

/*
  Render order matters:
    1) Interceptor Views (transparent) — block taps outside the hole
    2) Visual overlay (pointerEvents="none") — draws the dim background with the hole
    This guarantees tap-through inside the hole on Android.
*/
return (
  <View style={styles.container} pointerEvents="box-none">

    {/* intercept touches outside hole (NO background — purely touch blockers) */}
    <View pointerEvents="auto" style={[styles.interceptor, { top: 0, left: 0, right: 0, height: paddedY }]} />
    <View pointerEvents="auto" style={[styles.interceptor, { top: paddedY, left: 0, width: paddedX, height: paddedHeight }]} />
    <View pointerEvents="auto" style={[styles.interceptor, { top: paddedY, left: paddedX + paddedWidth, right: 0, height: paddedHeight }]} />
    <View pointerEvents="auto" style={[styles.interceptor, { top: paddedY + paddedHeight, left: 0, right: 0, bottom: 0 }]} />

    {/* visual dimming layer (pointerEvents="none"), circular on Android, masked on iOS */}
    {OverlayVisual}


      {showPulse && (
        <>
          <Animated.View
            style={[
              styles.borderRing,
              {
                left: paddedX - 4,
                top: paddedY - 4,
                width: paddedWidth + 8,
                height: paddedHeight + 8,
                borderRadius: effectiveRadius + SPOTLIGHT_PADDING + 4,
                transform: [{ scale: pulseAnim }],
              },
            ]}
            pointerEvents="none"
          />
          <Animated.View
            style={[
              styles.glowRing,
              {
                left: paddedX - 8,
                top: paddedY - 8,
                width: paddedWidth + 16,
                height: paddedHeight + 16,
                borderRadius: effectiveRadius + SPOTLIGHT_PADDING + 8,
                opacity: pulseAnim.interpolate({ inputRange: [1,1.05], outputRange: [0.6,0.9] }),
              },
            ]}
            pointerEvents="none"
          />
        </>
      )}

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  maskContainer: { ...StyleSheet.absoluteFillObject },
  fullOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  interceptor: { position: 'absolute', backgroundColor: 'transparent' },
  borderRing: { position: 'absolute', borderWidth: 4, borderColor: '#FF5722', backgroundColor: 'transparent', shadowColor: '#FF5722', shadowOffset: { width:0, height:0 }, shadowOpacity:0.8, shadowRadius:8, elevation:0 },
  glowRing: { position: 'absolute', borderWidth: 2, borderColor: 'transparent', backgroundColor: 'transparent', shadowColor: '#FF5722', shadowOffset: {width:0, height:0}, shadowOpacity:0.6, shadowRadius:16, elevation:0 },
});
