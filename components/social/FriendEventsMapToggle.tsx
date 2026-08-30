import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useMapStore } from '../../store/mapStore';
import { useSocialStore } from '../../store/socialStore';
import { SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';

export default function FriendEventsMapToggle({ hidden = false }: { hidden?: boolean }) {
  const visible = useMapStore((state) => state.showFriendEvents);
  const setVisible = useMapStore((state) => state.setShowFriendEvents);
  const eventCount = useSocialStore((state) => state.friendEvents.length);

  if (!SOCIAL_RELEASE_TWO_ENABLED || hidden || eventCount === 0) return null;

  return (
    <TouchableOpacity
      accessibilityLabel={`${visible ? 'Hide' : 'Show'} ${eventCount} friend ${eventCount === 1 ? 'event' : 'events'} on the map`}
      accessibilityRole="switch"
      accessibilityState={{ checked: visible }}
      activeOpacity={0.85}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        setVisible(!visible);
      }}
      style={[styles.pill, visible ? styles.active : styles.inactive]}
    >
      <Ionicons name={visible ? 'people' : 'people-outline'} size={18} color={visible ? '#FFFFFF' : '#6941C6'} />
      <Text style={[styles.label, visible ? styles.activeLabel : styles.inactiveLabel]}>Friends</Text>
      <Text style={[styles.count, visible ? styles.activeCount : styles.inactiveCount]}>{eventCount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    right: 12,
    bottom: 168,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  active: { backgroundColor: '#6941C6', borderColor: '#6941C6' },
  inactive: { backgroundColor: '#FFFFFF', borderColor: '#D6BBFB' },
  label: { fontSize: 13, fontWeight: '800' },
  activeLabel: { color: '#FFFFFF' },
  inactiveLabel: { color: '#53389E' },
  count: { minWidth: 18, textAlign: 'center', fontSize: 11, fontWeight: '900' },
  activeCount: { color: '#E9D7FE' },
  inactiveCount: { color: '#7F56D9' },
});
