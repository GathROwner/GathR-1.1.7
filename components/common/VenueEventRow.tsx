import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Event } from '../../types/events';
import type { VenueFeedGroup } from '../../utils/venueFeedGroups';
import { createLocationKeyFromEvent } from '../../utils/priorityUtils';
import { TimeFilterType } from '../../types/filter';
import FallbackImage from './FallbackImage';
import { VenueFavoriteButton } from './VenueFavoriteButton';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import VenueEventCount from './VenueEventCount';

export const VENUE_FEED_HERO_HEIGHT = 300;

type Props = {
  group: VenueFeedGroup;
  timeFilter: TimeFilterType;
  selectedEventId?: string;
  countCueActive?: boolean;
  onSelectEvent: (event: Event) => void;
  renderEvent: (event: Event, grouped: boolean) => React.ReactNode;
};

/** Native paging exposes the real adjacent card while dragging; one shared venue header stays still. */
export default function VenueEventRow({ group, timeFilter, selectedEventId, countCueActive = false, onSelectEvent, renderEvent }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  // Mount content immediately; the viewport measurement refines this estimate for safe areas/resizing.
  const [width, setWidth] = useState(() => Math.max(1, windowWidth - 2));
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [addressExpanded, setAddressExpanded] = useState(false);
  const pager = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();
  const index = Math.max(0, group.events.findIndex(event => String(event.id) === selectedEventId));
  const active = group.events[index];
  const signature = group.events.map(event => String(event.id)).join('|');
  useEffect(() => {
    if (width > 0) pager.current?.scrollTo({ x: index * width, animated: false });
  }, [index, width, signature]);

  if (group.events.length === 1) return <>{renderEvent(active, false)}</>;
  const noun = active.type === 'special' ? 'specials' : 'events';
  const period = timeFilter === TimeFilterType.TODAY ? ' today' :
    timeFilter === TimeFilterType.TOMORROW ? ' tomorrow' :
    timeFilter === TimeFilterType.NOW ? ' now' : timeFilter === TimeFilterType.UPCOMING ? ' upcoming' : '';
  const dotStart = Math.max(0, Math.min(index - 2, group.events.length - 5));
  const pageHeight = heights[String(active.id)];
  const settlePage = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const next = Math.max(0, Math.min(group.events.length - 1, Math.round(nativeEvent.contentOffset.x / width)));
    if (next !== index) onSelectEvent(group.events[next]);
  };
  const goTo = (next: number) => {
    if (next < 0 || next >= group.events.length) return;
    if (reduceMotion) onSelectEvent(group.events[next]);
    else pager.current?.scrollTo({ x: next * width, animated: true });
  };
  return (
    <View style={styles.group} testID="venue-event-row">
      <TouchableOpacity style={styles.header} activeOpacity={0.75} disabled={!active.address?.trim()} accessible={false}
        onPress={event => { event.stopPropagation(); setAddressExpanded(value => !value); }}
        accessibilityRole="button"
        accessibilityLabel={`${addressExpanded ? 'Hide' : 'Show'} venue address for ${active.venue}`}
        accessibilityState={{ expanded: addressExpanded, disabled: !active.address?.trim() }}>
        <View style={styles.avatarWrap}>
          <FallbackImage imageUrl={active.profileUrl} category={active.category} type={active.type}
            style={styles.avatar} fallbackType="profile" item={active} resizeMode="cover" />
          <View style={styles.favorite}><VenueFavoriteButton locationKey={createLocationKeyFromEvent(active)}
            venueName={active.venue} size={12} source={active.type === 'special' ? 'specials_tab' : 'events_tab'} /></View>
        </View>
        <View style={styles.identity} accessible accessibilityRole="button"
          accessibilityLabel={`${addressExpanded ? 'Hide' : 'Show'} venue address for ${active.venue}`}
          accessibilityState={{ expanded: addressExpanded, disabled: !active.address?.trim() }}
          accessibilityActions={active.address?.trim() ? [{ name: 'activate' }] : []}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'activate' && active.address?.trim()) setAddressExpanded(value => !value);
          }}
          onAccessibilityTap={() => { if (active.address?.trim()) setAddressExpanded(value => !value); }}>
          <Text style={styles.name} numberOfLines={2}>{active.venue}</Text>
          <VenueEventCount active={countCueActive}>{`${group.events.length} ${noun}${period}`}</VenueEventCount>
        </View>
        <View style={styles.pagination} accessibilityLabel={`${noun}, ${index + 1} of ${group.events.length}`}>
          <Text style={styles.counter}>{index + 1} of {group.events.length}</Text>
          <View style={styles.dots}>{group.events.slice(dotStart, dotStart + 5).map((event, offset) => (
            <TouchableOpacity key={String(event.id)} onPress={event => { event.stopPropagation(); goTo(dotStart + offset); }}
              accessibilityRole="button" accessibilityLabel={`Show ${event.title}`}
              accessibilityState={{ selected: dotStart + offset === index }} style={styles.dotTarget}>
              <View style={[styles.dot, dotStart + offset === index && styles.activeDot]} />
            </TouchableOpacity>
          ))}</View>
        </View>
        {!!active.address?.trim() && <View style={styles.chevron} pointerEvents="none"
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <MaterialIcons name={addressExpanded ? 'expand-less' : 'expand-more'} size={22} color="#626973" />
        </View>}
      </TouchableOpacity>
      {addressExpanded && <View style={styles.address}><MaterialIcons name="place" size={15} color="#626973" />
        <Text style={styles.addressText}>{active.address}</Text></View>}
      <View testID="venue-event-viewport" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.viewport}>
        {width > 0 && <ScrollView testID="venue-event-pager" ref={pager} horizontal pagingEnabled directionalLockEnabled nestedScrollEnabled
          disableIntervalMomentum bounces={false} overScrollMode="never" showsHorizontalScrollIndicator={false}
          style={pageHeight ? { height: pageHeight } : undefined} contentContainerStyle={styles.pages}
          onMomentumScrollEnd={settlePage} onScrollEndDrag={event => {
            const x = event.nativeEvent.contentOffset.x;
            if (Math.abs(x - Math.round(x / width) * width) < 1) settlePage(event);
          }}>
          {group.events.map((event, page) => <View key={String(event.id)} style={{ width }}>
            {Math.abs(page - index) <= 1 ? <View onLayout={layout => {
              const height = Math.ceil(layout.nativeEvent.layout.height);
              setHeights(previous => previous[String(event.id)] === height ? previous : { ...previous, [String(event.id)]: height });
            }}>{renderEvent(event, true)}</View> : <View style={{ height: pageHeight || 520 }} />}
          </View>)}
        </ScrollView>}
        <View style={styles.heroNavigation} pointerEvents="box-none">
          {index > 0 && <TouchableOpacity testID="venue-event-previous" style={[styles.heroArrow, styles.heroPrevious]}
            onPress={() => goTo(index - 1)} activeOpacity={0.8} accessibilityRole="button"
            accessibilityLabel={`Show previous ${active.type === 'special' ? 'special' : 'event'} at this venue`}>
            <MaterialIcons name="chevron-left" size={30} color="#FFFFFF" />
          </TouchableOpacity>}
          {index < group.events.length - 1 && <TouchableOpacity testID="venue-event-next" style={[styles.heroArrow, styles.heroNext]}
            onPress={() => goTo(index + 1)} activeOpacity={0.8} accessibilityRole="button"
            accessibilityLabel={`Show next ${active.type === 'special' ? 'special' : 'event'} at this venue`}>
            <MaterialIcons name="chevron-right" size={30} color="#FFFFFF" />
          </TouchableOpacity>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: 0, marginBottom: 10, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#DDE1E7', overflow: 'hidden' },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, gap: 10 },
  avatarWrap: { width: 42, height: 42 }, avatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#E1E4E8' },
  favorite: { position: 'absolute', right: -4, bottom: -4, backgroundColor: '#FFF', borderRadius: 12 },
  identity: { flex: 1, minWidth: 0 }, name: { fontSize: 15, fontWeight: '700', color: '#171A20' },
  pagination: { alignItems: 'center' },
  counter: { fontSize: 11, color: '#626973', fontVariant: ['tabular-nums'] }, dots: { flexDirection: 'row' },
  dotTarget: { width: 18, height: 20, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CED3D9' }, activeDot: { backgroundColor: '#1E90FF' },
  chevron: { minHeight: 36, width: 24, justifyContent: 'center', alignItems: 'center' },
  address: { flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingBottom: 10 }, addressText: { flex: 1, fontSize: 12, color: '#626973' },
  viewport: { overflow: 'hidden' }, pages: { alignItems: 'flex-start' },
  heroNavigation: { position: 'absolute', top: 0, left: 0, right: 0, height: VENUE_FEED_HERO_HEIGHT },
  heroArrow: { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' },
  heroPrevious: { left: 10 }, heroNext: { right: 10 },
});
