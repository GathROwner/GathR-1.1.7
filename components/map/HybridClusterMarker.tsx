import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Svg, { Circle, Line } from 'react-native-svg';
import type { Cluster } from '../../types/events';
import { getHasNewContent, useClusterInteractionStore } from '../../store/clusterInteractionStore';
import { buildHybridVenues, HYBRID_ACCENTS, visibleHybridCategories } from '../../utils/hybridClusterPresentation';

type Props = {
  cluster: Cluster; isActive: boolean; isSelected: boolean; isReady: boolean; isProcessing: boolean;
  reduceMotionEnabled: boolean;
  categoryIcon: (category: string) => string;
  snapshotMode?: boolean;
  onSnapshotChange?: () => void;
  onPhotoLayout?: (layout: { y: number; height: number }) => void;
};
const p = (value: number) => value * .9;

function Segments({ diameter, count, active = -1, staticRing = false }: { diameter: number; count: number; active?: number; staticRing?: boolean }) {
  // Fill the old empty gutter inward; the arc now meets the photo's thin border.
  const stroke = staticRing ? p(1.25) : p(8), radius = diameter / 2 - stroke / 2, circumference = 2 * Math.PI * radius;
  // Individual arcs cease to be useful in large clusters; the numeric total remains explicit.
  const segments = count > 12 ? 1 : Math.max(1, count), step = circumference / segments, gap = segments === 1 ? 0 : p(staticRing ? 1.5 : 3.2);
  return <Svg width={diameter} height={diameter} style={StyleSheet.absoluteFill} pointerEvents="none">
    {Array.from({ length: segments }, (_, index) => <Circle key={index} cx={diameter / 2} cy={diameter / 2} r={radius} fill="none"
      stroke={staticRing ? '#8DA8B8' : (segments === 1 || index === active) ? HYBRID_ACCENTS[active % HYBRID_ACCENTS.length] : '#CFDBE3'}
      strokeWidth={stroke} strokeDasharray={`${Math.max(0, step - gap)} ${circumference - step + gap}`}
      strokeDashoffset={-index * step - gap / 2} rotation={-90} origin={`${diameter / 2}, ${diameter / 2}`} />)}
  </Svg>;
}

function FriendBadge({ count }: { count: number }) {
  return <View style={s.friendBadge}><MaterialIcons name="people" size={p(10)} color="#FFF" /><Text maxFontSizeMultiplier={1.2} style={s.friendCount}>{count > 9 ? '9+' : count}</Text></View>;
}

/** Presentation only. Cluster activation belongs to the native map annotation. */
export default function HybridClusterMarker({ cluster, isActive, isSelected, isReady, isProcessing, reduceMotionEnabled, categoryIcon, snapshotMode = false, onSnapshotChange, onPhotoLayout }: Props) {
  const interactions = useClusterInteractionStore(state => state.interactions);
  const venues = useMemo(() => buildHybridVenues(cluster, (key, ids) => interactions.has(key) && getHasNewContent(key, ids)), [cluster, interactions]);
  const venueKey = venues.map(v => v.key).join('|');
  const [activeKey, setActiveKey] = useState('');
  const index = Math.max(0, venues.findIndex(v => v.key === activeKey));
  const current = venues[index];
  const [failedPhoto, setFailedPhoto] = useState('');
  const pulse = useRef(new Animated.Value(0)).current;
  const photoSize = p(({ low: 36, medium: 40, high: 44 }[cluster.interestLevel] || 36) * (isSelected ? 1.2 : 1));
  const ringSize = photoSize + p(16), center = ringSize / 2, radius = center - p(.5);
  const accent = HYBRID_ACCENTS[index % HYBRID_ACCENTS.length];
  const timing = cluster.timeStatus === 'now' ? '#34A853' : cluster.timeStatus === 'today' ? '#FBBC05' : '#9AA0A6';

  useEffect(() => {
    if (!isActive || reduceMotionEnabled || venues.length < 2 || isSelected) return;
    const timer = setInterval(() => setActiveKey(key => { const at = Math.max(0, venues.findIndex(v => v.key === key)); return venues[(at + 1) % venues.length].key; }), 3000);
    return () => clearInterval(timer);
  }, [venueKey, venues, isActive, isSelected, reduceMotionEnabled]);
  useEffect(() => {
    pulse.stopAnimation(); pulse.setValue(0);
    if (snapshotMode || !isActive || reduceMotionEnabled || cluster.timeStatus === 'future') return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }),
      Animated.delay(1000), Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [pulse, isActive, reduceMotionEnabled, cluster.timeStatus, snapshotMode]);
  useLayoutEffect(() => { onSnapshotChange?.(); }, [venues, index, failedPhoto, isSelected, isReady, isProcessing, onSnapshotChange]);
  if (!current) return null;
  const { visible, overflow, hiddenNew } = visibleHybridCategories(current.categories);
  // Bound the number of attached badges; others appear as their venue rotates.
  const friends = venues.map((v, i) => ({ ...v, index: i })).filter(v => v.friendCount > 0);
  const attachedFriends = friends.length <= 4 && venues.length <= 12 ? friends : friends.filter(v => v.index === index);
  const rings = Math.max(1, venues.length);
  const venueDigits = String(venues.length).length;
  const summaryDiameter = p(venueDigits > 2 ? 30 : 24);
  const friendAngle = (at: number) => rings === 1 ? -Math.PI / 4 : -Math.PI / 2 + 2 * Math.PI * (at + .5) / rings;
  // Keep the summaries close to the ring; reserve more space only for an attached badge.
  const photoTopGap = Math.max(visible.length ? p(4) : 0, ...attachedFriends.map(v => p(9.5) - center - (radius + p(18)) * Math.sin(friendAngle(v.index))));
  const photoBottomGap = Math.max(p(4), ...attachedFriends.map(v => center + (radius + p(18)) * Math.sin(friendAngle(v.index)) + p(9.5) - ringSize));

  const friendWidth = Math.max(0, ...attachedFriends.map(v => 2 * (Math.abs((radius + p(18)) * Math.cos(friendAngle(v.index))) + p(12.5))));
  return <View testID="hybrid-cluster-marker" pointerEvents="none" style={[s.marker, { minWidth: friendWidth, opacity: !isReady ? .4 : isProcessing ? .6 : 1 }]}
    accessibilityLabel={`${current.venue.venue}, venue ${index + 1} of ${venues.length}; ${current.categories.map(c => `${c.category} ${c.count}`).join(', ')}; cluster totals ${cluster.eventCount} events, ${cluster.specialCount} specials`}>
      {visible.length > 0 && <View testID="hybrid-venue-summary" style={[s.venueSummary, { borderColor: accent }]}>
        {visible.map((item, at) => <View key={item.key} style={[s.category, at > 0 && s.sectionBorder]} accessibilityLabel={`${item.category}: ${item.count}${item.isNew ? ', new content' : ''}`}>
          <View><MaterialIcons name={categoryIcon(item.category) as any} size={p(11)} color={item.type === 'special' ? '#258446' : '#208EE8'} />{item.isNew && <View testID="hybrid-category-new" style={s.newDot} />}</View>
          <Text maxFontSizeMultiplier={1.2} style={[s.categoryCount, { color: item.type === 'special' ? '#258446' : '#208EE8' }]}>{item.count}</Text>
        </View>)}
        {overflow > 0 && <View style={[s.category, s.sectionBorder]} accessibilityLabel={`${overflow} more categories; open the existing cluster callout for all events`}><MaterialIcons name="more-horiz" size={p(14)} color="#637B88" />{hiddenNew && <View style={s.newDot} />}</View>}
      </View>}
      <View testID="hybrid-photo-ring" onLayout={e => onPhotoLayout?.({ y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })} style={{ width: ringSize, height: ringSize, marginTop: photoTopGap, marginBottom: photoBottomGap }}>
        {!snapshotMode && <Animated.View style={[StyleSheet.absoluteFillObject, { borderRadius: center, borderWidth: p(3), borderColor: timing, opacity: reduceMotionEnabled || !isActive || cluster.timeStatus === 'future' ? .25 : pulse.interpolate({ inputRange: [0, 1], outputRange: [.45, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] }]} />}
        <Segments diameter={ringSize} count={rings} active={index} />
        <View testID="hybrid-photo-frame" style={[s.photo, cluster.interestLevel === 'high' && s.interestPhoto, { left: p(8), top: p(8), width: photoSize, height: photoSize, borderRadius: photoSize / 2 }]}>
          {current.photo && failedPhoto !== current.photo ? <Image testID="hybrid-venue-photo" source={{ uri: current.photo }} fadeDuration={0} style={{ width: photoSize - p(2), height: photoSize - p(2) }} resizeMode="cover" onLoad={onSnapshotChange} onError={() => setFailedPhoto(current.photo)} /> : <Text maxFontSizeMultiplier={1.2} style={s.initials}>{current.venue.venue.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</Text>}
        </View>
        <Svg width={ringSize} height={ringSize} style={[StyleSheet.absoluteFill, { overflow: 'visible' }]} pointerEvents="none">
          {attachedFriends.map(v => { const angle = friendAngle(v.index); return <Line key={v.key} x1={center + radius * Math.cos(angle)} y1={center + radius * Math.sin(angle)} x2={center + (radius + p(18)) * Math.cos(angle)} y2={center + (radius + p(18)) * Math.sin(angle)} stroke="#7044C6" strokeWidth={p(1)} />; })}
        </Svg>
        {attachedFriends.map(v => { const angle = friendAngle(v.index); return <View key={v.key} accessibilityLabel={`${v.friendCount} friends at ${v.venue.venue}`} style={{ position: 'absolute', left: center + (radius + p(18)) * Math.cos(angle) - p(12.5), top: center + (radius + p(18)) * Math.sin(angle) - p(7.5) }}><FriendBadge count={v.friendCount} /></View>; })}
      </View>
    <View testID="hybrid-cluster-summary" style={[s.clusterSummary, { height: Math.max(p(28), summaryDiameter + p(4)) }]}>
      <View style={[s.venueTotal, { width: summaryDiameter, height: summaryDiameter }]} accessibilityLabel={`${venues.length} venues`}><Segments diameter={summaryDiameter} count={rings} staticRing /><MaterialIcons name="home" size={p(venueDigits > 1 ? 6 : 7.5)} color="#143247" /><Text maxFontSizeMultiplier={1.2} style={[s.venueNumber, venueDigits > 1 && { fontSize: p(8) }]}>{venues.length}</Text></View>
      <View style={[s.total, s.sectionBorder]}><MaterialIcons name="event" size={p(12)} color="#208EE8" /><Text maxFontSizeMultiplier={1.2} style={s.eventTotal}>{cluster.eventCount}</Text></View>
      <View style={[s.total, s.sectionBorder]}><MaterialIcons name="restaurant" size={p(12)} color="#258446" /><Text maxFontSizeMultiplier={1.2} style={s.specialTotal}>{cluster.specialCount}</Text></View>
      {cluster.containsCityLevelEvent && <View style={s.city} accessibilityLabel="City-wide event"><MaterialIcons name="festival" size={p(9)} color="#4E342E" /></View>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  marker: { alignItems: 'center', overflow: 'visible' },
  venueSummary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: p(4), paddingVertical: p(3), borderWidth: p(2), borderRadius: p(15), backgroundColor: '#FFFEFA', shadowColor: '#143247', shadowOpacity: .12, shadowRadius: p(3), shadowOffset: { width: p(0), height: p(2) }, elevation: 2 },
  category: { flexDirection: 'row', alignItems: 'center', gap: p(3), paddingHorizontal: p(7), minHeight: p(16) },
  categoryCount: { fontSize: p(11), fontWeight: '600', lineHeight: p(14) },
  sectionBorder: { borderLeftWidth: p(1), borderLeftColor: '#CBD8DD' },
  newDot: { position: 'absolute', top: p(-2), right: p(-2), width: p(4), height: p(4), borderRadius: p(2), backgroundColor: '#EF5A59', borderWidth: p(.7), borderColor: '#FFFEFA' },
  photo: { backgroundColor: '#FFFEFA', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: p(1), borderColor: '#FFF' },
  initials: { fontSize: p(14), color: '#143247', fontWeight: '700' },
  interestPhoto: { borderColor: '#4A90E2', borderWidth: p(1) },
  city: { position: 'absolute', right: p(-4), top: p(-6), width: p(14), height: p(14), borderRadius: p(7), alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFC400', borderWidth: p(1), borderColor: '#FFF' },
  friendBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: p(2), paddingHorizontal: p(3), height: p(15), minWidth: p(25), borderWidth: p(1), borderColor: '#FFFEFA', borderRadius: p(8), backgroundColor: '#7044C6' },
  friendCount: { fontSize: p(9), lineHeight: p(11), color: '#FFF', fontWeight: '600' },
  clusterSummary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: p(4), height: p(28), borderWidth: p(1), borderColor: '#ABCDE5', borderRadius: p(16), backgroundColor: '#EFF7FF', shadowColor: '#143247', shadowOpacity: .12, shadowRadius: p(3), shadowOffset: { width: p(0), height: p(2) }, elevation: 2 },
  venueTotal: { width: p(24), height: p(24), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: p(1), marginRight: p(6) },
  venueNumber: { fontSize: p(9), lineHeight: p(11), color: '#143247', fontWeight: '600' },
  total: { flexDirection: 'row', alignItems: 'center', gap: p(3), paddingHorizontal: p(7), height: p(20) },
  eventTotal: { fontSize: p(12), color: '#208EE8', fontWeight: '600' },
  specialTotal: { fontSize: p(12), color: '#258446', fontWeight: '600' },
});
