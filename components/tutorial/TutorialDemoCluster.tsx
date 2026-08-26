import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComponentMeasurement } from '../../types/tutorial';
import { getTutorialDemoClusterFrame } from '../../utils/tutorialDemoFixtureLayout';

interface Props {
  onLayout: (measurement: ComponentMeasurement) => void;
}

/**
 * A tutorial-only nearby-results marker. It deliberately lives in the React
 * Native overlay instead of Mapbox so its visible centre and spotlight share
 * the same layout coordinate system on iOS and Android.
 */
export const TutorialDemoCluster: React.FC<Props> = ({ onLayout }) => {
  const insets = useSafeAreaInsets();
  const viewport = useWindowDimensions();
  const frame = getTutorialDemoClusterFrame(viewport, insets);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    onLayout({ x, y, width, height });
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={handleLayout}
      pointerEvents="none"
      style={[styles.marker, { left: frame.x, top: frame.y }]}
    >
      <View style={styles.markerCore}>
        <Ionicons name="calendar-outline" size={18} color="#FFFFFF" />
        <Text style={styles.markerCount}>12</Text>
      </View>
      <View style={styles.markerCaption}>
        <Text style={styles.markerCaptionText}>nearby</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#DDF3FF',
    shadowColor: '#001526',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 10,
    elevation: 12,
  },
  markerCore: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#118B5D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  markerCount: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', lineHeight: 17 },
  markerCaption: {
    position: 'absolute',
    bottom: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(5, 55, 38, 0.82)',
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  markerCaptionText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900', letterSpacing: 0.2 },
});
