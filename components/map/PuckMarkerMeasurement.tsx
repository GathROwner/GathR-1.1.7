import React, { useCallback, useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import type { MapRect, MarkerGeometry } from '../../utils/clusterPuckLayout';

type Props = {
  id: string;
  compact: boolean;
  countLabel: string;
  dockX: number;
  dockY: number;
  record: (id: string, geometry: MarkerGeometry) => void;
  children: React.ReactNode;
};
const boundsFor = (e: LayoutChangeEvent): MapRect => {
  const { width, height } = e.nativeEvent.layout;
  return { left: -width / 2, right: width / 2, top: -height, bottom: 0 };
};

/** Both variants are measured by native layout; only the chosen variant is visible/touchable. */
export function PuckMarkerMeasurement({ id, compact, countLabel, dockX, dockY, record, children }: Props) {
  const [normalBounds, setNormalBounds] = useState<MapRect | null>(null);
  const [compactBounds, setCompactBounds] = useState<MapRect | null>(null);
  const measureNormal = useCallback((e: LayoutChangeEvent) => setNormalBounds(boundsFor(e)), []);
  const measureCompact = useCallback((e: LayoutChangeEvent) => setCompactBounds(boundsFor(e)), []);
  useLayoutEffect(() => {
    if (normalBounds && compactBounds) record(id, { bounds: normalBounds, compactBounds, dock: [dockX, dockY] });
  }, [id, normalBounds, compactBounds, dockX, dockY, record]);
  return <View collapsable={false}>
    <View collapsable={false} onLayout={measureNormal} style={compact ? styles.hidden : undefined}
      pointerEvents={compact ? 'none' : 'auto'} accessibilityElementsHidden={compact} importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}>{children}</View>
    <View collapsable={false} onLayout={measureCompact} style={[styles.count, !compact && styles.hidden]}
      pointerEvents={compact ? 'auto' : 'none'} accessibilityElementsHidden={!compact} importantForAccessibility={compact ? 'auto' : 'no-hide-descendants'}>
      <Text style={styles.label}>{countLabel}</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  hidden: { position: 'absolute', opacity: 0 },
  count: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#8C6E31', backgroundColor: '#FFFDF6', paddingHorizontal: 8, paddingVertical: 5 },
  label: { fontSize: 12, fontWeight: '700', color: '#674C13' },
});
