import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export type CalloutModalTabTarget = 'events' | 'map' | 'specials';

interface CalloutModalTabBarTouchLayerProps {
  height: number;
  onSelect: (target: CalloutModalTabTarget) => void;
}

const TAB_TARGETS: readonly CalloutModalTabTarget[] = ['events', 'map', 'specials'];

export default function CalloutModalTabBarTouchLayer({
  height,
  onSelect,
}: CalloutModalTabBarTouchLayerProps) {
  return (
    <View
      pointerEvents="auto"
      style={[styles.container, { height }]}
      testID="callout-modal-tab-touch-layer"
    >
      {TAB_TARGETS.map((target) => (
        <Pressable
          accessibilityLabel={target === 'map' ? 'Map' : target === 'events' ? 'Events' : 'Specials'}
          accessibilityRole="tab"
          key={target}
          onPress={() => onSelect(target)}
          style={styles.target}
          testID={`callout-modal-tab-${target}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    bottom: 0,
    elevation: 40,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 40,
  },
  target: {
    flex: 1,
    height: '100%',
  },
});
