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
import { TutorialFocusShimmer } from './TutorialFocusShimmer';

const CLUSTER_MAP = require('../../assets/tutorial/cluster-map-example.png');
const CLUSTER_CALLOUT = require('../../assets/tutorial/cluster-callout-example.jpg');

type SceneFocus = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  labelPlacement?: 'focus' | 'stage' | 'below' | 'header';
  edgeOnly?: boolean;
  showRing?: boolean;
  showPulse?: boolean;
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
    focus: {
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      label: 'MAP EXAMPLE',
      labelPlacement: 'stage',
      showRing: false,
    },
    accessibilityLabel: 'Example of the GathR map with nearby events and specials',
  },
  'cluster-tree': {
    source: CLUSTER_MAP,
    focus: { x: 0.62, y: 0.39, width: 0.19, height: 0.15, label: '' },
    accessibilityLabel: 'Example GathR map cluster marker',
  },
  'cluster-summary': {
    source: CLUSTER_MAP,
    focus: { x: 0.61, y: 0.43, width: 0.33, height: 0.24, label: '' },
    accessibilityLabel: 'Example cluster counts and category markers',
  },
  'callout-venues': {
    source: CLUSTER_CALLOUT,
    focus: {
      x: 0.5,
      y: 0.12,
      width: 0.99,
      height: 0.12,
      label: 'VENUE RAIL',
      labelPlacement: 'header',
      edgeOnly: true,
      showPulse: true,
    },
    accessibilityLabel: 'Example GathR cluster callout with nearby venues',
  },
  'callout-tabs': {
    source: CLUSTER_CALLOUT,
    focus: {
      x: 0.5,
      y: 0.208,
      width: 0.99,
      height: 0.06,
      label: 'EVENTS AND SPECIALS',
      labelPlacement: 'below',
      edgeOnly: true,
      showPulse: true,
    },
    accessibilityLabel: 'Example callout tabs for events and specials',
  },
  'callout-card': {
    source: CLUSTER_CALLOUT,
    focus: { x: 0.5, y: 0.48, width: 0.98, height: 0.52, label: 'LISTING DETAILS', edgeOnly: true },
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
    if (!definition.focus.showPulse) {
      ringPulse.setValue(1);
      return;
    }

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
  }, [definition.focus.showPulse, ringPulse]);

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
  const isFullFrameFocus = definition.focus.width === 1 && definition.focus.height === 1;
  const stageLabel = definition.focus.labelPlacement === 'stage';
  const labelBelowFocus = definition.focus.labelPlacement === 'below';
  const labelOverHeader = definition.focus.labelPlacement === 'header';
  const showRing = definition.focus.showRing !== false;

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
            <Rect x="0" y="0" width={frame.width} height={frame.height} fill="rgba(2, 13, 24, 0.74)" mask="url(#static-scene-focus-mask)" />
          </Svg>
        )}

        {frame.width > 0 && frame.height > 0 && !definition.focus.edgeOnly && showRing && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusRing,
              isFullFrameFocus && styles.fullFrameFocusRing,
              {
                left: isFullFrameFocus ? 3 : focusLeft - 4,
                top: isFullFrameFocus ? 3 : focusTop - 4,
                width: isFullFrameFocus ? Math.max(0, focusWidth - 6) : focusWidth + 8,
                height: isFullFrameFocus ? Math.max(0, focusHeight - 6) : focusHeight + 8,
                transform: [{ scale: ringPulse }],
              },
            ]}
          >
            <TutorialFocusShimmer borderRadius={isFullFrameFocus ? 24 : 18} />
            {!definition.focus.edgeOnly && !stageLabel && Boolean(definition.focus.label) && (
              <View style={[styles.focusLabel, labelInsideFocus && styles.focusLabelInside]}>
                <Text style={styles.focusLabelText}>{definition.focus.label}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {frame.width > 0 && frame.height > 0 && definition.focus.edgeOnly && showRing && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.edgeFocus,
              {
                left: focusLeft,
                top: focusTop,
                width: focusWidth,
                height: focusHeight,
                transform: [{ scaleX: ringPulse }],
              },
            ]}
          >
            <View style={styles.edgeFocusTop} />
            <TutorialFocusShimmer borderRadius={18} />
            {Boolean(definition.focus.label) && !labelOverHeader && (
              <View style={[
                styles.focusLabel,
                styles.edgeFocusLabel,
                labelBelowFocus && { top: focusHeight + 7 },
              ]}>
                <Text style={styles.focusLabelText}>{definition.focus.label}</Text>
              </View>
            )}
            <View style={[styles.edgeFocusBottom, { top: Math.max(0, focusHeight - 2) }]} />
          </Animated.View>
        )}

        {frame.width > 0 && frame.height > 0 && !showRing && (
          <TutorialFocusShimmer borderRadius={24} style={styles.fullFrameShimmer} />
        )}

        {labelOverHeader && Boolean(definition.focus.label) && (
          <View pointerEvents="none" style={styles.headerFocusLabel}>
            <Text style={styles.focusLabelText}>{definition.focus.label}</Text>
          </View>
        )}

        <View pointerEvents="none" style={styles.exampleBadge}>
          <Text style={styles.exampleBadgeText}>REAL GATHR EXAMPLE</Text>
        </View>
      </View>

      {stageLabel && (
        <View
          pointerEvents="none"
          style={[styles.stageLabel, { top: Math.max(insets.top + 4, frameInsets.top - 12) }]}
        >
          <Text style={styles.stageLabelText}>{definition.focus.label}</Text>
        </View>
      )}
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
  fullFrameFocusRing: { borderRadius: 24 },
  focusLabel: {
    position: 'absolute', top: -29, left: 8, maxWidth: '88%', borderRadius: 10,
    backgroundColor: '#0B2235', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 8, paddingVertical: 5,
  },
  focusLabelInside: { top: 8 },
  focusLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  edgeFocus: { position: 'absolute', height: '100%' },
  edgeFocusTop: {
    height: 2, width: '100%', backgroundColor: '#FFFFFF', borderRadius: 2,
    shadowColor: '#2497F3', shadowOpacity: 0.65, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  edgeFocusBottom: {
    position: 'absolute', height: 2, width: '100%', backgroundColor: '#FFFFFF', borderRadius: 2,
    shadowColor: '#2497F3', shadowOpacity: 0.65, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 4,
  },
  edgeFocusLabel: { top: 8, left: 10 },
  headerFocusLabel: {
    position: 'absolute', top: 8, left: 10, zIndex: 5, borderRadius: 10,
    backgroundColor: '#0B2235', borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 8, paddingVertical: 5,
  },
  fullFrameShimmer: { top: 3, right: 3, bottom: 3, left: 3 },
  stageLabel: {
    position: 'absolute', alignSelf: 'center', zIndex: 4, borderRadius: 10,
    backgroundColor: 'rgba(5, 27, 46, 0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.38)',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  stageLabelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  exampleBadge: {
    position: 'absolute', right: 12, bottom: 12, borderRadius: 12, backgroundColor: 'rgba(5, 24, 40, 0.88)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', paddingHorizontal: 9, paddingVertical: 6,
  },
  exampleBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.75 },
});
