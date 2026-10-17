import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Event } from '../../types/events';
import { fetchFirestoreEventStatus } from '../../lib/api/firestoreEvents';
import { useAreaActivities, type AreaActivityLoader } from '../../hooks/useAreaActivities';
import { areEventIdsEquivalent } from '../../utils/firestoreEventIds';
import { getAreaLinkedEventIds, type AreaLocationGroup } from '../../utils/areaEvent';
import { cleanAreaPresentationText, getAreaEventPresentation, getAreaParticipationInstructions } from '../../utils/areaEventPresentation';
import { formatEventTimingSummary } from '../../utils/dateUtils';
import { formatLightboxAddress } from '../../utils/lightboxAddress';
import { getLightboxImageUrl } from '../../utils/lightboxImageUrl';
import { useMapStore } from '../../store/mapStore';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';
import FallbackImage from '../common/FallbackImage';
import EventImageLightbox from './EventImageLightbox';

type Props = { umbrella: Event; group: AreaLocationGroup; onClose: () => void;
  venueProgramme?: boolean; loadEvent?: (id: string | number) => Promise<Event | null>; loadActivity?: AreaActivityLoader };

/** Owns a small return stack: shared pin -> venue -> exact linked activity -> venue. */
export default function AreaLocationBrowser({ umbrella, group, onClose, loadEvent, loadActivity, venueProgramme = false }: Props) {
  const insets = useSafeAreaInsets();
  const [locationId, setLocationId] = useState<string | null>(group.locations.length === 1 ? group.locations[0].id : null);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [notice, setNotice] = useState('');
  useEventTimingMinute();
  const location = group.locations.find((candidate) => candidate.id === locationId);
  const presentation = getAreaEventPresentation(umbrella);
  const programme = venueProgramme || presentation === 'programme';
  const hunt = presentation === 'hunt';
  const loader = useMemo<AreaActivityLoader>(() => loadActivity || (loadEvent ? async id => {
    const event = await loadEvent(id);
    // Legacy/custom null is ambiguous, so retain known cards and offer retry.
    if (!event) throw new Error('Activity could not be confirmed');
    return { status: 'found', event };
  } : fetchFirestoreEventStatus), [loadActivity, loadEvent]);
  const { activities, unresolved, isFetching, hasError, refresh, currentActivities } = useAreaActivities(umbrella, location, loader);
  const ids = useMemo(() => location ? getAreaLinkedEventIds(location) : [], [location]);
  const selectedIndex = activities.findIndex((event) => areEventIdsEquivalent(event.id, selectedId));
  const selected = selectedIndex < 0 ? null : activities[selectedIndex];

  const adoptActivity = (valid: Event) => {
    useMapStore.setState((state) => ({
      events: state.events.map((candidate) => areEventIdsEquivalent(candidate.id, valid.id) ? valid : candidate),
      allEvents: state.allEvents.map((candidate) => areEventIdsEquivalent(candidate.id, valid.id) ? valid : candidate),
    }));
    setSelectedId(valid.id);
  };

  const openActivity = (event: Event) => {
    const valid = currentActivities().find(candidate => areEventIdsEquivalent(candidate.id, event.id));
    if (!valid) { setSelectedId(null); setNotice('This activity is no longer available here. Refresh the programme.'); return; }
    setNotice('');
    adoptActivity(valid);
  };
  const closeActivity = () => setSelectedId(null);
  const chooseLocation = (id: string | null) => {
    setNotice(''); setSelectedId(null); setLocationId(id);
  };
  useEffect(() => { if (selectedId !== null && !selected) setSelectedId(null); }, [selectedId, selected]);
  return <Modal transparent visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close event locations" onPress={onClose} />
      <View style={[styles.sheet, { marginTop: insets.top + 24, paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          {location && group.locations.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Back to venues at this location"
            onPress={() => chooseLocation(null)} style={styles.iconButton}><MaterialIcons name="arrow-back" size={23} color="#FFFFFF" /></Pressable>}
          <View style={styles.heading}><Text style={styles.festival} numberOfLines={1}>{umbrella.title}</Text>
            <Text style={styles.title}>{location?.label || `${group.locations.length} venues at this location`}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close event locations" onPress={onClose} style={styles.iconButton}>
            <MaterialIcons name="close" size={23} color="#FFFFFF" /></Pressable>
        </View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {!location ? <>
            <Text style={styles.intro}>{programme ? 'These venues share the same map location. Choose a venue to see its festival programme.'
              : hunt ? 'These participating venues share the same location. Choose one to see how to take part.'
                : 'These venues share the same location. Choose one to see its details.'}</Text>
            {group.locations.map((candidate) => <Pressable key={candidate.id} accessibilityRole="button"
              accessibilityLabel={`${programme ? 'View festival activities at' : 'View location details at'} ${candidate.label}`} onPress={() => chooseLocation(candidate.id)}
              style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}>
              <View style={styles.pin}><MaterialIcons name="place" size={24} color="#F6C84C" /></View>
              <View style={styles.rowText}><Text style={styles.rowTitle}>{candidate.label}</Text>
                {!!candidate.address && <Text style={styles.secondary}>{formatLightboxAddress(candidate.address)}</Text>}
                <Text style={styles.linkHint}>{getAreaLinkedEventIds(candidate).length ? 'View festival activities' : hunt ? 'See how to take part' : 'View location details'}</Text></View>
              <MaterialIcons name="chevron-right" size={24} color="#B9C7D6" />
            </Pressable>)}
          </> : <>
            {!!location.address && <View style={styles.contextRow}><MaterialIcons name="place" size={18} color="#F6C84C" />
              <Text style={styles.secondary}>{formatLightboxAddress(location.address)}</Text></View>}
            <Text style={styles.certainty}>{venueProgramme ? 'Programme at this venue' : hunt ? (location.certainty === 'confirmed' ? 'Participating hunt location' : 'Possible hunt location')
              : programme ? (location.certainty === 'confirmed' ? 'Confirmed festival location' : 'Possible festival location')
                : (location.certainty === 'confirmed' ? 'Confirmed event location' : 'Possible event location')}</Text>
            {programme ? <>
            {!!location.description && <Text style={styles.intro}>{location.description}</Text>}
            {!!location.timeLabel && <Text style={styles.secondary}>{location.timeLabel}</Text>}
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Festival activities</Text>
              <Text testID="festival-activity-count" style={styles.count}>{unresolved ? (activities.length ? activities.length + '+' : '…') : activities.length}</Text></View>
            <Text style={styles.secondary}>Upcoming activities from this festival’s linked programme.</Text>
            {isFetching && unresolved && activities.length === 0 && !!ids.length && <View style={styles.loading}><ActivityIndicator color="#F6C84C" /><Text style={styles.secondary}>Loading activities…</Text></View>}
            {!!(notice || hasError) && <Text accessibilityRole="alert" style={styles.notice}>{notice || (activities.length ? 'Some activities could not be refreshed. Available cards are still ready to open; try refreshing again.' : 'Activities could not be loaded. Check your connection and refresh the programme.')}</Text>}
            {!unresolved && activities.length === 0 && <View style={styles.empty}>
              <MaterialIcons name="event-note" size={32} color="#F6C84C" />
              <Text style={styles.emptyTitle}>No linked activities available</Text>
              <Text style={styles.secondary}>{ids.length ? 'Activities may have ended or become unavailable. Check the festival programme for the latest details.'
                : 'This is a festival location, but no upcoming activities have been linked here yet.'}</Text>
            </View>}
            {activities.map((event) => <Pressable key={event.id} accessibilityRole="button"
              accessibilityLabel={`Open ${event.title}, ${formatEventTimingSummary(event)}, ${event.venue}`}
              onPress={() => openActivity(event)} style={({ pressed }) => [styles.activity, pressed && styles.pressed]}>
              <FallbackImage imageUrl={getLightboxImageUrl(event)} category={event.category} type={event.type} item={event}
                fallbackType="post" resizeMode="cover" style={styles.poster} />
              <View style={styles.rowText}><Text style={styles.activityTime}>{formatEventTimingSummary(event)}</Text>
                <Text style={styles.rowTitle} numberOfLines={3}>{event.title}</Text>
                <Text style={styles.secondary} numberOfLines={1}>{event.venue}</Text></View>
              <MaterialIcons name="chevron-right" size={22} color="#B9C7D6" />
            </Pressable>)}
            {!!ids.length && <Pressable accessibilityRole="button" disabled={isFetching} accessibilityLabel="Refresh festival programme" onPress={() => void refresh()} style={styles.refresh}>
              <MaterialIcons name="refresh" size={18} color="#8BC5FF" /><Text style={styles.linkHint}>{isFetching ? 'Refreshing programme…' : 'Refresh programme'}</Text></Pressable>}
            </> : <View style={styles.participation} testID="area-location-instructions">
              <View style={styles.contextRow}><MaterialIcons name={hunt ? 'photo-camera' : 'info-outline'} size={23} color="#F6C84C" />
                <Text style={styles.sectionTitle}>{hunt ? 'Take part here' : 'About this location'}</Text></View>
              {(hunt ? getAreaParticipationInstructions(umbrella, location)
                : [cleanAreaPresentationText(location.description || umbrella.description || umbrella.areaData?.description)
                  || 'This is one of the event’s listed locations. Check the source for visit details.'])
                .map((instruction, index) => <Text key={index} style={styles.intro}>{instruction}</Text>)}
              {!!location.timeLabel && <Text style={styles.secondary}>{cleanAreaPresentationText(location.timeLabel)}</Text>}
              {hunt && <View style={styles.accessAdvice}><MaterialIcons name="schedule" size={18} color="#AEBCCA" />
                <Text style={styles.secondary}>Check location opening hours before visiting.</Text></View>}
            </View>}
            {!!(location.sourceLabel || umbrella.areaData?.sourceLabel) && <Text style={styles.source}>Source: {cleanAreaPresentationText(location.sourceLabel || umbrella.areaData?.sourceLabel)}</Text>}
          </>}
        </ScrollView>
      </View>
    </View>
    {selected && <Modal transparent visible animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={closeActivity}>
      <EventImageLightbox imageUrl={getLightboxImageUrl(selected)} event={selected} events={activities} currentIndex={selectedIndex}
        calloutPaging onNavigate={(index) => { if (activities[index]) openActivity(activities[index]); }} onClose={closeActivity} />
    </Modal>}
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
  sheet: { flex: 1, maxHeight: '82%', backgroundColor: '#111A25', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: '#334353', overflow: 'hidden' },
  grabber: { height: 4, width: 42, borderRadius: 2, backgroundColor: '#667482', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#293746' },
  heading: { flex: 1 }, festival: { fontSize: 12, fontWeight: '700', color: '#F6C84C', marginBottom: 5 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700', color: '#FFFFFF' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 }, bodyContent: { padding: 18, gap: 12 },
  intro: { color: '#D6DFE9', fontSize: 15, lineHeight: 22 }, secondary: { color: '#AEBCCA', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, certainty: { fontSize: 12, fontWeight: '600', color: '#F6C84C' },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1C2937', borderRadius: 16, padding: 14, minHeight: 90 },
  pin: { width: 36, alignItems: 'center' }, rowText: { flex: 1, gap: 5 }, rowTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, lineHeight: 22 },
  linkHint: { color: '#8BC5FF', fontSize: 13, fontWeight: '600' }, pressed: { opacity: 0.75 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 }, sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  count: { color: '#F6C84C', fontWeight: '700', fontSize: 13, backgroundColor: '#313023', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: '#1C2937', minHeight: 110 },
  poster: { width: 68, height: 86, borderRadius: 9 }, activityTime: { color: '#F6C84C', fontSize: 12, fontWeight: '600', lineHeight: 17 },
  loading: { flexDirection: 'row', gap: 10, paddingVertical: 12, alignItems: 'center' }, notice: { color: '#FFE4A2', fontSize: 13, lineHeight: 20 },
  empty: { borderRadius: 16, padding: 22, gap: 12, backgroundColor: '#1C2937' }, emptyTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  participation: { borderRadius: 16, padding: 18, gap: 14, backgroundColor: '#1C2937', marginTop: 4 },
  accessAdvice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#405063', paddingTop: 12 },
  refresh: { alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  source: { color: '#8D9EAE', fontSize: 11, lineHeight: 16, marginTop: 8 },
});
