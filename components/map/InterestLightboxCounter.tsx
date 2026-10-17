import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getLightboxEventPosition } from '../../utils/lightboxNavigation';

export default function InterestLightboxCounter({ index, count }: { index?: number; count: number }) {
  const position = getLightboxEventPosition(index, count, false);
  if (!position) return null;
  return <View pointerEvents="none" style={styles.badge} testID="interest-lightbox-event-position">
    <Text accessibilityLabel={position.label} style={styles.text}>{position.label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 12, left: 12, zIndex: 12, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(12,18,25,0.84)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)' },
  text: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
