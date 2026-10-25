import React, { useEffect, useRef, memo, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Modal,
  PanResponder,
  Platform,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabDockContentInset } from '../../constants/tabDock';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { useMapStore } from '../../store';
import { useInterestCarouselUiStore } from '../../store/interestCarouselUiStore';
import { Event, Venue, Cluster } from '../../types/events';
import { EventTimingSummaryText } from '../common/EventTimingSummaryText';
import { useViewedEventTimeStatus } from '../../hooks/useVisitingHoursView';
import FallbackImage from '../common/FallbackImage';
import FamilyFriendlyBadge from '../common/FamilyFriendlyBadge';
import { EventTimingBadge, getCarouselTimingBadge } from '../common/EventTimingBadge';
import { getContinuousDonationCampaignRange } from '../../utils/campaignTimingPresentation';
import EventImageLightbox from './EventImageLightbox';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';
import { getInterestCarouselEvents } from '../../utils/interestCarouselOrder';
import {
  createLoopingCarouselItems, getLoopingCarouselStartIndex,
  getLoopingCarouselLogicalOffset, getLoopingCarouselRestoredOffset,
  getLoopingCarouselDotStops,
  getCarouselMetrics, getCarouselPeriod, getCarouselStartOffset, getCarouselSlotLayout,
  getCarouselAnchor, getCarouselAnchorOffset, resolveCarouselAnchor, isLoopingCarousel,
} from '../../utils/loopingCarousel';
import { isFamilyFriendlyInterest } from '../../utils/familyFriendly';
import { registerMapTraceSampler, traceMapEvent } from '../../utils/mapTrace';
import {
  clearInterestFilterPerfAction,
  markInterestFilterPerfAction,
  traceInterestFilterPerf,
} from '../../utils/interestFilterPerfTrace';
import { isAreaExperienceEvent } from '../../utils/locationScope';
import { usePathname } from 'expo-router';
import { isFriendEventDetailPath } from '../../utils/friendEventLightbox';
import { getEventScheduleState } from '../../utils/eventTiming';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';

const readAnimatedValue = (value: Animated.Value): number | string =>
  typeof (value as any).__getValue === 'function' ? (value as any).__getValue() : 'unknown';

// Constants from InterestFilterPills for consistency
const EVENT_COLOR = '#64B5F6';
const SPECIAL_COLOR = '#66BB6A';

const CARD_WIDTH = 160;
const CARD_HEIGHT = 112;
const CARD_GAP = 12;
const VENUE_AVATAR_SIZE = 30;

// Pagination dot sizes
const DOT_SIZE_LARGE = 10;   // Fully visible cards
const DOT_SIZE_MEDIUM = 7;   // Partially visible card (~70% of large)
const DOT_SIZE_SMALL = 5;    // Off-screen cards
const PAGINATION_HEIGHT = 20; // paddingVertical (8*2) + dot height (10)

// New content indicator dot component (same as InterestFilterPills)
const NewContentDot: React.FC = () => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    pulseAnimation.start();
    return () => {
      pulseAnimation.stop();
    };
  }, [pulseOpacity, pulseScale]);

  return (
    <Animated.View
      style={[
        styles.newDot,
        {
          opacity: pulseOpacity,
          transform: [{ scale: pulseScale }],
        },
      ]}
    />
  );
};

// Category icon mapping (from InterestFilterPills)
const getCategoryIconName = (category: string): string => {
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('live music') || categoryLower.includes('music')) return 'audiotrack';
  if (categoryLower.includes('comedy')) return 'sentiment-very-satisfied';
  if (categoryLower.includes('sport')) return 'sports-basketball';
  if (categoryLower.includes('trivia')) return 'psychology-alt';
  if (categoryLower.includes('workshop') || categoryLower.includes('class')) return 'history-edu';
  if (categoryLower.includes('religious') || categoryLower.includes('church')) return 'church';
  if (categoryLower.includes('family')) return 'family-restroom';
  if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) return 'nightlife';
  if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) return 'theaters';
  if (categoryLower.includes('happy hour')) return 'local-bar';
  if (categoryLower.includes('food') || categoryLower.includes('wing')) return 'restaurant';
  if (categoryLower.includes('drink')) return 'wine-bar';
  return 'category';
};

// Event Card Component
const EventCard = memo(({
  event,
  onPress,
  hasNewContent,
  width,
}: {
  event: Event;
  onPress: () => void;
  hasNewContent?: boolean;
  width: number;
}) => {
  useEventTimingMinute();
  const isNow = useViewedEventTimeStatus(event) === 'now';
  const timingState = getEventScheduleState(event);
  const showUnknownEndSeparator = !isNow && !getContinuousDonationCampaignRange(event)
    && getCarouselTimingBadge(event)?.text === 'END\nUNKNOWN';

  const categoryBgColor = event.type === 'event' ? EVENT_COLOR : SPECIAL_COLOR;

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      accessibilityLabel={`Open ${event.title}`}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Event Image */}
      <View style={styles.imageContainer}>
        <FallbackImage
          imageUrl={event.imageUrl || event.SharedPostThumbnail}
          category={event.category}
          type={event.type}
          style={[styles.eventImage, timingState.muted && styles.mutedTimingImage]}
          fallbackType="post"
          item={event}
          resizeMode="cover"
        />

        {/* Venue identity overlay */}
        <View style={[styles.venueOverlay, { maxWidth: width - 18 }, isNow && styles.venueOverlayWithNow]}>
          <View style={styles.venueAvatarShell}>
            <FallbackImage
              imageUrl={event.profileUrl}
              category={event.category}
              type={event.type}
              style={styles.venueAvatar}
              fallbackType="profile"
              item={event}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.venueOverlayText} numberOfLines={2}>
            {event.venue}
          </Text>
        </View>

        {/* Primary category plus the optional Family Friendly secondary facet. */}
        <View style={styles.imageFacetBadges}>
          <FamilyFriendlyBadge
            event={event}
            variant="carousel"
            style={styles.carouselFamilyFriendlyBadge}
          />
          <View style={[styles.categoryBadge, { backgroundColor: categoryBgColor }]}>
            {event.category.toLowerCase().includes('learn') ||
             event.category.toLowerCase().includes('workshop') ? (
              <Ionicons name="school" size={12} color="#FFFFFF" />
            ) : (
              <MaterialIcons
                name={getCategoryIconName(event.category) as any}
                size={12}
                color="#FFFFFF"
              />
            )}
          </View>
        </View>

        {/* NOW Badge */}
        {isNow && (
          <View style={styles.nowBadge}>
            <Text style={styles.nowText}>NOW</Text>
          </View>
        )}
        {/* New Content Indicator */}
        {hasNewContent && (
          <View style={[styles.newDotWrapper, isNow && styles.newDotWrapperWithNow]}>
            <NewContentDot />
          </View>
        )}
      </View>

      {/* Event Info */}
      <View style={styles.cardContent}>
        <Text style={styles.eventTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.timeRow}>
          <MaterialIcons name="schedule" size={13} color="#1967D2" />
          <EventTimingSummaryText
            event={event}
            carousel
            style={styles.timeText}
            containerStyle={showUnknownEndSeparator ? styles.intrinsicTime : undefined}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          />
          {showUnknownEndSeparator && (
            <View style={styles.endUnknownSeparator} testID="carousel-end-unknown-separator">
              <Text accessible={false} importantForAccessibility="no" style={styles.separatorText}>-</Text>
            </View>
          )}
          {!isNow && (
            <EventTimingBadge event={event} carousel style={styles.carouselTimingBadge} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

EventCard.displayName = 'EventCard';

// Pagination Dots Component with dynamic sizing
const PaginationDots = memo(({
  scrollX,
  itemCount,
  itemWidth,
  seamSpan,
}: {
  scrollX: Animated.Value;
  itemCount: number;
  itemWidth: number;
  seamSpan: number;
}) => {

  // Create animated dots with size interpolation based on scroll position
  const dots = useMemo(() => {
    return Array.from({ length: itemCount }, (_, index) => {
      const { inputRange, distances } = getLoopingCarouselDotStops(index, itemCount, itemWidth, seamSpan);

      // Interpolate dot size based on scroll position
      const dotSize = scrollX.interpolate({
        inputRange,
        outputRange: distances.map(distance => itemCount <= 3 || distance === 0
          ? DOT_SIZE_LARGE : distance === 1 ? DOT_SIZE_MEDIUM : DOT_SIZE_SMALL),
        extrapolate: 'clamp',
      });

      // Interpolate opacity - larger dots are more visible
      const dotOpacity = scrollX.interpolate({
        inputRange,
        outputRange: distances.map(distance => distance === 0 ? 0.9 : distance === 1 ? 0.6 : 0.4),
        extrapolate: 'clamp',
      });

      return (
        <Animated.View
          key={`dot-${index}`}
          style={[
            styles.paginationDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: Animated.divide(dotSize, 2),
              opacity: dotOpacity,
            },
          ]}
        />
      );
    });
  }, [itemCount, scrollX, itemWidth, seamSpan]);

  // A single card has no scrolling or repeated copies.
  if (itemCount <= 1) {
    return (
      <View style={styles.paginationContainer}>
        {Array.from({ length: itemCount }, (_, index) => (
          <View
            key={`dot-${index}`}
            style={[
              styles.paginationDot,
              {
                width: DOT_SIZE_LARGE,
                height: DOT_SIZE_LARGE,
                borderRadius: DOT_SIZE_LARGE / 2,
                opacity: 0.9,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.paginationContainer}>
      {dots}
    </View>
  );
});

PaginationDots.displayName = 'PaginationDots';

type CarouselEventContext = {
  cluster: Cluster;
  venue: Venue;
  venueEventIds: string[];
};

// Main Carousel Component
const InterestsCarousel: React.FC = () => {
  const { width: viewportWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(viewportWidth);
  const insets = useSafeAreaInsets();
  const bottomOffset = getTabDockContentInset(Platform.OS, insets.bottom);
  const isFocused = useIsFocused();
  const pathname = usePathname();
  const isFriendEventDetailRoute = isFriendEventDetailPath(pathname);
  const onScreenEvents = useMapStore((state) => state.onScreenEvents);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const clusters = useMapStore((state) => state.clusters);
  const activeFilterPanel = useMapStore((state) => state.activeFilterPanel);
  const interestCarouselFilter = useInterestCarouselUiStore((state) => state.interestCarouselFilter);
  const setInterestCarouselFilter = useInterestCarouselUiStore((state) => state.setInterestCarouselFilter);

  // Get cluster interaction store for red dot tracking
  const {
    hasNewContent: checkHasNewContent,
    recordInteraction,
    carouselViewedEventIds,
    markCarouselEventViewed,
    markCarouselEventsViewed,
  } = useClusterInteractionStore();

  const eventContextById = useMemo(() => {
    const eventMap = new Map<string, CarouselEventContext>();

    clusters.forEach((cluster) => {
      cluster.venues.forEach((venue) => {
        const venueEventIds = venue.events.map((event) => event.id.toString());

        venue.events.forEach((event) => {
          eventMap.set(event.id.toString(), {
            cluster,
            venue,
            venueEventIds,
          });
        });
      });
    });

    return eventMap;
  }, [clusters]);

  const getEventContext = useCallback(
    (eventId: string | number) => eventContextById.get(eventId.toString()),
    [eventContextById]
  );

  const carouselFilterCriteria = useMemo(() => {
    if (interestCarouselFilter?.status !== 'active') {
      return filterCriteria;
    }

    // City filter spans events and specials: both sides get the sentinel so
    // the carousel shows every city-level item regardless of type.
    const isCityFilter = interestCarouselFilter.kind === 'city';
    const isCrossTypeFilter =
      isCityFilter || isFamilyFriendlyInterest(interestCarouselFilter.category);

    return {
      ...filterCriteria,
      eventFilters: {
        ...filterCriteria.eventFilters,
        category:
          isCrossTypeFilter || interestCarouselFilter.type === 'event'
            ? interestCarouselFilter.category
            : '__FILTER_PILLS_HIDE__',
        categoryFilterSource: 'interest-pills' as const,
      },
      specialFilters: {
        ...filterCriteria.specialFilters,
        category:
          isCrossTypeFilter || interestCarouselFilter.type === 'special'
            ? interestCarouselFilter.category
            : '__FILTER_PILLS_HIDE__',
        categoryFilterSource: 'interest-pills' as const,
      },
    };
  }, [filterCriteria, interestCarouselFilter]);

  const categoryCarouselEvents = useMemo(() => {
    return getInterestCarouselEvents(onScreenEvents, carouselFilterCriteria);
  }, [onScreenEvents, carouselFilterCriteria]);

  // Only activate carousel for interest-pills filters, not filter-pills
  const optimisticFilterActive = interestCarouselFilter?.status === 'active';
  const optimisticFilterCleared = interestCarouselFilter?.status === 'cleared';
  const hasInterestPillCategoryFilter =
    optimisticFilterActive ||
    (!optimisticFilterCleared &&
      (filterCriteria.eventFilters.categoryFilterSource === 'interest-pills' ||
        filterCriteria.specialFilters.categoryFilterSource === 'interest-pills'));

  const activeMode: 'category' | null = hasInterestPillCategoryFilter ? 'category' : null;

  const carouselEvents = categoryCarouselEvents;
  const loopingItems = useMemo(() => createLoopingCarouselItems(carouselEvents), [carouselEvents]);
  const railWidth = Math.min(viewportWidth, measuredWidth);
  const { cardWidth, stride, seamWidth, seamSpan } = getCarouselMetrics(railWidth, carouselEvents.length);
  const looping = isLoopingCarousel(carouselEvents.length);
  const loopStartIndex = getLoopingCarouselStartIndex(carouselEvents.length);
  const carouselListKey = JSON.stringify([
    carouselFilterCriteria.eventFilters.category,
    carouselFilterCriteria.specialFilters.category,
    cardWidth, seamWidth,
    ...carouselEvents.map(event => String(event.id)),
  ]);

  // Determine which events have new content
  // Map from event.id to boolean indicating if event is new
  const eventNewContentMap = useMemo(() => {
    const map = new Map<string | number, boolean>();

    carouselEvents.forEach(event => {
      const eventContext = getEventContext(event.id);

      if (!eventContext) {
        map.set(event.id, false);
        return;
      }

      // Check if this venue has new content
      const venueHasNew = checkHasNewContent(
        eventContext.venue.locationKey,
        eventContext.venueEventIds
      );

      map.set(event.id, venueHasNew);
    });

    return map;
  }, [carouselEvents, checkHasNewContent, getEventContext]);

  // Local state for lightbox (not mapStore)
  const [selectedImageData, setSelectedImageData] = useState<{
    session: number;
    imageUrl: string;
    event: Event;
    venue?: Venue;
    cluster?: Cluster;
    currentIndex: number;
  } | null>(null);
  const nextLightboxSessionRef = useRef(0);
  const activeLightboxSessionRef = useRef<number | null>(null);
  const selectedSession = selectedImageData?.session;
  const closeLightbox = useCallback(() => {
    if (activeLightboxSessionRef.current !== selectedSession) return;
    activeLightboxSessionRef.current = null;
    setSelectedImageData(null);
  }, [selectedSession]);

  // Swipes finish after an animation. Resolve their captured destination by
  // identity against the latest committed source, never a stale array index.
  const currentCarouselRef = useRef({ events: carouselEvents, getEventContext, stride, seamSpan });
  useLayoutEffect(() => {
    currentCarouselRef.current = { events: carouselEvents, getEventContext, stride, seamSpan };
  }, [carouselEvents, getEventContext, stride, seamSpan]);

  const resolveCurrentEvent = useCallback((id: Event['id']) => {
    const source = currentCarouselRef.current;
    const index = source.events.findIndex(event => String(event.id) === String(id));
    if (index < 0) return null;
    const event = source.events[index];
    return { ...source, event, index, context: source.getEventContext(event.id) };
  }, []);

  // Track whether component should render (stays true during exit animation)
  const [shouldRender, setShouldRender] = useState(false);

  const slideAnim = useRef(new Animated.Value(150)).current; // Start off-screen
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current; // Track horizontal scroll position
  const flatListRef = useRef<FlatList<(typeof loopingItems)[number]>>(null);
  const physicalOffsetRef = useRef(getCarouselStartOffset(carouselEvents.length, stride, seamSpan));
  const anchorRef = useRef({ id: String(carouselEvents[0]?.id ?? ''), fraction: 0 });
  const anchor = resolveCarouselAnchor(carouselEvents, anchorRef.current);
  const anchorIndex = anchor.index;
  const layoutOffset = getCarouselAnchorOffset(anchorIndex, anchor.fraction, carouselEvents.length, stride, seamSpan);
  const restoreLayoutRef = useRef<number | null>(layoutOffset);
  const expectedLayoutOffsetRef = useRef<number | null>(layoutOffset);
  const layoutFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);
  const restoreLoopPosition = useCallback(() => {
    clearSettleTimer();
    if (!looping) return;
    const offset = physicalOffsetRef.current;
    const restored = getLoopingCarouselRestoredOffset(offset, carouselEvents.length, stride, seamSpan);
    if (Math.abs(restored - offset) < 0.5) return;
    physicalOffsetRef.current = restored;
    flatListRef.current?.scrollToOffset({ offset: restored, animated: false });
  }, [carouselEvents.length, looping, stride, seamSpan, clearSettleTimer]);
  const restoreLayout = useCallback(() => {
    if (restoreLayoutRef.current === null) return;
    if (!flatListRef.current) return;
    const target = restoreLayoutRef.current;
    restoreLayoutRef.current = null;
    flatListRef.current?.scrollToOffset({ offset: target, animated: false });
  }, []);
  useLayoutEffect(() => {
    clearSettleTimer();
    anchorRef.current = { id: anchor.id, fraction: anchor.fraction };
    physicalOffsetRef.current = layoutOffset;
    restoreLayoutRef.current = layoutOffset;
    expectedLayoutOffsetRef.current = layoutOffset;
    scrollX.setValue(getLoopingCarouselLogicalOffset(layoutOffset, carouselEvents.length, stride, seamSpan));
    layoutFrameRef.current = requestAnimationFrame(restoreLayout);
    return () => { clearSettleTimer(); if (layoutFrameRef.current !== null) cancelAnimationFrame(layoutFrameRef.current); };
    // A new geometry/data key restores the last real-card identity and fractional position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselListKey, scrollX, clearSettleTimer, restoreLayout]);
  const handleCarouselScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    // Discard the remounted list's transient origin before its exact initial offset is applied.
    if (expectedLayoutOffsetRef.current !== null) {
      if (Math.abs(offset - expectedLayoutOffsetRef.current) > 0.5) return;
      expectedLayoutOffsetRef.current = null;
    }
    physicalOffsetRef.current = offset;
    const anchor = getCarouselAnchor(offset, carouselEvents.length, stride, seamSpan);
    anchorRef.current = { id: String(carouselEvents[anchor.index]?.id ?? ''), fraction: anchor.fraction };
    scrollX.setValue(getLoopingCarouselLogicalOffset(offset, carouselEvents.length, stride, seamSpan));
    // A drag without momentum also settles, but never restore while snap scrolling continues.
    if (settleTimerRef.current) {
      clearSettleTimer();
      settleTimerRef.current = setTimeout(restoreLoopPosition, 120);
    }
  }, [carouselEvents, stride, seamSpan, scrollX, clearSettleTimer, restoreLoopPosition]);
  const beginCarouselDrag = useCallback(() => {
    clearSettleTimer();
    expectedLayoutOffsetRef.current = null;
    restoreLayoutRef.current = null;
    if (layoutFrameRef.current !== null) cancelAnimationFrame(layoutFrameRef.current);
  }, [clearSettleTimer]);
  const carouselVisibleRef = useRef(false);

  // Dismissal handler - clears the category carousel UI state.
  const handleDismiss = useCallback(() => {
    if (activeMode === 'category' || interestCarouselFilter?.status === 'active') {
      markInterestFilterPerfAction({
        action: 'dismiss-carousel',
        label: activeMode ?? 'category',
      });
      setInterestCarouselFilter({ status: 'cleared' });
    }
  }, [
    setInterestCarouselFilter,
    activeMode,
    interestCarouselFilter?.status,
  ]);

  // PanResponder for swipe-down gesture (works anywhere in carousel)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't claim gesture on touch start - let FlatList have a chance
        onStartShouldSetPanResponder: () => false,

        // Only claim when clear vertical downward movement detected
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const { dx, dy } = gestureState;

          // Must satisfy ALL conditions:
          // 1. Moving downward (positive dy)
          // 2. Primarily vertical (|dy| > |dx|)
          // 3. Past minimum threshold (10px)
          // 4. Strong vertical bias (|dy| > |dx| * 1.5)
          const isDownward = dy > 0;
          const isPrimarilyVertical = Math.abs(dy) > Math.abs(dx);
          const exceededThreshold = Math.abs(dy) > 10;
          const hasVerticalBias = Math.abs(dy) > Math.abs(dx) * 1.5;

          return isDownward && isPrimarilyVertical && exceededThreshold && hasVerticalBias;
        },

        onPanResponderGrant: () => {
          // Optional: Add visual feedback when gesture is captured
        },

        onPanResponderMove: (_, gestureState) => {
          // Live drag feedback - carousel follows finger
          const { dy } = gestureState;
          // Only track downward movement (positive dy), clamp at 0 for upward
          const clampedDy = Math.max(0, dy);
          slideAnim.setValue(clampedDy);
        },

        onPanResponderRelease: (_, gestureState) => {
          const { dy, vy } = gestureState;

          // Dismiss if dragged 80px down OR fast downward flick
          const shouldDismiss = dy > 80 || vy > 0.5;

          if (shouldDismiss) {
            // Animate to off-screen, then clear filters
            Animated.parallel([
              Animated.timing(slideAnim, {
                toValue: 150,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
            ]).start(() => {
              // Clear filters after animation completes
              handleDismiss();
            });
          } else {
            // Snap back to original position
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              friction: 8,
              tension: 100,
            }).start();
          }
        },

        onPanResponderTerminate: () => {
          // Reset if another gesture takes over
        },
      }),
    [handleDismiss, slideAnim, opacityAnim]
  );

  const isVisible =
    isFocused &&
    !!activeMode &&
    carouselEvents.length > 0 &&
    !activeFilterPanel;

  useEffect(() => {
    traceMapEvent('interests_carousel_state_changed', {
      activeMode: activeMode ?? 'none',
      isVisible,
      activeFilterPanel: activeFilterPanel ?? 'none',
      carouselEventCount: carouselEvents.length,
      hasSelectedImage: !!selectedImageData,
    });

    const delays = [100, 300, 700, 1500];
    const timers = delays.map((delayMs) =>
      setTimeout(() => {
        traceMapEvent('interests_carousel_value_sampled', {
          delayMs,
          activeMode: activeMode ?? 'none',
          isVisible,
          slideY: readAnimatedValue(slideAnim),
          opacity: readAnimatedValue(opacityAnim),
          carouselEventCount: carouselEvents.length,
          activeFilterPanel: activeFilterPanel ?? 'none',
        });
      }, delayMs)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    activeFilterPanel,
    activeMode,
    carouselEvents.length,
    isVisible,
    opacityAnim,
    selectedImageData,
    slideAnim,
  ]);

  useEffect(() => {
    return registerMapTraceSampler('interests_carousel', () => ({
      activeMode: activeMode ?? 'none',
      isVisible,
      activeFilterPanel: activeFilterPanel ?? 'none',
      slideY: readAnimatedValue(slideAnim),
      opacity: readAnimatedValue(opacityAnim),
      carouselEventCount: carouselEvents.length,
      hasSelectedImage: !!selectedImageData,
      isFocused,
    }));
  }, [
    activeFilterPanel,
    activeMode,
    carouselEvents.length,
    isFocused,
    isVisible,
    opacityAnim,
    selectedImageData,
    slideAnim,
  ]);

  // Animate visibility - keep component mounted during exit animation.
  // Use a layout effect so the carousel does not wait behind delayed passive effects.
  useLayoutEffect(() => {
    if (isVisible && !carouselVisibleRef.current) {
      carouselVisibleRef.current = true;
      // Immediately render, then animate in
      const animationStartedAt = Date.now();
      traceInterestFilterPerf('carousel_show_started', {
        activeMode: activeMode ?? 'none',
        carouselEventCount: carouselEvents.length,
      });
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        traceInterestFilterPerf('carousel_show_completed', {
          activeMode: activeMode ?? 'none',
          carouselEventCount: carouselEvents.length,
          animationMs: Date.now() - animationStartedAt,
          finished,
        });
      });
    } else if (!isVisible && carouselVisibleRef.current) {
      carouselVisibleRef.current = false;
      // Animate out, then unmount
      const animationStartedAt = Date.now();
      traceInterestFilterPerf('carousel_hide_started', {
        activeMode: activeMode ?? 'none',
        carouselEventCount: carouselEvents.length,
      });
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 150,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        traceInterestFilterPerf('carousel_hide_completed', {
          activeMode: activeMode ?? 'none',
          carouselEventCount: carouselEvents.length,
          animationMs: Date.now() - animationStartedAt,
          finished,
        });
        if (finished) {
          setShouldRender(false);
          clearInterestFilterPerfAction();
        }
      });
    }
  }, [activeMode, carouselEvents.length, isVisible, slideAnim, opacityAnim]);

  // Handle card press - open lightbox with event details
  const handleCardPress = (requestedEvent: Event) => {
    const current = resolveCurrentEvent(requestedEvent.id);
    if (!current) return;
    const { event, index, context: eventContext } = current;

    // Track this individual event as viewed (for carousel red dot removal)
    // This is event-level tracking, NOT venue-level
    markCarouselEventViewed(event.id);

    // Set LOCAL state to show lightbox (not mapStore)
    const session = ++nextLightboxSessionRef.current;
    activeLightboxSessionRef.current = session;
    setSelectedImageData({
      session,
      imageUrl: event.imageUrl || event.SharedPostThumbnail || '',
      event: event,
      venue: eventContext?.venue,
      cluster: eventContext?.cluster,
      currentIndex: index,
    });
  };

  // Handle navigation between events in lightbox
  const handleNavigate = useCallback((newIndex: number) => {
    // A late swipe must not reopen a dismissed detail or replace a newer open.
    if (selectedSession === undefined || activeLightboxSessionRef.current !== selectedSession) return;
    const requestedEvent = carouselEvents[newIndex];
    if (!requestedEvent) return;
    const current = resolveCurrentEvent(requestedEvent.id);
    if (!current) return;
    const { event, index, context: eventContext, events, stride: currentStride, seamSpan: currentSeamSpan } = current;
    // Map marker eligibility is narrower than the displayed interest list
    // (for example after an unknown-end cutoff). Context is optional for detail.

    // Track the new event as viewed when navigating
    markCarouselEventViewed(event.id);

    setSelectedImageData({
      session: selectedSession,
      imageUrl: event.imageUrl || event.SharedPostThumbnail || '',
      event: event,
      venue: eventContext?.venue,
      cluster: eventContext?.cluster,
      currentIndex: index,
    });

    // Only original indices enter the lightbox; repeated slots are private to the list.
    clearSettleTimer();
    const offset = getCarouselAnchorOffset(index, 0, events.length, currentStride, currentSeamSpan);
    anchorRef.current = { id: String(event.id), fraction: 0 };
    physicalOffsetRef.current = offset;
    scrollX.setValue(getLoopingCarouselLogicalOffset(offset, events.length, currentStride, currentSeamSpan));
    flatListRef.current?.scrollToOffset({ offset, animated: false });
  }, [selectedSession, carouselEvents, resolveCurrentEvent, markCarouselEventViewed, clearSettleTimer, scrollX]);

  // Handle when user clicks "View Venue" in lightbox
  // This should record venue-level interaction to clear all red dots for that venue
  const handleViewVenueFromLightbox = useCallback(() => {
    if (!selectedImageData?.venue) return;

    const venue = selectedImageData.venue;
    const stableVenueId = venue.locationKey;
    const venueEventIds = venue.events.map(e => e.id.toString());

    // Record venue-level interaction (persisted to AsyncStorage)
    recordInteraction(stableVenueId, venueEventIds);

    // Mark all events from this venue as viewed in local state
    markCarouselEventsViewed(venue.events.map((e) => e.id));
  }, [selectedImageData, recordInteraction, markCarouselEventsViewed]);

  useEffect(() => {
    setSelectedImageData(previous => {
      if (!previous) return previous;
      const index = carouselEvents.findIndex(event => String(event.id) === String(previous.event.id));
      const event = carouselEvents[index], context = event && getEventContext(event.id);
      // Only removal from the actual carousel source invalidates selection.
      // A disappearing map marker must not close an otherwise available detail.
      if (!event) {
        if (activeLightboxSessionRef.current === previous.session) activeLightboxSessionRef.current = null;
        return null;
      }
      if (event === previous.event && index === previous.currentIndex && context?.venue === previous.venue && context?.cluster === previous.cluster) return previous;
      return { session: previous.session, imageUrl: event.imageUrl || event.SharedPostThumbnail || '', event, venue: context?.venue, cluster: context?.cluster, currentIndex: index };
    });
  }, [carouselEvents, getEventContext]);

  if (!isVisible && !shouldRender && !selectedImageData) {
    return null;
  }

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        onLayout={event => { const width = event.nativeEvent.layout.width; if (width > 0) setMeasuredWidth(width); }}
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
        pointerEvents={isVisible ? 'box-none' : 'none'}
      >
        {/* Dismissal Handle */}
        <View style={styles.handleContainer}>
          <TouchableOpacity
            style={styles.handle}
            onPress={handleDismiss}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name="keyboard-arrow-down"
              size={16}
              color="#9AA0A6"
            />
          </TouchableOpacity>
        </View>

        {/* Carousel - no wrapper background */}
        <FlatList
          key={carouselListKey}
          ref={flatListRef}
          data={loopingItems}
          horizontal
          initialScrollIndex={looping ? loopStartIndex + anchorIndex : 0}
          showsHorizontalScrollIndicator={false}
          snapToOffsets={looping ? loopingItems.filter(item => item.kind === 'event').map(item => getCarouselSlotLayout(item.slot, carouselEvents.length, cardWidth, CARD_GAP, seamWidth).offset) : undefined}
          snapToStart={!looping}
          snapToEnd={!looping}
          disableIntervalMomentum
          bounces={false}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.listContent,
            carouselEvents.length <= 1 && { flexGrow: 1, justifyContent: 'center' }
          ]}
          keyExtractor={item => item.kind === 'seam' ? `seam-${item.slot}` : `carousel-${item.item.id}-${item.slot}`}
          initialNumToRender={4}
          renderItem={({ item: slot }) => {
            if (slot.kind === 'seam') return <View style={[styles.seam, { width: seamWidth }]} pointerEvents="none"
              accessible accessibilityRole="text" accessibilityLabel="First to the right. Last to the left.">
              <View style={styles.seamHalf}><MaterialIcons name="arrow-forward" size={18} color="#F1F5FA" /><Text style={styles.seamText}>First</Text></View>
              <View style={styles.seamHalf}><MaterialIcons name="arrow-back" size={18} color="#F1F5FA" /><Text style={styles.seamText}>Last</Text></View>
              <View style={styles.seamDivider} />
            </View>;
            const { item } = slot;
            // Check if this event has new content and hasn't been viewed yet
            const hasNew = eventNewContentMap.get(item.id) || false;

            const eventContext = getEventContext(item.id);

            // Check if event has been viewed in two ways:
            // 1. Event-level: User clicked this specific event's card in carousel
            // 2. Venue-level: User viewed the full venue via EventCallout
            const eventViewed = carouselViewedEventIds.has(item.id.toString());
            const venueViewed = eventContext
              ? !checkHasNewContent(eventContext.venue.locationKey, eventContext.venueEventIds)
              : false;

            const isViewed = eventViewed || venueViewed;
            const showRedDot = hasNew && !isViewed;

            return (
              <EventCard
                event={item}
                onPress={() => handleCardPress(item)}
                hasNewContent={showRedDot}
                width={cardWidth}
              />
            );
          }}
          getItemLayout={(_data, index) => getCarouselSlotLayout(index, carouselEvents.length, cardWidth, CARD_GAP, seamWidth)}
          onLayout={restoreLayout}
          onContentSizeChange={restoreLayout}
          onScroll={handleCarouselScroll}
          onScrollBeginDrag={beginCarouselDrag}
          onMomentumScrollBegin={clearSettleTimer}
          onMomentumScrollEnd={restoreLoopPosition}
          onScrollEndDrag={() => {
            clearSettleTimer();
            settleTimerRef.current = setTimeout(restoreLoopPosition, 120);
          }}
          scrollEventThrottle={16}
          // Keep the equivalent neighboring cycle mounted before an invisible restore.
          windowSize={Math.max(5, 3 + 2 * Math.ceil(getCarouselPeriod(carouselEvents.length, stride, seamSpan) / railWidth))}
          maxToRenderPerBatch={10}
          removeClippedSubviews={false}
        />

        {/* Pagination Dots */}
        <PaginationDots scrollX={scrollX} itemCount={carouselEvents.length} itemWidth={stride} seamSpan={seamSpan} />
      </Animated.View>

      {/* Render lightbox when carousel card is clicked */}
      {selectedImageData && !isFriendEventDetailRoute && (
        <Modal
          transparent={true}
          visible={true}
          animationType="fade"
          onRequestClose={closeLightbox}
          statusBarTranslucent={true}
          presentationStyle="overFullScreen"
        >
          {/* Reset native swipe position per destination; JS-only resets can stick on Fabric. */}
          <EventImageLightbox
            key={`${selectedImageData.session}:${selectedImageData.event.id}`}
            imageUrl={selectedImageData.imageUrl}
            preferRelevantHero
            event={selectedImageData.event}
            venue={selectedImageData.venue}
            cluster={selectedImageData.cluster}
            onClose={closeLightbox}
            events={carouselEvents}
            currentIndex={selectedImageData.currentIndex}
            onNavigate={handleNavigate}
            loopNavigation
            interestCarouselPaging
            onViewVenue={handleViewVenueFromLightbox}
            isCityEvent={isAreaExperienceEvent(selectedImageData.event)}
          />
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
  },
  listContent: {
    paddingHorizontal: 8,
    gap: CARD_GAP,
  },
  seam: { alignSelf: 'stretch', backgroundColor: '#142735', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#456073' },
  seamHalf: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  seamText: { color: '#F1F5FA', fontSize: 10, fontWeight: '600' },
  seamDivider: { position: 'absolute', top: '50%', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#50616D' },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  mutedTimingImage: {
    opacity: 0.85,
  },
  imageContainer: {
    width: '100%',
    height: CARD_HEIGHT,
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  imageFacetBadges: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 4,
  },
  carouselFamilyFriendlyBadge: {
    marginRight: 4,
  },
  categoryBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  nowBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  nowText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  carouselTimingBadge: {
    marginLeft: 0,
  },
  cardContent: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    height: 62,
  },
  venueOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    maxWidth: CARD_WIDTH - 18,
    minHeight: VENUE_AVATAR_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    backgroundColor: 'rgba(18, 18, 18, 0.76)',
    borderRadius: VENUE_AVATAR_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  venueOverlayWithNow: {
    maxWidth: 100,
  },
  venueAvatarShell: {
    width: VENUE_AVATAR_SIZE,
    height: VENUE_AVATAR_SIZE,
    borderRadius: VENUE_AVATAR_SIZE / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  venueAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: VENUE_AVATAR_SIZE / 2,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
    lineHeight: 16,
  },
  venueOverlayText: {
    flexShrink: 1,
    marginLeft: 5,
    fontSize: 9.5,
    lineHeight: 11,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
    gap: 3,
    marginTop: 'auto',
  },
  timeText: {
    fontSize: 10.5,
    color: '#1967D2',
    fontWeight: '700',
  },
  intrinsicTime: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 1,
  },
  endUnknownSeparator: {
    flex: 1,
    minWidth: 8,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separatorText: {
    color: '#1967D2',
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 14,
    includeFontPadding: false,
    textAlign: 'center',
  },
  // Handle styles
  handleContainer: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    pointerEvents: 'box-none',
  },
  handleWrapper: {
    // Wrapper for pan handlers
  },
  handle: {
    width: 80,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E6E2D6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // Pagination dots
  paginationContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: PAGINATION_HEIGHT,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    backgroundColor: 'rgba(18, 18, 18, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: PAGINATION_HEIGHT / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  paginationDot: {
    backgroundColor: '#FFFFFF',
  },
  // New content indicator
  newDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  newDotWrapper: {
    position: 'absolute',
    top: 0,
    right: 1,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Position to left of NOW badge when it's present
  newDotWrapperWithNow: {
    top: 1,
    right: 3, // Position to left of NOW badge (NOW badge width ~44px + 6px gap)
  },
});

export default InterestsCarousel;
