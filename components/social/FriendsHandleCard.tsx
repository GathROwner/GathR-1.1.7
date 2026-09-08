import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { SocialProfile } from '../../types/social';
import { ProfileAvatar } from './ProfileAvatar';

export function FriendsHandleCard({
  profile,
  claimedHandle,
  onEdit,
  onShare,
}: {
  profile: SocialProfile;
  claimedHandle: string;
  onEdit: () => void;
  onShare: () => void;
}) {
  return (
    <View style={styles.card} testID="friends-handle-card">
      <View style={styles.identity} testID="friends-handle-identity">
        <ProfileAvatar profile={profile} size={44} />
        <View style={styles.summary}>
          <Text maxFontSizeMultiplier={1.15} style={styles.eyebrow}>YOUR HANDLE</Text>
          <Text maxFontSizeMultiplier={1.15} style={styles.handle}>
            {claimedHandle ? `@${claimedHandle}` : 'Claim a searchable handle'}
          </Text>
        </View>
      </View>
      <View style={styles.actions} testID="friends-handle-actions">
        {claimedHandle && (
          <TouchableOpacity
            accessibilityLabel="Show friend QR code"
            accessibilityRole="button"
            onPress={onShare}
            style={styles.action}
          >
            <Ionicons name="qr-code-outline" size={18} color="#6941C6" />
            <Text maxFontSizeMultiplier={1.1} style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityLabel={claimedHandle ? 'Edit GathR handle' : 'Claim GathR handle'}
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.action}
        >
          <Ionicons name={claimedHandle ? 'pencil' : 'add'} size={17} color="#175CD3" />
          <Text maxFontSizeMultiplier={1.1} style={styles.editText}>{claimedHandle ? 'Edit' : 'Claim'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E4E7EC',
    borderRadius: 14,
    backgroundColor: '#FFF',
  },
  identity: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summary: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  handle: {
    marginTop: 1,
    color: '#101828',
    fontSize: 17,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  action: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D1E9FF',
    borderRadius: 10,
    backgroundColor: '#EFF8FF',
  },
  shareText: { color: '#6941C6', fontWeight: '800' },
  editText: { color: '#175CD3', fontWeight: '700' },
});
