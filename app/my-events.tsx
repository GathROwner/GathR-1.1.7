import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSocialStore } from '../store/socialStore';
import type { FriendEventProjection } from '../types/social';
import { formatFriendEventDate, isFriendEventCurrent, socialTimeToMillis } from '../utils/friendEvents';

type Filter = 'upcoming' | 'hosting' | 'invited';
const PURPLE = '#6941C6';

function EventCard({ event, onPress }: { event: FriendEventProjection; onPress: () => void }) {
  const canceled = event.status === 'canceled';
  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={[styles.eventCard, canceled && styles.canceledCard]}>
      <View style={styles.dateBadge}>
        <Text style={styles.dateMonth}>{new Date(socialTimeToMillis(event.startAt) || 0).toLocaleString(undefined, { month: 'short' }).toUpperCase()}</Text>
        <Text style={styles.dateDay}>{new Date(socialTimeToMillis(event.startAt) || 0).getDate()}</Text>
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTopline}>
          <Text numberOfLines={1} style={styles.eventTitle}>{event.title}</Text>
          {event.viewerRole === 'host' && <View style={styles.hostPill}><Text style={styles.hostPillText}>HOST</Text></View>}
        </View>
        <Text numberOfLines={1} style={styles.eventMeta}>{formatFriendEventDate(event.startAt)} · {event.category}</Text>
        <View style={styles.locationRow}>
          <Ionicons name={event.locationType === 'online' ? 'videocam-outline' : 'location-outline'} size={14} color="#667085" />
          <Text numberOfLines={1} style={styles.locationText}>{event.addressRevealed ? event.locationLabel : 'Address shared later'}</Text>
        </View>
        <Text style={[styles.rsvp, canceled && styles.canceledText]}>{canceled ? 'Canceled' : event.viewerRole === 'host' ? `${event.viewerCount} invited` : event.ownRsvp === 'invited' ? 'Respond to invitation' : event.ownRsvp.replace('_', ' ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#98A2B3" />
    </TouchableOpacity>
  );
}

export default function MyEventsScreen() {
  const router = useRouter();
  const friendEvents = useSocialStore((state) => state.friendEvents);
  const fromCache = useSocialStore((state) => state.fromCache);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const invitationCount = useMemo(() => friendEvents.filter((event) =>
    event.viewerRole === 'guest' && event.status === 'published' && event.ownRsvp === 'invited'
  ).length, [friendEvents]);
  const filtered = useMemo(() => friendEvents
    .filter((event) => {
      if (filter === 'hosting') return event.viewerRole === 'host';
      if (filter === 'invited') return event.viewerRole === 'guest';
      return isFriendEventCurrent(event);
    })
    .sort((first, second) => (socialTimeToMillis(first.startAt) || 0) - (socialTimeToMillis(second.startAt) || 0)), [filter, friendEvents]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back"><Ionicons name="arrow-back" size={23} color="#101828" /></TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.title}>My Events</Text><Text style={styles.subtitle}>Private plans with friends</Text></View>
        <TouchableOpacity onPress={() => router.push('/create-event')} style={styles.createButton} accessibilityLabel="Create event"><Ionicons name="add" size={23} color="#FFFFFF" /></TouchableOpacity>
      </View>
      <View style={styles.filters}>
        {(['upcoming', 'hosting', 'invited'] as Filter[]).map((value) => (
          <TouchableOpacity key={value} onPress={() => setFilter(value)} style={[styles.filter, filter === value && styles.filterActive]}>
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {value.charAt(0).toUpperCase() + value.slice(1)}{value === 'invited' && invitationCount > 0 ? ` ${invitationCount}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {fromCache && <Text style={styles.offline}>Private events will appear after GathR reconnects and confirms access.</Text>}
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {filtered.map((event) => (
          <EventCard key={event.eventId} event={event} onPress={() => router.push({ pathname: '/friend-event/[id]', params: { id: event.eventId } })} />
        ))}
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="calendar-outline" size={34} color={PURPLE} /></View>
            <Text style={styles.emptyTitle}>{filter === 'hosting' ? 'Nothing hosted yet' : filter === 'invited' ? 'No invitations yet' : 'No upcoming friend events'}</Text>
            <Text style={styles.emptyCopy}>Create a private event at a venue, online, or at any custom address.</Text>
            <TouchableOpacity onPress={() => router.push('/create-event')} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Create an event</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8FB' },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, backgroundColor: '#FFFFFF' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { color: '#101828', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#667085', fontSize: 11 },
  createButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: PURPLE },
  filters: { flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#FFFFFF', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EAECF0' },
  filter: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F2F4F7' },
  filterActive: { backgroundColor: '#F4EBFF' },
  filterText: { color: '#667085', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#53389E' },
  offline: { margin: 10, padding: 8, borderRadius: 10, color: '#7A5D00', backgroundColor: '#FFF4CC', fontSize: 11, textAlign: 'center' },
  list: { padding: 12, gap: 9, flexGrow: 1 },
  eventCard: { minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 17, backgroundColor: '#FFFFFF', shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 9, elevation: 2 },
  canceledCard: { opacity: 0.68 },
  dateBadge: { width: 48, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#F4EBFF' },
  dateMonth: { color: PURPLE, fontSize: 10, fontWeight: '900' },
  dateDay: { color: '#344054', fontSize: 21, fontWeight: '900' },
  cardCopy: { flex: 1, minWidth: 0, gap: 3 },
  cardTopline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventTitle: { flex: 1, color: '#101828', fontSize: 15, fontWeight: '900' },
  hostPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 99, backgroundColor: '#EAF2FF' },
  hostPillText: { color: '#175CD3', fontSize: 8, fontWeight: '900' },
  eventMeta: { color: '#667085', fontSize: 11 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText: { flex: 1, color: '#667085', fontSize: 11 },
  rsvp: { color: PURPLE, fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  canceledText: { color: '#B42318' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 30 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4EBFF' },
  emptyTitle: { color: '#101828', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  emptyCopy: { color: '#667085', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  emptyButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: 12, backgroundColor: PURPLE },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '900' },
});
