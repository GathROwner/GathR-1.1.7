import React from 'react';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export type CalloutModalTabTarget = 'events' | 'map' | 'specials';

interface CalloutModalTabBarTouchLayerProps {
  height: number;
  bottomOffset?: number;
  edgeInset?: DimensionValue;
  onSelect: (target: CalloutModalTabTarget) => void;
}

const TAB_TARGETS: readonly CalloutModalTabTarget[] = ['events', 'map', 'specials'];

export default function CalloutModalTabBarTouchLayer({
  height,
  bottomOffset = 0,
  edgeInset = 0,
  onSelect,
}: CalloutModalTabBarTouchLayerProps) {
  return (
    <View
      pointerEvents="auto"
      style={[styles.container, { height, bottom: bottomOffset, left: edgeInset, right: edgeInset, borderRadius: height / 2 }]}
      testID="callout-modal-tab-touch-layer"
    >
      {TAB_TARGETS.map((target) => (
        <Pressable
          accessibilityLabel={target === 'map' ? 'Map' : target === 'events' ? 'Events' : 'Specials'}
          accessibilityRole="tab"
          accessibilityState={{ selected: target === 'map' }}
          key={target}
          onPress={() => onSelect(target)}
          style={styles.target}
          testID={`callout-modal-tab-${target}`}
        >
          {target === 'map' && <View pointerEvents="none" style={styles.selectedTarget} />}
          <Ionicons
            name={target === 'events' ? 'calendar-outline' : target === 'map' ? 'map' : 'restaurant-outline'}
            size={target === 'map' ? 20 : 24}
            color={target === 'map' ? '#1E90FF' : 'rgba(255,255,255,0.78)'}
          />
          <Text style={[styles.label, target === 'map' && styles.selectedLabel]}>
            {target === 'map' ? 'Map' : target === 'events' ? 'Events' : 'Specials'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(24, 27, 33, 0.78)',
    bottom: 0,
    elevation: 60,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 60,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  target: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  selectedTarget: {
    ...StyleSheet.absoluteFillObject,
    margin: 5,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  label: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600' },
  selectedLabel: { color: '#1E90FF' },
});
