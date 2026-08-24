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
  Platform,
  useWindowDimensions,
} from 'react-native';

import MaskedView from '@react-native-masked-view/masked-view';
import Svg, { Rect, Defs, Mask, Circle } from 'react-native-svg';
import { TutorialSpotlightProps } from '../../types/tutorial';

const SPOTLIGHT_PADDING = 8;

export const TutorialSpotlight: React.FC<TutorialSpotlightProps> = ({
  spotlight,
  children,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (spotlight) {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
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
  const { x, y, width, height, borderRadius = 8, showPulse = true, forceCircle = false, squareCorners = false } = spotlight;
  const isCircle = borderRadius >= Math.min(width, height) / 2;
  const effectiveRadius = isCircle ? Math.min(width, height) / 2 : borderRadius;
  const paddedRadius = squareCorners ? 0 : Math.max(0, effectiveRadius + SPOTLIGHT_PADDING);

// padded bounds
const paddedX = Math.max(0, x - SPOTLIGHT_PADDING);
const paddedY = Math.max(0, y - SPOTLIGHT_PADDING);
const paddedWidth = Math.max(1, Math.min(width + SPOTLIGHT_PADDING * 2, screenWidth - paddedX));
const paddedHeight = Math.max(1, Math.min(height + SPOTLIGHT_PADDING * 2, screenHeight - paddedY));

// iOS keeps MaskedView (nice rounded rect / circle).
const SpotlightMasked = (
  <MaskedView style={styles.maskContainer} pointerEvents="none"
    maskElement={
      <Svg width={screenWidth} height={screenHeight}>
        <Defs>
          <Mask
            id="spotlight-mask"
            x="0"
            y="0"
            width={screenWidth}
            height={screenHeight}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            <Rect
              x={paddedX}
              y={paddedY}
              width={paddedWidth}
              height={paddedHeight}
              rx={paddedRadius}
              ry={paddedRadius}
              fill="black"
            />
          </Mask>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(4,20,35,0.72)"
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
  width={screenWidth}
  height={screenHeight}
    pointerEvents="none"
    style={styles.maskContainer}
  >
    <Defs>
      <Mask
        id="android-spotlight-circle"
        x="0"
        y="0"
        width={screenWidth}
        height={screenHeight}
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
      fill="rgba(4,20,35,0.72)"
      mask="url(#android-spotlight-circle)"
    />
  </Svg>
);

// ANDROID: rectangular overlay (default behavior)
const AndroidRectangularOverlay = (
  <Svg
    width={screenWidth}
    height={screenHeight}
    pointerEvents="none"
    style={styles.maskContainer}
  >
    <Defs>
      <Mask
        id="android-spotlight-rect"
        x="0"
        y="0"
        width={screenWidth}
        height={screenHeight}
        maskUnits="userSpaceOnUse"
        maskContentUnits="userSpaceOnUse"
      >
        <Rect x="0" y="0" width="100%" height="100%" fill="white" />
        <Rect
          x={paddedX}
          y={paddedY}
          width={paddedWidth}
          height={paddedHeight}
          rx={paddedRadius}
          ry={paddedRadius}
          fill="black"
        />
      </Mask>
    </Defs>
    <Rect
      x="0"
      y="0"
      width="100%"
      height="100%"
      fill="rgba(4,20,35,0.72)"
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
      - Keep the mask non-interactive so the highlighted control and tutorial
        card remain touchable above Mapbox's native view.

  Result:
    • Identical visuals cross-platform; reliable tap-through inside the spotlight.
*/
const useMask = Platform.OS !== 'android';
const OverlayVisual = useMask 
  ? SpotlightMasked 
  : (forceCircle ? AndroidCircularOverlay : AndroidRectangularOverlay);

/*
  Render order matters:
    1) Visual overlay (pointerEvents="none") — draws the dim background with the hole
    2) Tutorial card — remains the top interactive child.
*/
return (
  <View style={styles.container} pointerEvents="box-none">

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
                borderRadius: paddedRadius + 4,
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
                borderRadius: paddedRadius + 8,
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
  fullOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,20,35,0.72)' },
  borderRing: { position: 'absolute', borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: 'transparent', shadowColor: '#2497F3', shadowOffset: { width:0, height:0 }, shadowOpacity:0.9, shadowRadius:8, elevation:0 },
  glowRing: { position: 'absolute', borderWidth: 2, borderColor: '#2497F3', backgroundColor: 'transparent', shadowColor: '#2497F3', shadowOffset: {width:0, height:0}, shadowOpacity:0.55, shadowRadius:14, elevation:0 },
});
