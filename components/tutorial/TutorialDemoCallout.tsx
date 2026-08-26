import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useRef } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComponentMeasurement } from '../../types/tutorial';

interface Props {
  onVenueSelectorLayout: (measurement: ComponentMeasurement) => void;
  onReady: () => void;
}

/**
 * A deliberately generic callout used only during the tutorial. It teaches the
 * callout structure without manufacturing real venues or events, and avoids
 * waiting for a native Mapbox callout to settle before the lesson can proceed.
 */
export const TutorialDemoCallout: React.FC<Props> = ({
  onVenueSelectorLayout,
  onReady,
}) => {
  const insets = useSafeAreaInsets();
  const venueSelectorRef = useRef<View>(null);

  const handleVenueSelectorLayout = useCallback((_event: LayoutChangeEvent) => {
    // A nested onLayout reports coordinates relative to this bottom sheet.
    // The tutorial overlay is mounted at the app root, so measure in window
    // coordinates before handing the frame to the spotlight.
    requestAnimationFrame(() => {
      venueSelectorRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        onVenueSelectorLayout({ x, y, width, height });
        onReady();
      });
    });
  }, [onReady, onVenueSelectorLayout]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.surface, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.handle} />
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Places nearby</Text>
        <Text style={styles.count}>3 places</Text>
      </View>

      <View ref={venueSelectorRef} onLayout={handleVenueSelectorLayout} style={styles.selectorRow}>
        <View style={[styles.placeCard, styles.activePlaceCard]}>
          <View style={[styles.placeAvatar, styles.activeAvatar]}>
            <Ionicons name="location" size={16} color="#168BE8" />
          </View>
          <Text numberOfLines={1} style={styles.activePlaceText}>A nearby place</Text>
        </View>
        <View style={styles.placeCard}>
          <View style={styles.placeAvatar}>
            <Ionicons name="storefront-outline" size={15} color="#547188" />
          </View>
          <Text numberOfLines={1} style={styles.placeText}>Another place</Text>
        </View>
        <View style={styles.placeCard}>
          <View style={styles.placeAvatar}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#547188" />
          </View>
          <Text numberOfLines={1} style={styles.placeText}>More</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <View style={styles.activeTab}><Text style={styles.activeTabText}>Events</Text></View>
        <View style={styles.tab}><Text style={styles.tabText}>Specials</Text></View>
        <View style={styles.tab}><Text style={styles.tabText}>Venue info</Text></View>
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewIcon}>
          <Ionicons name="compass-outline" size={20} color="#168BE8" />
        </View>
        <View style={styles.previewCopy}>
          <Text style={styles.previewTitle}>What is happening nearby</Text>
          <Text style={styles.previewText}>Choose a place, then explore its events and specials.</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  surface: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingTop: 11,
    paddingHorizontal: 14,
    shadowColor: '#001526',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#B9CAD7' },
  headingRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: '#102B40', fontSize: 17, fontWeight: '900' },
  count: { color: '#60778A', fontSize: 13, fontWeight: '700' },
  selectorRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  placeCard: {
    flex: 1,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D9E6EF',
    borderRadius: 13,
    backgroundColor: '#F9FCFE',
    paddingHorizontal: 6,
  },
  activePlaceCard: { borderWidth: 2, borderColor: '#168BE8', backgroundColor: '#EAF6FF' },
  placeAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F1F6', marginBottom: 4 },
  activeAvatar: { backgroundColor: '#D8F0FF' },
  placeText: { color: '#547188', fontSize: 10, fontWeight: '800', textAlign: 'center' },
  activePlaceText: { color: '#0C659F', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 7, marginTop: 12 },
  tab: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#F1F6F9', paddingVertical: 8 },
  activeTab: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#168BE8', paddingVertical: 8 },
  tabText: { color: '#557084', fontSize: 12, fontWeight: '800' },
  activeTabText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  previewCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: '#F5FAFD', marginTop: 12, padding: 12, gap: 10 },
  previewIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0F2FE' },
  previewCopy: { flex: 1 },
  previewTitle: { color: '#18354A', fontSize: 14, fontWeight: '900' },
  previewText: { color: '#62798A', fontSize: 12, lineHeight: 16, marginTop: 2, fontWeight: '600' },
});
