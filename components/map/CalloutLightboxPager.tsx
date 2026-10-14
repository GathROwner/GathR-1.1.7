import React, { useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PanGestureHandler } from 'react-native-gesture-handler';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Event } from '../../types/events';
import type { useCalloutLightboxPaging } from '../../hooks/useCalloutLightboxPaging';
import { buildEventImageGallery, getEventImageGallerySideTileIndexes, getEventImageGalleryHiddenCount } from '../../utils/eventImageGallery';
import FallbackImage from '../common/FallbackImage';
import FamilyFriendlyBadge from '../common/FamilyFriendlyBadge';
import GuestLimitedContent from '../GuestLimitedContent';
import { EventTimingBadge } from '../common/EventTimingBadge';
import { EventTimingSummaryText } from '../common/EventTimingSummaryText';

type Paging = ReturnType<typeof useCalloutLightboxPaging>;
type PanProps = React.ComponentProps<typeof PanGestureHandler>;

/** These recognizers only surround media: description/title scrolling cannot close or page. */
export function CalloutLightboxMediaGestures({ children, callout, enabled, paging, onVerticalGesture, onVerticalState }: {
  children: React.ReactNode;
  callout: boolean;
  enabled: boolean;
  paging: Paging;
  onVerticalGesture: PanProps['onGestureEvent'];
  onVerticalState: PanProps['onHandlerStateChange'];
}) {
  const vertical = useRef<PanGestureHandler>(null);
  const horizontal = useRef<PanGestureHandler>(null);
  if (!callout) return <>{children}</>;
  return <PanGestureHandler ref={vertical} enabled={enabled} simultaneousHandlers={horizontal}
    activeOffsetY={12} failOffsetX={[-22, 22]}
    onGestureEvent={onVerticalGesture} onHandlerStateChange={onVerticalState}>
    <Animated.View style={styles.mediaSurface}>
      <PanGestureHandler ref={horizontal} enabled={enabled && paging.enabled} simultaneousHandlers={vertical}
        activeOffsetX={[-12, 12]} failOffsetY={[-22, 22]}
        onGestureEvent={paging.onGestureEvent} onHandlerStateChange={paging.onStateChange}>
        <Animated.View>{children}</Animated.View>
      </PanGestureHandler>
    </Animated.View>
  </PanGestureHandler>;
}

export function CalloutLightboxCounter({ index, count, special = false }: { index: number; count: number; special?: boolean }) {
  if (count <= 1 || index < 0 || index >= count) return null;
  const noun = special ? 'Special' : 'Event';
  return <View testID="callout-lightbox-counter" style={styles.counter} pointerEvents="none">
    <Text style={styles.counterText} accessibilityLabel={`${noun} ${index + 1} of ${count}`}>{`${noun} ${index + 1}/${count}`}</Text>
  </View>;
}

/** Read-only adjacent content: no engagement subscriptions, tracking or interactive overlays. */
function PagePreview({ event, imageHeight, index, count }: { event: Event; imageHeight: number; index: number; count: number }) {
  const images = buildEventImageGallery(event.imageUrl || event.profileUrl || '', event.mediaUrls);
  const sides = getEventImageGallerySideTileIndexes(images);
  const hidden = getEventImageGalleryHiddenCount(images);
  const titleParts = event.title.length > 55 ? event.title.match(/^(.+?)\s+(\([^]*\).*)$/) : null;
  return <View style={styles.page}>
    <View style={[styles.imageGrid, { height: imageHeight }]}>
      <FallbackImage imageUrl={images[0]} category={event.category} type={event.type} item={event}
        fallbackType="post" resizeMode="contain" style={sides.length ? styles.heroWithGallery : styles.hero} />
      {sides.length > 0 && <View style={styles.sideColumn}>{sides.map((index, position) =>
        <View key={images[index]} style={styles.sideTile}>
          <FallbackImage imageUrl={images[index]} category={event.category} type={event.type} item={event}
            fallbackType="post" resizeMode="cover" style={styles.hero} />
          {hidden > 0 && position === sides.length - 1 && <View style={styles.more}><Text style={styles.moreText}>{`+${hidden}`}</Text></View>}
        </View>)}</View>}
      <CalloutLightboxCounter index={index} count={count} special={event.type === 'special'} />
      <View style={styles.zoom}><MaterialIcons name="zoom-in" size={21} color="rgba(255,255,255,0.9)" /></View>
      {!event.friendEvent && <View style={styles.engagement}>
        {(['thumb-up', 'share', 'person'] as const).map((icon, index) => {
          const count = [Number(event.likes) || 0, Number(event.shares) || 0,
            (Number(event.interested) || 0) + (Number(event.usersResponded) || 0)][index];
          return <View key={icon} style={styles.engagementBadge}><MaterialIcons name={icon} size={14} color="#333333" />
            {count > 0 && <Text style={styles.engagementText}>{count}</Text>}</View>;
        })}
      </View>}
    </View>
    <View style={styles.heading}><Text style={styles.title}>{titleParts?.[1] || event.title}</Text>
      {titleParts && <Text style={styles.subtitle}>{titleParts[2]}</Text>}
    </View>
    <View style={styles.badges}><FamilyFriendlyBadge event={event} />
      <View style={styles.category}><Text style={styles.categoryText}>{event.category}</Text></View>
    </View>
    <View style={styles.timing}><MaterialIcons name="access-time" size={18} color="#FFFFFF" />
      <EventTimingSummaryText event={event} style={styles.timingText} containerStyle={styles.timingSentence} showInfoMarker={false} />
      <EventTimingBadge event={event} compact showInfoIndicator={false} />
    </View>
    <View style={styles.description}><GuestLimitedContent contentType="description" fullText={event.description} maxLength={undefined}>
      <Text style={styles.descriptionText}>{event.description}</Text>
    </GuestLimitedContent></View>
  </View>;
}

export function CalloutLightboxPages({ enabled, children, paging, previous, next, width, imageHeight, onWidth, index, count }: {
  enabled: boolean; children: React.ReactNode; paging: Paging; previous?: Event; next?: Event;
  width: number; imageHeight: number; onWidth: (width: number) => void; index: number; count: number;
}) {
  const translations = useMemo(() => ({
    previous: Animated.add(paging.offsetX, -width),
    next: Animated.add(paging.offsetX, width),
  }), [paging.offsetX, width]);
  if (!enabled) return <>{children}</>;
  return <View style={styles.viewport} testID="callout-lightbox-pages"
    onLayout={(event) => { const measured = event.nativeEvent.layout.width; if (measured > 0 && measured !== width) onWidth(measured); }}>
    {([-1, 1] as const).map((side) => {
      const event = side === -1 ? previous : next;
      return <Animated.View key={side} pointerEvents="none" accessible={false} accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants" style={[styles.adjacent, { transform: [{ translateX: side === -1 ? translations.previous : translations.next }] }]}>
        {event && <PagePreview event={event} imageHeight={imageHeight} index={index + side} count={count} />}
      </Animated.View>;
    })}
    <Animated.View style={[styles.page, styles.currentPage, { transform: [{ translateX: paging.offsetX }] }]}>{children}</Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  mediaSurface: { flexShrink: 0 },
  counter: { position: 'absolute', top: 12, left: 12, zIndex: 15, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, backgroundColor: 'rgba(17,17,17,0.82)' },
  counterText: { color: '#FFFFFF', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  zoom: { position: 'absolute', top: 12, right: 12, padding: 4, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  engagement: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 4 },
  engagementBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 32,
    minWidth: 34, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 18, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  engagementText: { marginLeft: 4, fontSize: 11, color: '#333333', fontWeight: '500' },
  viewport: { flex: 1, overflow: 'hidden' },
  page: { flex: 1, backgroundColor: '#222222' },
  currentPage: { zIndex: 1 },
  adjacent: { ...StyleSheet.absoluteFillObject, zIndex: 0, overflow: 'hidden', backgroundColor: '#222222' },
  imageGrid: { flexDirection: 'row', flexShrink: 0, backgroundColor: '#000000' },
  hero: { flex: 1 },
  heroWithGallery: { width: '67%', flexGrow: 0, flexShrink: 0 },
  sideColumn: { width: '33%', borderLeftWidth: 2, borderLeftColor: '#111111' },
  sideTile: { flex: 1, borderBottomWidth: 2, borderBottomColor: '#111111', overflow: 'hidden' },
  more: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  moreText: { color: '#FFFFFF', fontSize: 25, fontWeight: '800' },
  heading: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#2C2F33', flexShrink: 0, maxHeight: 156 },
  title: { color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: 'bold' },
  subtitle: { color: '#E5E7EB', fontSize: 14, lineHeight: 19, marginTop: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#2C2F33' },
  category: { backgroundColor: '#666666', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  categoryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  timing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  timingSentence: { flex: 1 },
  timingText: { color: '#FFFFFF', fontSize: 14 },
  description: { flex: 1, overflow: 'hidden', paddingHorizontal: 16, paddingTop: 6 },
  descriptionText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
});
