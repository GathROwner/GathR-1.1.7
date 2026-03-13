import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, Text, TouchableOpacity, View, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useMapStore } from '../../store';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';
import { doesEventMatchInterestCarouselBaseFilters } from '../../utils/interestCarouselFilterUtils';

type PillItem = {
  label: string;
  count: number;
  type: 'event' | 'special';
  originalInterests: string[]; // Track original interest names for filtering
  hasNewContent?: boolean; // Whether this category has new content
  newContentCount?: number; // Number of unseen "new" carousel cards in this pill
};

const ITEM_HEIGHT = 48; // Increased spacing between pills (36px pill + 12px gap)
const VISIBLE_ITEMS = 7;
const CLEAR_HOLD_TO_ARM_MS = 850;
const CLEAR_ARMED_AUTO_CANCEL_MS = 4000;

const normalize = (value: string) => value.trim().toLowerCase();

const getShortLabel = (interest: string): string => {
  const lower = normalize(interest);
  if (lower.includes('music')) return 'Music';
  if (lower.includes('trivia')) return 'Trivia';
  if (lower.includes('comedy')) return 'Laugh';
  if (lower.includes('workshop') || lower.includes('class')) return 'Learn';
  if (lower.includes('religious') || lower.includes('church')) return 'Pray';
  if (lower.includes('sport')) return 'Sports';
  if (lower.includes('family')) return 'Family';
  if (lower.includes('gathering') || lower.includes('parties') || lower.includes('party')) return 'Party';
  if (lower.includes('cinema') || lower.includes('movie') || lower.includes('film')) return 'Cinema';
  if (lower.includes('happy hour') || lower.includes('drink')) return 'Drink';
  if (lower.includes('food') || lower.includes('wing')) return 'Food';
  return interest;
};

const getCategoryIconName = (category: string): string => {
  const categoryLower = category.toLowerCase();
  if (categoryLower.includes('live music') || categoryLower.includes('music')) return 'audiotrack';
  if (categoryLower.includes('comedy') || categoryLower.includes('laugh')) return 'sentiment-very-satisfied';
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

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const EVENT_COLOR = '#64B5F6'; // Medium-light blue for unselected
const EVENT_SELECTED = '#1976D2'; // Darker blue when selected
const SPECIAL_COLOR = '#66BB6A'; // Medium-light green for unselected
const SPECIAL_SELECTED = '#2E7D32'; // Darker green when selected

// New content indicator dot component (similar to MapLegend)
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

type InterestFilterPillsProps = {
  onPillInteraction?: () => void;
};

const InterestFilterPills: React.FC<InterestFilterPillsProps> = ({ onPillInteraction }) => {
  const userInterests = useUserPrefsStore((s) => s.interests);
  const isFocused = useIsFocused();

  const {
    filterCriteria,
    setTypeFilters,
    getCategoryFilterCounts,
    activeFilterPanel,
    onScreenEvents,
    clusters,
  } = useMapStore();
  const {
    hasNewContent: checkHasNewContent,
    carouselViewedEventIds,
    interactions,
  } = useClusterInteractionStore();

  const eventCounts = getCategoryFilterCounts('event');
  const specialCounts = getCategoryFilterCounts('special');

  const eventCountByKey = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(eventCounts).forEach(([key, count]) => {
      result[normalize(key)] = count;
    });
    return result;
  }, [eventCounts]);

  const specialCountByKey = useMemo(() => {
    const result: Record<string, number> = {};
    Object.entries(specialCounts).forEach(([key, count]) => {
      result[normalize(key)] = count;
    });
    return result;
  }, [specialCounts]);

  const newContentCountByInterestKey = useMemo(() => {
    const counts: Record<string, number> = {};

    const eligibleOnScreenEvents = onScreenEvents.filter((event) =>
      doesEventMatchInterestCarouselBaseFilters(event, filterCriteria)
    );

    eligibleOnScreenEvents.forEach((event) => {
      if (carouselViewedEventIds.has(event.id.toString())) {
        return;
      }

      const cluster = clusters.find((c) =>
        c.venues.some((v) => v.events.some((e) => e.id === event.id))
      );
      const venue = cluster?.venues.find((v) =>
        v.events.some((e) => e.id === event.id)
      );

      if (!venue) {
        return;
      }

      const venueEventIds = venue.events.map((e) => e.id.toString());
      const venueHasNew = checkHasNewContent(venue.locationKey, venueEventIds);

      if (!venueHasNew) {
        return;
      }

      const categoryKey = normalize(event.category);
      counts[categoryKey] = (counts[categoryKey] ?? 0) + 1;
    });

    return counts;
  }, [onScreenEvents, filterCriteria, clusters, checkHasNewContent, carouselViewedEventIds, interactions]);

  const pills = useMemo<PillItem[]>(() => {
    if (!userInterests || userInterests.length === 0) return [];

    const pillMap = new Map<string, PillItem>();

    userInterests.forEach((interest) => {
      const key = normalize(interest);
      const shortLabel = getShortLabel(interest);
      const eventCount = eventCountByKey[key] ?? 0;
      const specialCount = specialCountByKey[key] ?? 0;
      const newContentCount = newContentCountByInterestKey[key] ?? 0;

      if (eventCount > 0 || specialCount > 0) {
        const existingPill = pillMap.get(shortLabel);

        if (existingPill) {
          // Combine counts for same short label (e.g., "Drink" combines Happy Hour + Drink Specials)
          existingPill.count += (eventCount || specialCount);
          existingPill.originalInterests.push(interest);
          existingPill.newContentCount = (existingPill.newContentCount ?? 0) + newContentCount;
          existingPill.hasNewContent = (existingPill.newContentCount ?? 0) > 0;
        } else {
          pillMap.set(shortLabel, {
            label: shortLabel,
            count: eventCount || specialCount,
            type: eventCount > 0 ? 'event' : 'special',
            originalInterests: [interest],
            hasNewContent: newContentCount > 0,
            newContentCount,
          });
        }
      }
    });

    const pillArray = Array.from(pillMap.values());

    // If a filter-pills category is active, only show pills matching that category
    if (filterCriteria.eventFilters.categoryFilterSource === 'filter-pills' &&
        filterCriteria.eventFilters.category) {
      return pillArray.filter(pill =>
        pill.originalInterests.some(interest =>
          interest.toLowerCase() === filterCriteria.eventFilters.category?.toLowerCase()
        )
      );
    }

    if (filterCriteria.specialFilters.categoryFilterSource === 'filter-pills' &&
        filterCriteria.specialFilters.category) {
      return pillArray.filter(pill =>
        pill.originalInterests.some(interest =>
          interest.toLowerCase() === filterCriteria.specialFilters.category?.toLowerCase()
        )
      );
    }

    return pillArray;
  }, [userInterests, eventCountByKey, specialCountByKey, newContentCountByInterestKey, filterCriteria]);

  const activeEventKey = normalize(filterCriteria.eventFilters.category || '');
  const activeSpecialKey = normalize(filterCriteria.specialFilters.category || '');
  const hasActiveFilter = !!activeEventKey || !!activeSpecialKey;

  const isActive = (item: PillItem) => {
    // Check if any of the original interests match the current filter
    return item.originalInterests.some((interest) => {
      const key = normalize(interest);
      return key === activeEventKey || key === activeSpecialKey;
    });
  };

  const highestCountIndex = useMemo(() => {
    if (!pills.length) return 0;
    let maxIndex = 0;
    let maxCount = pills[0].count;
    for (let i = 1; i < pills.length; i += 1) {
      if (pills[i].count > maxCount) {
        maxCount = pills[i].count;
        maxIndex = i;
      }
    }
    return maxIndex;
  }, [pills]);

  const selectedIndexFromFilters = useMemo(() => {
    if (!pills.length) return 0;

    const activeKey = activeEventKey || activeSpecialKey;
    if (!activeKey) return highestCountIndex;

    const idx = pills.findIndex((item) =>
      item.originalInterests.some((interest) => normalize(interest) === activeKey)
    );
    return idx >= 0 ? idx : highestCountIndex;
  }, [pills, activeEventKey, activeSpecialKey, highestCountIndex]);

  const [activeIndex, setActiveIndex] = useState(selectedIndexFromFilters);
  const listRef = useRef<FlatList<PillItem>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const snapBackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearArmedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdInProgressRef = useRef(false);
  const holdProgress = useRef(new Animated.Value(0)).current;
  const suppressNextPressRef = useRef(false);
  const lastArmedAtRef = useRef<number | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const [holdTargetKey, setHoldTargetKey] = useState<string | null>(null);
  const [pillWidths, setPillWidths] = useState<Record<string, number>>({});
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollbarOpacity = useRef(new Animated.Value(0)).current;
  const scrollbarFadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const expansionAnim = useRef(new Animated.Value(0)).current;
  const visibilityAnim = useRef(new Animated.Value(1)).current;
  const visibilityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPanelStateRef = useRef<string | null>(null);
  const isHiddenRef = useRef(false);

  const needsScrolling = pills.length > VISIBLE_ITEMS;

  const loopedItems = useMemo(() => {
    if (!needsScrolling) return pills;
    return [...pills, ...pills, ...pills];
  }, [pills, needsScrolling]);

  const scrollToCenteredIndex = useCallback(
    (index: number, animated: boolean) => {
      if (!pills.length || !needsScrolling) return;
      const base = pills.length;
      const targetIndex = index + base;
      listRef.current?.scrollToOffset({
        offset: targetIndex * ITEM_HEIGHT,
        animated,
      });
    },
    [pills.length, needsScrolling]
  );

  useEffect(() => {
    setActiveIndex(selectedIndexFromFilters);
    requestAnimationFrame(() => {
      scrollToCenteredIndex(selectedIndexFromFilters, false);
    });
  }, [selectedIndexFromFilters, scrollToCenteredIndex]);

  const cancelClearArmed = useCallback(() => {
    if (clearArmedTimeoutRef.current) {
      clearTimeout(clearArmedTimeoutRef.current);
      clearArmedTimeoutRef.current = null;
    }
    suppressNextPressRef.current = false;
    holdInProgressRef.current = false;
    holdProgress.setValue(0);
    setHoldTargetKey(null);
    setClearArmed(false);
  }, [holdProgress]);

  useEffect(() => {
    if (clearArmed && !hasActiveFilter) {
      cancelClearArmed();
    }
  }, [clearArmed, hasActiveFilter, cancelClearArmed]);

  const handlePress = useCallback(
    (item: PillItem, index: number) => {
      if (snapBackTimeoutRef.current) {
        clearTimeout(snapBackTimeoutRef.current);
        snapBackTimeoutRef.current = null;
      }

      if (suppressNextPressRef.current) {
        const now = Date.now();
        const armedAt = lastArmedAtRef.current ?? 0;
        suppressNextPressRef.current = false;
        if (now - armedAt < 300) {
          return;
        }
      }

      if (clearArmed) {
        onPillInteraction?.();
        setTypeFilters('event', { category: undefined });
        setTypeFilters('special', { category: undefined });
        cancelClearArmed();
        scrollToCenteredIndex(highestCountIndex, true);
        return;
      }

      if (isActive(item)) {
        onPillInteraction?.();
        setTypeFilters('event', { category: undefined });
        setTypeFilters('special', { category: undefined });
        scrollToCenteredIndex(highestCountIndex, true);
        return;
      }

      onPillInteraction?.();

      // Clear both category filters
      setTypeFilters('event', { category: undefined });
      setTypeFilters('special', { category: undefined });

      // Set the category filter for the selected type with interest-pills source
      setTypeFilters(item.type, { category: item.originalInterests[0] }, 'interest-pills');

      // Set the opposite type's category to a special value that will never match
      // This ensures only the selected type shows on the map
      const oppositeType = item.type === 'event' ? 'special' : 'event';
      setTypeFilters(oppositeType, { category: '__FILTER_PILLS_HIDE__' }, 'interest-pills');

      scrollToCenteredIndex(index, true);
    },
    [
      isActive,
      setTypeFilters,
      scrollToCenteredIndex,
      highestCountIndex,
      clearArmed,
      cancelClearArmed,
      onPillInteraction,
    ]
  );

  const fadeOutScrollbar = useCallback(() => {
    if (scrollbarFadeTimeout.current) {
      clearTimeout(scrollbarFadeTimeout.current);
    }
    scrollbarFadeTimeout.current = setTimeout(() => {
      Animated.timing(scrollbarOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 1000);
  }, [scrollbarOpacity]);

  const showScrollbar = useCallback(() => {
    if (scrollbarFadeTimeout.current) {
      clearTimeout(scrollbarFadeTimeout.current);
    }
    Animated.timing(scrollbarOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [scrollbarOpacity]);

  // Expand/collapse handlers
  const toggleExpansion = useCallback((expand: boolean) => {
    setIsExpanded(expand);
    Animated.spring(expansionAnim, {
      toValue: expand ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
      tension: 80,
    }).start();
  }, [expansionAnim]);

  // Pan responder for swipe gestures (works anywhere in panel)
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Don't claim gesture on touch start - let FlatList have a chance
        onStartShouldSetPanResponder: () => false,

        // Only claim when clear horizontal movement detected
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const { dx, dy } = gestureState;

          // Don't capture horizontal gestures when carousel is visible
          // (carousel is visible when a category filter is active)
          const hasActiveCategoryFilter =
            !!filterCriteria.eventFilters.category ||
            !!filterCriteria.specialFilters.category;
          if (hasActiveCategoryFilter) {
            return false;
          }

          // Must satisfy ALL conditions:
          // 1. Primarily horizontal (|dx| > |dy|)
          // 2. Past minimum threshold (15px)
          // 3. Strong horizontal bias (|dx| > |dy| * 1.5)
          const isPrimarilyHorizontal = Math.abs(dx) > Math.abs(dy);
          const exceededThreshold = Math.abs(dx) > 15;
          const hasHorizontalBias = Math.abs(dx) > Math.abs(dy) * 1.5;

          return isPrimarilyHorizontal && exceededThreshold && hasHorizontalBias;
        },

        onPanResponderGrant: () => {
          // Optional: Add visual feedback when gesture is captured
        },

        onPanResponderMove: () => {
          // Optional: Live drag feedback (visual indicator of expansion progress)
          // For now, keep simple - just wait for release
        },

        onPanResponderRelease: (_, gestureState) => {
          const { dx, vx } = gestureState;

          // Swipe left to expand (negative dx)
          if (!isExpanded && (dx < -30 || vx < -0.3)) {
            toggleExpansion(true);
          }
          // Swipe right to collapse (positive dx)
          else if (isExpanded && (dx > 30 || vx > 0.3)) {
            toggleExpansion(false);
          }
        },

        onPanResponderTerminate: () => {
          // Reset if another gesture takes over
        },
      }),
    [isExpanded, toggleExpansion, filterCriteria]
  );

  // Auto-collapse when tab changes or map is interacted with
  useEffect(() => {
    if (!isFocused && isExpanded) {
      toggleExpansion(false);
    }
  }, [isFocused, isExpanded, toggleExpansion]);

  useEffect(() => {
    if (activeFilterPanel && isExpanded) {
      toggleExpansion(false);
    }
  }, [activeFilterPanel, isExpanded, toggleExpansion]);

  // Animate visibility when filter panel opens/closes
  // Debounce to prevent flickering during panel switches when activePanel briefly becomes null
  useEffect(() => {
    // If any panel is open, hide immediately and clear any pending show timeout
    if (activeFilterPanel) {
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      lastPanelStateRef.current = activeFilterPanel;
      if (!isHiddenRef.current) {
        isHiddenRef.current = true;
        Animated.timing(visibilityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }
    }
    // If panel is null and we were previously showing a panel, wait before showing
    else if (!activeFilterPanel && lastPanelStateRef.current) {
      // Don't clear existing timeout - let it continue
      // Only start a new timeout if one isn't already running
      if (!visibilityTimeoutRef.current) {
        visibilityTimeoutRef.current = setTimeout(() => {
          lastPanelStateRef.current = null;
          isHiddenRef.current = false;
          visibilityTimeoutRef.current = null;
          Animated.timing(visibilityAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }, 500);
      }
    }
  }, [activeFilterPanel, visibilityAnim]);

  const handleMomentumEnd = useCallback(
    (offsetY: number) => {
      const base = pills.length;
      if (!base || !needsScrolling) return;

      if (snapBackTimeoutRef.current) {
        clearTimeout(snapBackTimeoutRef.current);
        snapBackTimeoutRef.current = null;
      }

      const rawIndex = Math.round(offsetY / ITEM_HEIGHT);
      const normalizedIndex = ((rawIndex % base) + base) % base;
      setActiveIndex(normalizedIndex);

      const min = base;
      const max = base * 2 - 1;
      if (rawIndex < min || rawIndex > max) {
        const recenterIndex = normalizedIndex + base;
        listRef.current?.scrollToOffset({
          offset: recenterIndex * ITEM_HEIGHT,
          animated: false,
        });
      }

      if (normalizedIndex !== selectedIndexFromFilters) {
        snapBackTimeoutRef.current = setTimeout(() => {
          scrollToCenteredIndex(selectedIndexFromFilters, true);
          snapBackTimeoutRef.current = null;
        }, 2200);
      }

      fadeOutScrollbar();
    },
    [pills.length, selectedIndexFromFilters, scrollToCenteredIndex, needsScrolling, fadeOutScrollbar]
  );

  if (pills.length === 0) return null;

  // Calculate scrollbar thumb position and height
  const containerHeight = ITEM_HEIGHT * VISIBLE_ITEMS;
  const contentHeight = pills.length * ITEM_HEIGHT;
  const scrollbarHeight = containerHeight;
  const thumbHeight = Math.max(30, (containerHeight / contentHeight) * scrollbarHeight);

  // Calculate thumb position based on scroll offset
  const base = pills.length;
  const currentRawIndex = Math.round(scrollOffset / ITEM_HEIGHT);
  const normalizedScrollIndex = ((currentRawIndex % base) + base) % base;
  const scrollPercentage = normalizedScrollIndex / (pills.length - 1);
  const thumbPosition = scrollPercentage * (scrollbarHeight - thumbHeight);

  // Determine thumb color based on active pill type
  const activePill = pills[activeIndex];
  const thumbColor = activePill?.type === 'event' ? EVENT_SELECTED : SPECIAL_SELECTED;

  // Interpolate label width and spacing based on expansion
  const labelWidth = expansionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 100], // 0 when collapsed, auto-size when expanded
  });

  const labelOpacity = expansionAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1], // Delay opacity until width starts expanding
  });

  const iconMargin = expansionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 6],
  });

  const countMargin = expansionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 8], // Tighter spacing when collapsed
  });

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.container, { opacity: visibilityAnim }]}
      pointerEvents={activeFilterPanel ? 'none' : 'box-none'}
    >
      {/* Swipeable handle */}
      <View style={styles.handleContainer}>
        <TouchableOpacity
          style={styles.handle}
          onPress={() => toggleExpansion(!isExpanded)}
          activeOpacity={0.7}
        />
      </View>
      <Animated.FlatList
        ref={listRef}
        data={loopedItems}
        keyExtractor={(_item, index) => `interest-pill-${index}`}
        showsVerticalScrollIndicator={false}
        scrollEnabled={needsScrolling}
        bounces={needsScrolling}
        decelerationRate={needsScrolling ? "fast" : "normal"}
        snapToInterval={needsScrolling ? ITEM_HEIGHT : undefined}
        getItemLayout={(_data, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        contentContainerStyle={[
          styles.listContent,
          needsScrolling ? { paddingVertical: (VISIBLE_ITEMS * ITEM_HEIGHT - ITEM_HEIGHT) / 2 } : {},
        ]}
        onMomentumScrollEnd={(event) => {
          handleMomentumEnd(event.nativeEvent.contentOffset.y);
        }}
        onScrollBeginDrag={() => {
          if (snapBackTimeoutRef.current) {
            clearTimeout(snapBackTimeoutRef.current);
            snapBackTimeoutRef.current = null;
          }
          if (clearArmedTimeoutRef.current) {
            clearTimeout(clearArmedTimeoutRef.current);
            clearArmedTimeoutRef.current = null;
          }
          cancelClearArmed();
          showScrollbar();
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: (event: any) => {
              setScrollOffset(event.nativeEvent.contentOffset.y);
            },
          }
        )}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          const baseIndex = pills.length
            ? ((index % pills.length) + pills.length) % pills.length
            : 0;
          const selected = isActive(item);
          const key = `${item.type}-${item.label}`;
          const isHoldTarget = holdTargetKey === key;
          const pillWidth = pillWidths[key] ?? 0;

          // Determine if this pill is at the top or bottom visible position
          // Calculate the current centered index based on scroll position
          const currentCenteredRawIndex = Math.round(scrollOffset / ITEM_HEIGHT);
          const paddingItems = Math.floor((VISIBLE_ITEMS - 1) / 2);
          const topVisibleRawIndex = currentCenteredRawIndex - paddingItems;
          const bottomVisibleRawIndex = currentCenteredRawIndex + paddingItems;
          const isTopPill = needsScrolling && index === topVisibleRawIndex;
          const isBottomPill = needsScrolling && index === bottomVisibleRawIndex;

          // Selected pills get a scale boost for emphasis
          const scale = selected ? 1.05 : 1;

          const holdFillWidth = holdProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, pillWidth],
          });

          return (
            <Animated.View style={[styles.itemWrapper, { transform: [{ scale }] }]}>
              <AnimatedTouchableOpacity
                activeOpacity={0.85}
                onPress={() => handlePress(item, baseIndex)}
                onPressIn={() => {
                  if (!hasActiveFilter || !selected) return;
                  holdInProgressRef.current = true;
                  setHoldTargetKey(key);
                  holdProgress.setValue(0);
                  Animated.timing(holdProgress, {
                    toValue: 1,
                    duration: CLEAR_HOLD_TO_ARM_MS,
                    useNativeDriver: false,
                  }).start();
                }}
                onPressOut={() => {
                  if (clearArmed) return;
                  holdInProgressRef.current = false;
                  Animated.timing(holdProgress, {
                    toValue: 0,
                    duration: 120,
                    useNativeDriver: false,
                  }).start(() => {
                    setHoldTargetKey(null);
                  });
                }}
                onLongPress={() => {
                  if (!hasActiveFilter || !selected) return;
                  suppressNextPressRef.current = true;
                  lastArmedAtRef.current = Date.now();
                  holdInProgressRef.current = false;
                  holdProgress.setValue(1);
                  setClearArmed(true);
                  if (clearArmedTimeoutRef.current) {
                    clearTimeout(clearArmedTimeoutRef.current);
                  }
                  clearArmedTimeoutRef.current = setTimeout(() => {
                    cancelClearArmed();
                    clearArmedTimeoutRef.current = null;
                  }, CLEAR_ARMED_AUTO_CANCEL_MS);
                }}
                onLayout={(e) => {
                  const width = e.nativeEvent.layout.width;
                  setPillWidths((prev) => (prev[key] === width ? prev : { ...prev, [key]: width }));
                }}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selected
                      ? item.type === 'event'
                        ? EVENT_SELECTED
                        : SPECIAL_SELECTED
                      : item.type === 'event'
                      ? EVENT_COLOR
                      : SPECIAL_COLOR,
                  },
                  clearArmed && selected && styles.clearArmed,
                ]}
              >
                {isHoldTarget && (clearArmed || holdInProgressRef.current) && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.clearHoldFill,
                      { width: holdFillWidth },
                    ]}
                  />
                )}
                <Animated.View style={{ marginRight: iconMargin }}>
                  {item.label === 'Learn' ? (
                    <Ionicons
                      name="school"
                      size={18}
                      color={
                        selected
                          ? '#FFFFFF'
                          : item.type === 'event'
                          ? '#0D47A1'
                          : '#1B5E20'
                      }
                    />
                  ) : (
                    <MaterialIcons
                      name={getCategoryIconName(item.label) as any}
                      size={18}
                      color={
                        selected
                          ? '#FFFFFF'
                          : item.type === 'event'
                          ? '#0D47A1'
                          : '#1B5E20'
                      }
                    />
                  )}
                </Animated.View>
                <Animated.Text
                  style={[
                    styles.pillText,
                    selected && styles.pillTextActive,
                    {
                      opacity: labelOpacity,
                      maxWidth: labelWidth,
                      overflow: 'hidden',
                    }
                  ]}
                >
                  {item.label}
                </Animated.Text>
                <Animated.View
                  style={[
                    styles.countBadge,
                    selected && styles.countBadgeActive,
                    clearArmed && selected && styles.countBadgeClear,
                    { marginLeft: countMargin, position: 'relative' },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      selected && styles.countTextActive,
                      clearArmed && selected && styles.countTextClear,
                    ]}
                  >
                    {clearArmed && selected ? 'Clear' : item.count}
                  </Text>
                  {item.hasNewContent && !clearArmed && (
                    <View style={styles.newDotWrapper}>
                      <NewContentDot />
                    </View>
                  )}
                </Animated.View>
                {isTopPill && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.7)', 'rgba(255, 255, 255, 0)']}
                    style={styles.pillGradientTop}
                    pointerEvents="none"
                  />
                )}
                {isBottomPill && (
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.7)']}
                    style={styles.pillGradientBottom}
                    pointerEvents="none"
                  />
                )}
              </AnimatedTouchableOpacity>
            </Animated.View>
          );
        }}
      />
      {needsScrolling && (
        <View style={styles.scrollbarContainer} pointerEvents="none">
          {/* Scrollbar track */}
          <View style={styles.scrollbarTrack} />
          {/* Scrollbar thumb */}
          <Animated.View
            style={[
              styles.scrollbarThumb,
              {
                height: thumbHeight,
                backgroundColor: thumbColor,
                opacity: scrollbarOpacity,
                transform: [{ translateY: thumbPosition }],
              },
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    height: ITEM_HEIGHT * VISIBLE_ITEMS,
    position: 'relative',
  },
  listContent: {
    alignItems: 'flex-end',
  },
  itemWrapper: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  icon: {
    marginRight: 0,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  countBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  countTextActive: {
    color: '#FFFFFF',
  },
  clearArmed: {
    borderColor: '#FF3B30',
  },
  clearHoldFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(176, 0, 32, 0.92)',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  countBadgeClear: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  countTextClear: {
    color: '#FF3B30',
  },
  pillGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    borderRadius: 15,
  },
  pillGradientBottom: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    borderRadius: 15,
  },
  scrollbarContainer: {
    position: 'absolute',
    right: -8,
    top: 0,
    bottom: 0,
    width: 4,
    justifyContent: 'flex-start',
  },
  scrollbarTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    left: 1,
    backgroundColor: '#E6E2D6',
    borderRadius: 1,
  },
  scrollbarThumb: {
    position: 'absolute',
    width: 4,
    left: 0,
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  handleContainer: {
    position: 'absolute',
    left: -8,
    top: 0,
    bottom: 0,
    width: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
    pointerEvents: 'box-none',
  },
  handleWrapper: {
    // Wrapper for pan handlers - only covers the handle area
  },
  handle: {
    width: 4,
    height: 40,
    backgroundColor: '#9AA0A6',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  newDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  newDotWrapper: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default InterestFilterPills;
