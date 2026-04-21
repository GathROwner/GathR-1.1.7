import React, { useEffect, useRef, memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Modal,
  PanResponder,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useMapStore } from '../../store';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { Event, Venue, Cluster } from '../../types/events';
import { isEventNow, getEventTimeStatus } from '../../utils/dateUtils';
import FallbackImage from '../common/FallbackImage';
import EventImageLightbox from './EventImageLightbox';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';
import { doesEventMatchInterestCarouselActiveCategory } from '../../utils/interestCarouselFilterUtils';
import { buildHotInterestCarouselEvents } from '../../utils/hotInterestCarouselUtils';
import { registerMapTraceSampler, traceMapEvent } from '../../utils/mapTrace';

const readAnimatedValue = (value: Animated.Value): number | string =>
  typeof (value as any).__getValue === 'function' ? (value as any).__getValue() : 'unknown';

// Constants from InterestFilterPills for consistency
const EVENT_COLOR = '#64B5F6';
const EVENT_SELECTED = '#1976D2';
const SPECIAL_COLOR = '#66BB6A';
const SPECIAL_SELECTED = '#2E7D32';

const CARD_WIDTH = 160;
const CARD_HEIGHT = 120;
const CARD_GAP = 12;
const BOTTOM_SPACING = 0; // Above tab bar
const TAB_BAR_HEIGHT = 40; // Tab bar height (24px icon + padding)

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

// Parse time string and return formatted time
const parseTimeString = (timeStr: string): string | null => {
  // Match time format: "8:00:00 PM", "8:00 PM", or "20:00"
  const timeParts = timeStr.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
  if (!timeParts) return null;

  const hour = parseInt(timeParts[1], 10);
  const minute = timeParts[2];
  const existingAmPm = timeParts[4];

  // Use existing AM/PM if present, otherwise derive from hour (for 24h format)
  const ampm = existingAmPm
    ? existingAmPm.toUpperCase()
    : (hour >= 12 ? 'PM' : 'AM');

  // Convert to 12-hour format if needed
  const displayHour = existingAmPm
    ? hour  // Already in 12-hour format
    : (hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour));

  return `${displayHour}:${minute} ${ampm}`;
};

// Format time display
const formatEventTime = (event: Event): string => {
  const isNow = isEventNow(
    event.startDate,
    event.startTime,
    event.endDate || event.startDate,
    event.endTime || ''
  );

  if (isNow) {
    // Show "NOW – end time" if end time is available
    if (event.endTime && event.endTime !== 'N/A') {
      const endFormatted = parseTimeString(event.endTime);
      if (endFormatted) {
        return `NOW – ${endFormatted}`;
      }
    }
    return 'NOW';
  }

  const timeStatus = getEventTimeStatus(event);
  if (timeStatus === 'today') {
    if (event.startTime) {
      const startFormatted = parseTimeString(event.startTime);
      if (!startFormatted) return 'Today';

      // Add end time if available
      if (event.endTime && event.endTime !== 'N/A') {
        const endFormatted = parseTimeString(event.endTime);
        if (endFormatted) {
          return `${startFormatted} – ${endFormatted}`;
        }
      }

      return startFormatted;
    }
    return 'Today';
  }

  // Show date for future events
  try {
    const date = new Date(event.startDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

// Event Card Component
const EventCard = memo(({ event, onPress, hasNewContent }: { event: Event; onPress: () => void; hasNewContent?: boolean }) => {
  const isNow = isEventNow(
    event.startDate,
    event.startTime,
    event.endDate || event.startDate,
    event.endTime || ''
  );

  const categoryColor = event.type === 'event' ? EVENT_SELECTED : SPECIAL_SELECTED;
  const categoryBgColor = event.type === 'event' ? EVENT_COLOR : SPECIAL_COLOR;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Event Image */}
      <View style={styles.imageContainer}>
        <FallbackImage
          imageUrl={event.imageUrl || event.SharedPostThumbnail}
          category={event.category}
          type={event.type}
          style={styles.eventImage}
          fallbackType="post"
          resizeMode="cover"
        />

        {/* Category Badge */}
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
        <Text style={styles.venueText} numberOfLines={1}>
          {event.venue}
        </Text>
        <View style={styles.timeRow}>
          <MaterialIcons name="schedule" size={12} color="#5F6368" />
          <Text style={styles.timeText}>{formatEventTime(event)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

EventCard.displayName = 'EventCard';

// Pagination Dots Component with dynamic sizing
const PaginationDots = memo(({
  scrollX,
  itemCount
}: {
  scrollX: Animated.Value;
  itemCount: number;
}) => {
  const itemWidth = CARD_WIDTH + CARD_GAP;

  // Create animated dots with size interpolation based on scroll position
  const dots = useMemo(() => {
    return Array.from({ length: itemCount }, (_, index) => {
      // Create input range centered around this dot's position
      // Each dot transitions through: small -> medium -> large -> medium -> small
      const inputRange = [
        (index - 2) * itemWidth,
        (index - 1) * itemWidth,
        index * itemWidth,
        (index + 1) * itemWidth,
        (index + 2) * itemWidth,
      ];

      // Interpolate dot size based on scroll position
      const dotSize = scrollX.interpolate({
        inputRange,
        outputRange: [DOT_SIZE_SMALL, DOT_SIZE_MEDIUM, DOT_SIZE_LARGE, DOT_SIZE_MEDIUM, DOT_SIZE_SMALL],
        extrapolate: 'clamp',
      });

      // Interpolate opacity - larger dots are more visible
      const dotOpacity = scrollX.interpolate({
        inputRange,
        outputRange: [0.4, 0.6, 0.9, 0.6, 0.4],
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
  }, [itemCount, scrollX, itemWidth]);

  // For 3 or fewer items, show all dots as large (all visible)
  if (itemCount <= 3) {
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

type InterestsCarouselProps = {
  hotModeActive?: boolean;
  onDismissHotMode?: () => void;
};

// Main Carousel Component
const InterestsCarousel: React.FC<InterestsCarouselProps> = ({
  hotModeActive = false,
  onDismissHotMode,
}) => {
  const isFocused = useIsFocused();
  const userInterests = useUserPrefsStore((s) => s.interests);
  const {
    onScreenEvents,
    filterCriteria,
    clusters,
    activeFilterPanel,
    setTypeFilters,
  } = useMapStore();

  // Get cluster interaction store for red dot tracking
  const {
    hasNewContent: checkHasNewContent,
    recordInteraction,
    interactions,
    carouselViewedEventIds,
    markCarouselEventViewed,
    markCarouselEventsViewed,
  } = useClusterInteractionStore();

  const categoryCarouselEvents = useMemo(() => {
    return onScreenEvents.filter((event) =>
      doesEventMatchInterestCarouselActiveCategory(event, filterCriteria)
    );
  }, [onScreenEvents, filterCriteria]);

  const hotCarouselEvents = useMemo(
    () =>
      buildHotInterestCarouselEvents({
        onScreenEvents,
        filterCriteria,
        userInterests,
      }),
    [onScreenEvents, filterCriteria, userInterests]
  );

  // Only activate carousel for interest-pills filters, not filter-pills
  const hasInterestPillCategoryFilter =
    filterCriteria.eventFilters.categoryFilterSource === 'interest-pills' ||
    filterCriteria.specialFilters.categoryFilterSource === 'interest-pills';

  const activeMode: 'hot' | 'category' | null = hotModeActive
    ? 'hot'
    : hasInterestPillCategoryFilter
    ? 'category'
    : null;

  const carouselEvents = activeMode === 'hot' ? hotCarouselEvents : categoryCarouselEvents;

  // Determine which events have new content
  // Map from event.id to boolean indicating if event is new
  const eventNewContentMap = useMemo(() => {
    const map = new Map<string | number, boolean>();

    carouselEvents.forEach(event => {
      // Find the cluster and venue this event belongs to
      const cluster = clusters.find((c) =>
        c.venues.some((v) => v.events.some((e) => e.id === event.id))
      );

      if (!cluster) {
        map.set(event.id, false);
        return;
      }

      const venue = cluster.venues.find((v) =>
        v.events.some((e) => e.id === event.id)
      );

      if (!venue) {
        map.set(event.id, false);
        return;
      }

      // Use venue.locationKey as stable ID (same as EventCallout)
      const stableVenueId = venue.locationKey;
      const venueEventIds = venue.events.map(e => e.id.toString());

      // Check if this venue has new content
      const venueHasNew = checkHasNewContent(stableVenueId, venueEventIds);

      map.set(event.id, venueHasNew);
    });

    return map;
  }, [carouselEvents, clusters, checkHasNewContent, interactions]);

  // Local state for lightbox (not mapStore)
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
    venue: Venue;
    cluster: Cluster;
    currentIndex: number;
  } | null>(null);

  // Track whether component should render (stays true during exit animation)
  const [shouldRender, setShouldRender] = useState(false);

  const slideAnim = useRef(new Animated.Value(150)).current; // Start off-screen
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current; // Track horizontal scroll position
  const flatListRef = useRef<FlatList<Event>>(null); // Ref for scrolling carousel

  // Dismissal handler - hot mode closes locally, category mode clears category filters.
  const handleDismiss = useCallback(() => {
    if (hotModeActive) {
      onDismissHotMode?.();
      return;
    }

    // Only clear category filters that were set by interest pills
    if (filterCriteria.eventFilters.categoryFilterSource === 'interest-pills') {
      setTypeFilters('event', { category: undefined });
    }
    if (filterCriteria.specialFilters.categoryFilterSource === 'interest-pills') {
      setTypeFilters('special', { category: undefined });
    }
  }, [hotModeActive, onDismissHotMode, setTypeFilters, filterCriteria]);

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
      hotModeActive,
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
    hotModeActive,
    isVisible,
    opacityAnim,
    selectedImageData,
    slideAnim,
  ]);

  useEffect(() => {
    return registerMapTraceSampler('interests_carousel', () => ({
      activeMode: activeMode ?? 'none',
      isVisible,
      hotModeActive,
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
    hotModeActive,
    isFocused,
    isVisible,
    opacityAnim,
    selectedImageData,
    slideAnim,
  ]);

  // Animate visibility - keep component mounted during exit animation
  useEffect(() => {
    if (isVisible) {
      // Immediately render, then animate in
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
      ]).start();
    } else if (shouldRender) {
      // Animate out, then unmount
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
        if (finished) {
          setShouldRender(false);
        }
      });
    }
  }, [isVisible, slideAnim, opacityAnim, shouldRender]);

  // Handle card press - open lightbox with event details
  const handleCardPress = (event: Event, index: number) => {
    // Find cluster and venue for context
    const cluster = clusters.find((c) =>
      c.venues.some((v) => v.events.some((e) => e.id === event.id))
    );

    if (!cluster) return;

    const venue = cluster.venues.find((v) =>
      v.events.some((e) => e.id === event.id)
    );

    if (!venue) return;

    // Track this individual event as viewed (for carousel red dot removal)
    // This is event-level tracking, NOT venue-level
    markCarouselEventViewed(event.id);

    // Set LOCAL state to show lightbox (not mapStore)
    setSelectedImageData({
      imageUrl: event.imageUrl || event.SharedPostThumbnail || '',
      event: event,
      venue: venue,
      cluster: cluster,
      currentIndex: index,
    });
  };

  // Handle navigation between events in lightbox
  const handleNavigate = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= carouselEvents.length) return;

    const event = carouselEvents[newIndex];
    const cluster = clusters.find((c) =>
      c.venues.some((v) => v.events.some((e) => e.id === event.id))
    );

    if (!cluster) return;

    const venue = cluster.venues.find((v) =>
      v.events.some((e) => e.id === event.id)
    );

    if (!venue) return;

    // Track the new event as viewed when navigating
    markCarouselEventViewed(event.id);

    setSelectedImageData({
      imageUrl: event.imageUrl || event.SharedPostThumbnail || '',
      event: event,
      venue: venue,
      cluster: cluster,
      currentIndex: newIndex,
    });

    // Scroll carousel to match lightbox position
    flatListRef.current?.scrollToIndex({
      index: newIndex,
      animated: true,
      viewPosition: 0.5, // Center the card in view
    });
  }, [carouselEvents, clusters, markCarouselEventViewed]);

  // Handle when user clicks "View Venue" in lightbox
  // This should record venue-level interaction to clear all red dots for that venue
  const handleViewVenueFromLightbox = useCallback(() => {
    if (!selectedImageData) return;

    const venue = selectedImageData.venue;
    const stableVenueId = venue.locationKey;
    const venueEventIds = venue.events.map(e => e.id.toString());

    // Record venue-level interaction (persisted to AsyncStorage)
    recordInteraction(stableVenueId, venueEventIds);

    // Mark all events from this venue as viewed in local state
    markCarouselEventsViewed(venue.events.map((e) => e.id));
  }, [selectedImageData, recordInteraction, markCarouselEventsViewed]);

  if (!shouldRender && !selectedImageData) {
    return null;
  }

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.container,
          {
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
          ref={flatListRef}
          data={carouselEvents}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={carouselEvents.length > 2 ? CARD_WIDTH + CARD_GAP : undefined}
          decelerationRate="fast"
          contentContainerStyle={[
            styles.listContent,
            carouselEvents.length <= 2 && { flexGrow: 1, justifyContent: 'center' }
          ]}
          keyExtractor={(item) => `carousel-${item.id}`}
          renderItem={({ item, index }) => {
            // Check if this event has new content and hasn't been viewed yet
            const hasNew = eventNewContentMap.get(item.id) || false;

            // Find venue for this event
            const cluster = clusters.find((c) =>
              c.venues.some((v) => v.events.some((e) => e.id === item.id))
            );
            const venue = cluster?.venues.find((v) =>
              v.events.some((e) => e.id === item.id)
            );

            // Check if event has been viewed in two ways:
            // 1. Event-level: User clicked this specific event's card in carousel
            // 2. Venue-level: User viewed the full venue via EventCallout
            const eventViewed = carouselViewedEventIds.has(item.id.toString());
            const venueViewed = venue ? !checkHasNewContent(venue.locationKey, venue.events.map(e => e.id.toString())) : false;

            const isViewed = eventViewed || venueViewed;
            const showRedDot = hasNew && !isViewed;

            return (
              <EventCard
                event={item}
                onPress={() => handleCardPress(item, index)}
                hasNewContent={showRedDot}
              />
            );
          }}
          getItemLayout={(_data, index) => ({
            length: CARD_WIDTH + CARD_GAP,
            offset: (CARD_WIDTH + CARD_GAP) * index,
            index,
          })}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
        />

        {/* Pagination Dots */}
        <PaginationDots scrollX={scrollX} itemCount={carouselEvents.length} />
      </Animated.View>

      {/* Render lightbox when carousel card is clicked */}
      {selectedImageData && (
        <Modal
          transparent={true}
          visible={true}
          animationType="fade"
          onRequestClose={() => setSelectedImageData(null)}
          statusBarTranslucent={true}
          presentationStyle="overFullScreen"
        >
          <EventImageLightbox
            imageUrl={selectedImageData.imageUrl}
            event={selectedImageData.event}
            venue={selectedImageData.venue}
            cluster={selectedImageData.cluster}
            onClose={() => setSelectedImageData(null)}
            events={carouselEvents}
            currentIndex={selectedImageData.currentIndex}
            onNavigate={handleNavigate}
            onViewVenue={handleViewVenueFromLightbox}
          />
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: BOTTOM_SPACING + TAB_BAR_HEIGHT - PAGINATION_HEIGHT,
    left: 0,
    right: 0,
    zIndex: 12,
  },
  listContent: {
    paddingHorizontal: 8,
    gap: CARD_GAP,
  },
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
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: '100%',
  },
  categoryBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
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
  cardContent: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
    lineHeight: 16,
  },
  venueText: {
    fontSize: 10,
    color: '#5F6368',
    marginBottom: 3,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  timeText: {
    fontSize: 10,
    color: '#5F6368',
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  paginationDot: {
    backgroundColor: '#333333',
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
