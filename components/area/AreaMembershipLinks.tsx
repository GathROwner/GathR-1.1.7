import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Event, Venue } from '../../types/events';
import type { AreaMembership } from '../../utils/areaMembership';
import { getMembershipVenueId } from '../../utils/areaMembership';
import { toFirestoreEventId } from '../../utils/firestoreEventIds';
import { useAreaMembershipIndex } from '../../hooks/useAreaMembershipIndex';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';
import { useMapStore } from '../../store/mapStore';
import { EventTimingSummaryText } from '../common/EventTimingSummaryText';
import { useAreaMembershipNavigation } from './AreaMembershipNavigation';

export function AreaParentLink({ membership, onPress }: { membership: AreaMembership; onPress: () => void }) {
  const hunt = membership.kind === 'hunt';
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${membership.parent.title}`}
    onPress={event => { event.stopPropagation(); onPress(); }} style={({ pressed }) => [styles.row, hunt && styles.panel, pressed && { opacity: 0.75 }]}>
    <View style={styles.icon}><MaterialIcons name="map" size={20} color="#493B15" /></View>
    <View style={styles.copy}><Text style={styles.label}>{hunt ? 'PARTICIPATING IN' : 'PART OF'}</Text>
      <Text style={[styles.title, hunt && styles.huntTitle]}>{membership.parent.title}</Text>
      {hunt && <><EventTimingSummaryText event={membership.parent} style={styles.dates} containerStyle={{ flex: 0 }} numberOfLines={2} showInfoMarker={false} />
        <Text style={styles.action}>View hunt details →</Text></>}
    </View><MaterialIcons name="chevron-right" size={24} color="#8B712F" />
  </Pressable>;
}
export function AreaEventMembershipLinks({ event }: { event: Event }) {
  const index = useAreaMembershipIndex(), open = useAreaMembershipNavigation();
  const minute = useEventTimingMinute();
  if (!open) return null;
  return <>{index.forEvent(event, new Date(minute * 60000)).map(membership =>
    <AreaParentLink key={toFirestoreEventId(membership.parent.id)} membership={membership} onPress={() => open(membership)} />)}</>;
}
export function VenueHuntMembershipLinks({ venue, filterType }: { venue: Venue; filterType: 'event' | 'special' }) {
  const index = useAreaMembershipIndex(), open = useAreaMembershipNavigation();
  const criteria = useMapStore(state => state.filterCriteria);
  const minute = useEventTimingMinute();
  if (!open) return null;
  const memberships = index.forVenue(getMembershipVenueId(venue), filterType === 'special' ? criteria.specialFilters : criteria.eventFilters, new Date(minute * 60000));
  if (!memberships.length) return null;
  return <View style={styles.venuePanels} testID="venue-hunt-memberships">{memberships.map(membership =>
    <AreaParentLink key={toFirestoreEventId(membership.parent.id)} membership={membership} onPress={() => open(membership, filterType)} />)}</View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#FFF8E6', borderWidth: 1,
    borderColor: '#EEDBA1', borderRadius: 10, padding: 10, marginTop: 10 },
  panel: { alignItems: 'center', padding: 12, marginTop: 0 }, venuePanels: { marginHorizontal: 7, marginVertical: 6, gap: 7 },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5CB58' },
  copy: { flex: 1, gap: 4 }, label: { fontSize: 10, letterSpacing: 0.7, fontWeight: '700', color: '#886A24' },
  title: { fontSize: 14, lineHeight: 19, fontWeight: '700', color: '#3A3423' }, huntTitle: { fontSize: 16, lineHeight: 21 },
  dates: { fontSize: 11, lineHeight: 16, color: '#786C50' }, action: { fontSize: 12, fontWeight: '700', color: '#86600D', marginTop: 3 },
});
