import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import {
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { FriendActivityProjection } from '../../types/social';
import { isFriendActivityActive, socialTimestampToMillis } from '../../utils/friendPresence';

export interface ExternalFriendPlaceGroup {
  locationKey: string;
  venueName: string;
  address: string;
  category: string;
  latitude: number;
  longitude: number;
  friends: FriendActivityProjection[];
}

export function buildExternalFriendPlaceGroups(
  activities: FriendActivityProjection[],
  nowMs = Date.now()
): ExternalFriendPlaceGroup[] {
  const groups = new Map<string, ExternalFriendPlaceGroup>();
  for (const activity of activities) {
    const latitude = Number(activity.latitude);
    const longitude = Number(activity.longitude);
    if (
      activity.locationType !== 'external_place'
      || !activity.venueLocationKey
      || !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || !isFriendActivityActive(activity, nowMs)
    ) continue;
    const existing = groups.get(activity.venueLocationKey);
    if (existing) {
      if (!existing.friends.some((friend) => friend.ownerUid === activity.ownerUid)) {
        existing.friends.push(activity);
      }
      continue;
    }
    groups.set(activity.venueLocationKey, {
      locationKey: activity.venueLocationKey,
      venueName: activity.venueName || 'Nearby place',
      address: activity.placeAddress || '',
      category: activity.placeCategory || 'Public place',
      latitude,
      longitude,
      friends: [activity],
    });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    friends: [...group.friends].sort((a, b) => a.displayName.localeCompare(b.displayName)),
  }));
}

function Avatar({ friend }: { friend: FriendActivityProjection }) {
  const initial = (friend.displayName || 'F').trim().slice(0, 1).toUpperCase();
  if (friend.photoURL) return <Image source={{ uri: friend.photoURL }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarInitial}>{initial}</Text>
    </View>
  );
}

export default function ExternalFriendCheckInMarkers({
  activities,
  hidden,
  onPress,
}: {
  activities: FriendActivityProjection[];
  hidden?: boolean;
  onPress: (group: ExternalFriendPlaceGroup) => void;
}) {
  const groups = useMemo(() => buildExternalFriendPlaceGroups(activities), [activities]);
  if (hidden) return null;

  return (
    <>
      {groups.map((group) => (
        <MapboxGL.MarkerView
          allowOverlap
          allowOverlapWithPuck
          anchor={{ x: 0.5, y: 1 }}
          coordinate={[group.longitude, group.latitude]}
          id={`external-friend-${group.locationKey}`}
          key={group.locationKey}
        >
          <TouchableOpacity
            accessibilityLabel={`${group.friends.length} ${group.friends.length === 1 ? 'friend' : 'friends'} checked in at ${group.venueName}`}
            accessibilityRole="button"
            activeOpacity={0.86}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => undefined);
              onPress(group);
            }}
            style={styles.marker}
          >
            <View style={styles.markerAvatarShell}><Avatar friend={group.friends[0]} /></View>
            {group.friends.length > 1 && (
              <View style={styles.countBadge}><Text style={styles.countText}>{group.friends.length}</Text></View>
            )}
            <View style={styles.liveDot} />
            <View style={styles.markerTip} />
          </TouchableOpacity>
        </MapboxGL.MarkerView>
      ))}
    </>
  );
}

function expiryCopy(group: ExternalFriendPlaceGroup) {
  const expiry = Math.min(...group.friends
    .map((friend) => socialTimestampToMillis(friend.expiresAt) ?? Number.MAX_SAFE_INTEGER));
  if (!Number.isFinite(expiry) || expiry === Number.MAX_SAFE_INTEGER) return 'Checked in now';
  return `Visible until ${new Date(expiry).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function ExternalFriendCheckInPanel({
  group,
  onClose,
}: {
  group: ExternalFriendPlaceGroup | null;
  onClose: () => void;
}) {
  if (!group) return null;
  const openDirections = () => {
    const destination = encodeURIComponent(`${group.latitude},${group.longitude}`);
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.backdrop}>
        <TouchableOpacity activeOpacity={1} onPress={() => undefined} style={styles.panel}>
          <View style={styles.dragHandle} />
          <View style={styles.panelHeader}>
            <View style={styles.placeIcon}><Ionicons name="business-outline" size={22} color="#B54708" /></View>
            <View style={styles.copy}>
              <Text style={styles.panelEyebrow}>FRIENDS HERE NOW</Text>
              <Text numberOfLines={2} style={styles.panelTitle}>{group.venueName}</Text>
              <Text numberOfLines={1} style={styles.panelMeta}>{group.category}</Text>
            </View>
            <TouchableOpacity accessibilityLabel="Close friend check-in" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#344054" />
            </TouchableOpacity>
          </View>
          {!!group.address && (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={18} color="#667085" />
              <Text style={styles.address}>{group.address}</Text>
            </View>
          )}
          <View style={styles.friendsList}>
            {group.friends.map((friend) => (
              <View key={friend.ownerUid} style={styles.friendRow}>
                <Avatar friend={friend} />
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.friendName}>{friend.displayName || 'Friend'}</Text>
                  <Text style={styles.expiry}>{expiryCopy({ ...group, friends: [friend] })}</Text>
                  {!!friend.message && <Text numberOfLines={2} style={styles.message}>“{friend.message}”</Text>}
                </View>
                <View style={styles.hereBadge}><View style={styles.hereDot} /><Text style={styles.hereText}>HERE</Text></View>
              </View>
            ))}
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={openDirections} style={styles.directionsButton}>
            <Ionicons name="navigate" size={19} color="#FFFFFF" />
            <Text style={styles.directionsText}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
            style={styles.attributionRow}
          >
            <Text style={styles.attributionText}>Place data © OpenStreetMap contributors</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  marker: { width: 52, height: 60, alignItems: 'center', justifyContent: 'flex-start' },
  markerAvatarShell: { zIndex: 2, width: 48, height: 48, padding: 3, borderRadius: 24, borderWidth: 3, borderColor: '#7F56D9', backgroundColor: '#FFFFFF', shadowColor: '#101828', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5, elevation: 7 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9D7FE' },
  avatarInitial: { color: '#6941C6', fontSize: 16, fontWeight: '900' },
  countBadge: { position: 'absolute', right: -3, top: -3, zIndex: 5, minWidth: 21, height: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 11, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#6941C6' },
  countText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  liveDot: { position: 'absolute', left: 1, top: 3, zIndex: 5, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#12B76A' },
  markerTip: { marginTop: -2, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 11, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#7F56D9' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.45)' },
  panel: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 25, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF' },
  dragHandle: { alignSelf: 'center', width: 42, height: 5, marginBottom: 14, borderRadius: 3, backgroundColor: '#D0D5DD' },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  placeIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFFAEB' },
  copy: { flex: 1, minWidth: 0 },
  panelEyebrow: { color: '#6941C6', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8 },
  panelTitle: { marginTop: 2, color: '#101828', fontSize: 21, lineHeight: 25, fontWeight: '900' },
  panelMeta: { marginTop: 1, color: '#B54708', fontSize: 11.5, fontWeight: '700' },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#F2F4F7' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 14, padding: 11, borderRadius: 14, backgroundColor: '#F9FAFB' },
  address: { flex: 1, color: '#475467', fontSize: 12.5, lineHeight: 18 },
  friendsList: { marginTop: 12, gap: 8 },
  friendRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 17, borderWidth: 1, borderColor: '#EAECF0', backgroundColor: '#FFFFFF' },
  friendName: { color: '#101828', fontSize: 14.5, fontWeight: '900' },
  expiry: { marginTop: 1, color: '#667085', fontSize: 10.5, fontWeight: '600' },
  message: { marginTop: 3, color: '#475467', fontSize: 11.5, lineHeight: 16 },
  hereBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 10, backgroundColor: '#ECFDF3' },
  hereDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#12B76A' },
  hereText: { color: '#067647', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.5 },
  directionsButton: { minHeight: 50, marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: '#6941C6' },
  directionsText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  attributionRow: { alignSelf: 'center', marginTop: 10, paddingHorizontal: 8, paddingVertical: 3 },
  attributionText: { color: '#667085', fontSize: 10.5, textDecorationLine: 'underline' },
});
