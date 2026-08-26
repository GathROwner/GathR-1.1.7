import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ImageSourcePropType,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { TutorialStaticSceneId } from '../../types/tutorial';

const CLUSTER_MAP = require('../../assets/tutorial/cluster-map-example.png');
const CLUSTER_CALLOUT = require('../../assets/tutorial/cluster-callout-example.jpg');

type SceneFocus = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

type SceneDefinition = {
  source: ImageSourcePropType;
  focus: SceneFocus;
  accessibilityLabel: string;
};

/**
 * These are captured GathR surfaces, not substitute controls. Keeping the
 * map/callout lesson deterministic lets the tutorial move the visual focus
 * without depending on Mapbox camera, clustering, or native-callout timing.
 */
const SCENES: Record<TutorialStaticSceneId, SceneDefinition> = {
  'map-overview': {
    source: CLUSTER_MAP,
    focus: { x: 0.5, y: 0.5, width: 0.86, height: 0.68, label: 'MAP EXAMPLE' },
    accessibilityLabel: 'Example of the GathR map with nearby events and specials',
  },
  'cluster-tree': {
    source: CLUSTER_MAP,
    focus: { x: 0.48, y: 0.51, width: 0.25, height: 0.18, label: 'NEARBY CLUSTER' },
    accessibilityLabel: 'Example GathR map cluster marker',
  },
  'cluster-summary': {
    source: CLUSTER_MAP,
    focus: { x: 0.5, y: 0.47, width: 0.43, height: 0.28, label: 'AT-A-GLANCE SUMMARY' },
    accessibilityLabel: 'Example cluster counts and category markers',
  },
  'map-controls': {
    source: CLUSTER_MAP,
    focus: { x: 0.5, y: 0.14, width: 0.87, height: 0.16, label: 'QUICK CONTROLS' },
    accessibilityLabel: 'Example GathR map controls',
  },
  'callout-venues': {
    source: CLUSTER_CALLOUT,
    focus: { x: 0.5, y: 0.13, width: 0.94, height: 0.2, label: 'VENUE RAIL' },
    accessibilityLabel: 'Example GathR cluster callout with nearby venues',
  },
  'callout-tabs': {
    source: CLUSTER_CALLOUT,
    focus: { x: 0.5, y: 0.21, width: 0.94, height: 0.09, label: 'EVENTS AND SPECIALS' },
    accessibilityLabel: 'Example callout tabs for events and specials',
  },
  'callout-card': {
    source: CLUSTER_CALLOUT,
    focus: { x: 0.5, y: 0.5, width: 0.95, height: 0.5, label: 'LISTING DETAILS' },
    accessibilityLabel: 'Example GathR listing card with time, place, and actions',
  },
};

interface Props {
  scene: TutorialStaticSceneId;
}

export const StaticTutorialScene: React.FC<Props> = ({ scene }) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const definition = SCENES[scene];
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const ringPulse = useRef(new Animated.Value(1)).current;

  const frameInsets = useMemo(() => ({
    top: Math.max(insets.top + 10, 18),
    bottom: Math.max(insets.bottom + 10, 18),
    horizontal: Math.max(insets.left + 10, insets.right + 10, 10),
  }), [insets.bottom, insets.left, insets.right, insets.top]);

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1.035, duration: 950, useNativeDriver: true }),
      Animated.timing(ringPulse, { toValue: 1, duration: 950, useNativeDriver: true }),
    ]));
    loop.start();
    return () => {
      loop.stop();
      ringPulse.stopAnimation();
      ringPulse.setValue(1);
    };
  }, [ringPulse]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== frame.width || height !== frame.height)) {
      setFrame({ width, height });
    }
  };

  const focusWidth = frame.width * definition.focus.width;
  const focusHeight = frame.height * definition.focus.height;
  const focusLeft = frame.width * definition.focus.x - focusWidth / 2;
  const focusTop = frame.height * definition.focus.y - focusHeight / 2;
  const labelInsideFocus = focusTop < 34;

  return (
    <View
      pointerEvents="box-only"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onStartShouldSetResponder={() => true}
      style={styles.stage}
    >
      <View
        onLayout={handleLayout}
        style={[
          styles.frame,
          {
            top: frameInsets.top,
            bottom: frameInsets.bottom,
            left: frameInsets.horizontal,
            right: frameInsets.horizontal,
            maxWidth: Math.min(460, screenWidth - frameInsets.horizontal * 2),
            maxHeight: screenHeight - frameInsets.top - frameInsets.bottom,
          },
        ]}
      >
        <Animated.Image
          accessibilityLabel={definition.accessibilityLabel}
          source={definition.source}
          resizeMode="cover"
          style={styles.image}
        />

        {frame.width > 0 && frame.height > 0 && (
          <Svg width={frame.width} height={frame.height} style={styles.vignette} pointerEvents="none">
            <Defs>
              <Mask id="static-scene-focus-mask">
                <Rect x="0" y="0" width={frame.width} height={frame.height} fill="white" />
                <Rect x={focusLeft} y={focusTop} width={focusWidth} height={focusHeight} rx={18} ry={18} fill="black" />
              </Mask>
            </Defs>
            <Rect x="0" y="0" width={frame.width} height={frame.height} fill="rgba(2, 13, 24, 0.54)" mask="url(#static-scene-focus-mask)" />
          </Svg>
        )}

        {frame.width > 0 && frame.height > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusRing,
              {
                left: focusLeft - 4,
                top: focusTop - 4,
                width: focusWidth + 8,
                height: focusHeight + 8,
                transform: [{ scale: ringPulse }],
              },
            ]}
          >
            <View style={[styles.focusLabel, labelInsideFocus && styles.focusLabelInside]}>
              <Text style={styles.focusLabelText}>{definition.focus.label}</Text>
            </View>
          </Animated.View>
        )}

        <View pointerEvents="none" style={styles.exampleBadge}>
          <Text style={styles.exampleBadgeText}>REAL GATHR EXAMPLE</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { ...StyleSheet.absoluteFillObject, zIndex: 0, elevation: 0, backgroundColor: '#041525' },
  frame: {
    position: 'absolute', width: '100%', alignSelf: 'center', overflow: 'hidden', borderRadius: 28,
    backgroundColor: '#071C2E', borderWidth: 1, borderColor: 'rgba(202, 230, 250, 0.42)',
    shadowColor: '#000000', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 4,
  },
  image: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  vignette: { ...StyleSheet.absoluteFillObject },
  focusRing: {
    position: 'absolute', borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 22,
    shadowColor: '#2497F3', shadowOpacity: 0.95, shadowRadius: 12, shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  focusLabel: {
    position: 'absolute', top: -29, left: 8, maxWidth: '88%', borderRadius: 10,
    backgroundColor: '#0B2235', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 8, paddingVertical: 5,
  },
  focusLabelInside: { top: 8 },
  focusLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  exampleBadge: {
    position: 'absolute', right: 12, bottom: 12, borderRadius: 12, backgroundColor: 'rgba(5, 24, 40, 0.88)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', paddingHorizontal: 9, paddingVertical: 6,
  },
  exampleBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.75 },
});
