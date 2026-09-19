import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

/** The number always represents people, not events or venues. */
export default function FriendCheckInBadge({ count, standalone = false, style }: {
  count: number;
  standalone?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrapper, style]} accessibilityLabel={`${count} ${count === 1 ? 'friend' : 'friends'} checked in`}>
      <View style={[styles.capsule, standalone && styles.standalone]}>
        <Ionicons name="people" size={standalone ? 16 : 9} color="#FFFFFF" />
        <Text maxFontSizeMultiplier={1.3} style={[styles.count, standalone && styles.standaloneCount]}>{count > 9 ? '9+' : count}</Text>
      </View>
      {standalone && <View style={styles.tip} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', zIndex: 8 },
  capsule: { minWidth: 22, height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3, borderRadius: 9, borderWidth: 1.25, borderColor: '#FFFFFF', backgroundColor: '#6941C6', shadowColor: '#301A58', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 5 },
  standalone: { minWidth: 42, height: 30, borderRadius: 16, borderWidth: 2, paddingHorizontal: 7, gap: 3 },
  count: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },
  standaloneCount: { fontSize: 13 },
  tip: { marginTop: -1, width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#6941C6' },
});
