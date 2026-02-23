import React, { useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useMapStore } from '../../store';
import { TimeFilterType } from '../../types';
import TimeFilterOptions from './TimeFilterOptions';
import CategoryFilterOptions from './CategoryFilterOptions';
import { isEventNow, isEventHappeningToday } from '../../utils/dateUtils';



const FilterPills = () => {
  // Use explicit selectors to ensure Zustand triggers re-renders when these change
  const events = useMapStore((state) => state.events);
  const filteredEvents = useMapStore((state) => state.filteredEvents);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const setFilterCriteria = useMapStore((state) => state.setFilterCriteria);
  const setTypeFilters = useMapStore((state) => state.setTypeFilters);
  const activePanel = useMapStore((state) => state.activeFilterPanel);
  const setActivePanel = useMapStore((state) => state.setActiveFilterPanel);
  const getTimeFilterCounts = useMapStore((state) => state.getTimeFilterCounts);
  const getCategoryFilterCounts = useMapStore((state) => state.getCategoryFilterCounts);
  const onScreenEvents = useMapStore((state) => state.onScreenEvents);

  // Escape hatch: If ANY filter panel is opened while we're armed, cancel the armed state.
  React.useEffect(() => {
    if (eventsClearArmedRef.current && activePanel) {
      console.log('🧯 activePanel opened while Events clear armed → cancelling armed state');
      cancelEventsClearArmed('panel-opened');
    }
  }, [activePanel]);
  
  // Separate opacity for each panel - both always rendered
  const eventsPanelOpacity = useRef(new Animated.Value(0)).current;
  const specialsPanelOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  
  // --- Hold-to-arm "Clear filters" for Events pill ---
  const EVENTS_CLEAR_HOLD_TO_ARM_MS = 850;
  const EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS = 4000;

  const [eventsPillWidth, setEventsPillWidth] = React.useState(0);
  const [eventsClearArmed, setEventsClearArmed] = React.useState(false);

  const eventsClearFillAnim = useRef(new Animated.Value(0)).current;
  const eventsClearHoldInProgressRef = useRef(false);
  const eventsClearSuppressNextChevronPressRef = useRef(false);
  const eventsClearAutoCancelTimeoutRef = useRef<any>(null);
  const eventsClearArmedRef = useRef(false);

  // --- Specials Clear Logic ---
  const [specialsPillWidth, setSpecialsPillWidth] = React.useState(0);
  const [specialsClearArmed, setSpecialsClearArmed] = React.useState(false);
  const specialsClearFillAnim = useRef(new Animated.Value(0)).current;
  const specialsClearHoldInProgressRef = useRef(false);
  const specialsClearSuppressNextChevronPressRef = useRef(false);
  const specialsClearAutoCancelTimeoutRef = useRef<any>(null);
  const specialsClearArmedRef = useRef(false);

  const setGlobalEventsClearGestureActive = (isActive: boolean) => {
    // We keep this global name so Map.tsx doesn't need to change
    (global as any).gathrEventsClearGestureActive = isActive;
  };

  React.useEffect(() => {
    eventsClearArmedRef.current = eventsClearArmed;
    specialsClearArmedRef.current = specialsClearArmed;
    setGlobalEventsClearGestureActive(
      eventsClearArmed || eventsClearHoldInProgressRef.current || 
      specialsClearArmed || specialsClearHoldInProgressRef.current
    );
  }, [eventsClearArmed, specialsClearArmed]);

  const cancelEventsClearArmed = (reason: string, resetSuppressNextChevronPress: boolean = true) => {
    // Always clear the timer, even if we're not currently armed.
    if (eventsClearAutoCancelTimeoutRef.current) {
      clearTimeout(eventsClearAutoCancelTimeoutRef.current);
      eventsClearAutoCancelTimeoutRef.current = null;
    }

    if (!eventsClearArmedRef.current && !eventsClearHoldInProgressRef.current) {
      // Nothing to cancel, but ensure we don't leave the global flag stuck "on".
      setGlobalEventsClearGestureActive(false);

      if (resetSuppressNextChevronPress) {
        eventsClearSuppressNextChevronPressRef.current = false;
      }
      return;
    }

    console.log('↩️ Cancel Events clear (armed/hold):', reason);

    eventsClearHoldInProgressRef.current = false;
    setGlobalEventsClearGestureActive(false);

    if (resetSuppressNextChevronPress) {
      eventsClearSuppressNextChevronPressRef.current = false;
    }

    setEventsClearArmed(false);

    Animated.timing(eventsClearFillAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: false
    }).start(() => {
      console.log('✅ Events clear overlay reset complete');
    });
  };

  // Let the map screen cancel the "armed" state using the same proven mechanism as panel close-on-map-tap.
React.useEffect(() => {
    (global as any).gathrCancelEventsClearArmed = (reason: string = 'map-press') => {
      console.log('🧯 Global cancel invoked for Filter pills:', reason);
      cancelEventsClearArmed(reason);
      cancelSpecialsClearArmed(reason);
    };

    return () => {
      if ((global as any).gathrCancelEventsClearArmed) {
        delete (global as any).gathrCancelEventsClearArmed;
      }
      if ((global as any).gathrEventsClearGestureActive !== undefined) {
        delete (global as any).gathrEventsClearGestureActive;
      }
    };
  }, []);

  const confirmClearEventsFilters = () => {
    console.log('🧹 CONFIRM: Clear Event filters');
    setTypeFilters('event', { timeFilter: TimeFilterType.ALL, category: undefined });
    cancelEventsClearArmed('confirmed-clear');
  };

  const cancelSpecialsClearArmed = (reason: string, resetSuppressNextChevronPress: boolean = true) => {
    if (specialsClearAutoCancelTimeoutRef.current) {
      clearTimeout(specialsClearAutoCancelTimeoutRef.current);
      specialsClearAutoCancelTimeoutRef.current = null;
    }
    if (!specialsClearArmedRef.current && !specialsClearHoldInProgressRef.current) {
      setGlobalEventsClearGestureActive(false); // Fix: setGlobalEventsClearGestureActive
      if (resetSuppressNextChevronPress) specialsClearSuppressNextChevronPressRef.current = false;
      return;
    }
    specialsClearHoldInProgressRef.current = false;
    setGlobalEventsClearGestureActive(false); // Fix: setGlobalEventsClearGestureActive
    if (resetSuppressNextChevronPress) specialsClearSuppressNextChevronPressRef.current = false;
    setSpecialsClearArmed(false);
    Animated.timing(specialsClearFillAnim, { toValue: 0, duration: 180, useNativeDriver: false }).start();
  };

  const confirmClearSpecialsFilters = () => {
    console.log('🧹 CONFIRM: Clear Special filters');
    setTypeFilters('special', { timeFilter: TimeFilterType.ALL, category: undefined });
    cancelSpecialsClearArmed('confirmed-clear');
  };

  const startSpecialsHoldToArmClear = () => {
    if (!specialsPillHasActiveFilters || specialsClearArmedRef.current) return;
    specialsClearHoldInProgressRef.current = true;
    setGlobalEventsClearGestureActive(true); // Fix: setGlobalEventsClearGestureActive
    specialsClearSuppressNextChevronPressRef.current = true;
    specialsClearFillAnim.setValue(0);
    Animated.timing(specialsClearFillAnim, {
      toValue: 1,
      duration: EVENTS_CLEAR_HOLD_TO_ARM_MS,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (!finished || !specialsClearHoldInProgressRef.current) return;
      specialsClearHoldInProgressRef.current = false;
      setSpecialsClearArmed(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (specialsClearAutoCancelTimeoutRef.current) clearTimeout(specialsClearAutoCancelTimeoutRef.current);
      specialsClearAutoCancelTimeoutRef.current = setTimeout(() => {
        cancelSpecialsClearArmed('auto-timeout');
      }, EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS);
    });
  };

  const startEventsHoldToArmClear = () => {
    if (!eventsPillHasActiveFilters) {
      console.log('⏭️ Events hold-to-arm ignored (no active event filters)');
      return;
    }
    if (eventsClearArmedRef.current) {
      console.log('⏭️ Events hold-to-arm ignored (already armed)');
      return;
    }

    console.log('🟥 Events hold-to-arm START');
    eventsClearHoldInProgressRef.current = true;
    setGlobalEventsClearGestureActive(true);
    eventsClearSuppressNextChevronPressRef.current = true;

    eventsClearFillAnim.setValue(0);

    Animated.timing(eventsClearFillAnim, {
      toValue: 1,
      duration: EVENTS_CLEAR_HOLD_TO_ARM_MS,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (!finished) {
        console.log('🟡 Events hold-to-arm animation not finished (cancelled)');
        return;
      }

      if (!eventsClearHoldInProgressRef.current) {
        console.log('🟡 Events hold-to-arm finished, but hold is no longer active (likely cancelled)');
        return;
      }

      console.log('✅ Events hold-to-arm COMPLETE → ARMED');
      eventsClearHoldInProgressRef.current = false;
      setEventsClearArmed(true);

      try {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        console.log('⚠️ Haptics failed (safe to ignore):', e);
      }

      if (eventsClearAutoCancelTimeoutRef.current) {
        clearTimeout(eventsClearAutoCancelTimeoutRef.current);
      }
      eventsClearAutoCancelTimeoutRef.current = setTimeout(() => {
        cancelEventsClearArmed('auto-timeout');
      }, EVENTS_CLEAR_ARMED_AUTO_CANCEL_MS);
    });
  };
  
  // Tutorial highlighting
  const [tutorialHighlight, setTutorialHighlight] = React.useState(false);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightFilterPills || false;
      if (globalFlag !== tutorialHighlight) {
        setTutorialHighlight(globalFlag);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [tutorialHighlight]);
  
  const tutorialPulseAnim = useRef(new Animated.Value(1)).current;
  
  React.useEffect(() => {
    if (tutorialHighlight) {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(tutorialPulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: true
          }),
          Animated.timing(tutorialPulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true
          })
        ]).start(({ finished }) => {
          if (finished && tutorialHighlight) pulse();
        });
      };
      pulse();
    } else {
      tutorialPulseAnim.stopAnimation();
      tutorialPulseAnim.setValue(1);
    }
    return () => tutorialPulseAnim.stopAnimation();
  }, [tutorialHighlight, tutorialPulseAnim]);
  
  // Calculate counts from ONLY viewport data - updates as viewport changes
  const eventsData = useMemo(() => {
    return onScreenEvents.filter(e => e.type === 'event');
  }, [onScreenEvents]);

  const specialsData = useMemo(() => {
    return onScreenEvents.filter(e => e.type === 'special');
  }, [onScreenEvents]);

  const totalEvents = eventsData.length;
  const totalSpecials = specialsData.length;

  // Calculate filtered counts from on-screen events only (using store's existing logic)
  // IMPORTANT: Recalculate when onScreenEvents or filterCriteria changes
  const eventFilterCounts = useMemo(() => getTimeFilterCounts('event'), [onScreenEvents, filterCriteria]);
  const specialFilterCounts = useMemo(() => getTimeFilterCounts('special'), [onScreenEvents, filterCriteria]);

  const visibleEvents = eventFilterCounts[filterCriteria.eventFilters.timeFilter];
  const visibleSpecials = specialFilterCounts[filterCriteria.specialFilters.timeFilter];

  // Debug logging for FilterPills
  console.log('[FilterPills] Counts updated:', {
    onScreenEventsCount: onScreenEvents.length,
    totalEvents,
    totalSpecials,
    visibleEvents,
    visibleSpecials,
    activeTimeFilter: filterCriteria.eventFilters.timeFilter,
    eventFilterCounts,
    specialFilterCounts
  });
  
  // Ref to prevent map from closing during panel transitions
  const isSwitchingPanels = useRef(false);
  const switchingToPanel = useRef<'events' | 'specials' | null>(null);

  // During a transition, treat the "target" panel as active for pointerEvents/zIndex logic
  const effectivePanel =
    isSwitchingPanels.current && switchingToPanel.current ? switchingToPanel.current : activePanel;

  // Main toggle function - handles ALL scenarios
  const togglePanel = (panel: 'events' | 'specials' | null) => {
    console.log('🎯 togglePanel called:', { 
      requestedPanel: panel, 
      currentActivePanel: activePanel,
      timestamp: Date.now()
    });

    if (panel !== null && (eventsClearArmedRef.current || eventsClearHoldInProgressRef.current)) {
      console.log('🧯 togglePanel invoked while Events clear is armed/holding → cancelling first');
      cancelEventsClearArmed('open-panel');
    }

    if (panel === null) {
      // CLOSE ALL - from X button or background click
      console.log('❌ CLOSE ALL - Setting activePanel to null');
      setActivePanel(null);
      Animated.parallel([
        Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 0, useNativeDriver: true })
      ]).start(() => {
        console.log('✅ CLOSE ALL animation complete');
      });
    } else if (panel === 'events') {
      if (activePanel === 'events') {
        // CLOSE Events (clicking same chevron)
        console.log('❌ CLOSE Events - Same chevron clicked');
        setActivePanel(null);
        Animated.parallel([
          Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 0, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ CLOSE Events animation complete');
        });
      } else if (activePanel === 'specials') {
        // SWITCH from Specials to Events (overlay stays visible)
        console.log('🔄 SWITCH from Specials to Events - Setting state immediately, then cross-fading');
        isSwitchingPanels.current = true;
        switchingToPanel.current = 'events';

        setActivePanel('events');
        Animated.sequence([
          Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(eventsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ SWITCH to Events complete');

          // Ensure state is still correct (map might have changed it during transition)
          const currentPanel = useMapStore.getState().activeFilterPanel;
          if (currentPanel !== 'events') {
            console.log('⚠️ State was changed during transition, restoring to events');
            setActivePanel('events');
          }

          switchingToPanel.current = null;
          isSwitchingPanels.current = false;
        });

      } else {
        // OPEN Events (no panel currently open)
        console.log('✅ OPEN Events - No panel was open');
        setActivePanel('events');
        Animated.parallel([
          Animated.timing(eventsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ OPEN Events animation complete');
        });
      }
    } else if (panel === 'specials') {
      if (activePanel === 'specials') {
        // CLOSE Specials (clicking same chevron)
        console.log('❌ CLOSE Specials - Same chevron clicked');
        setActivePanel(null);
        Animated.parallel([
          Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 0, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ CLOSE Specials animation complete');
        });
      } else if (activePanel === 'events') {
        // SWITCH from Events to Specials (overlay stays visible)
        console.log('🔄 SWITCH from Events to Specials - Setting state immediately, then cross-fading');
        isSwitchingPanels.current = true;
        switchingToPanel.current = 'specials';

        setActivePanel('specials');
        Animated.sequence([
          Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          Animated.timing(specialsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ SWITCH to Specials complete');

          // Ensure state is still correct (map might have changed it during transition)
          const currentPanel = useMapStore.getState().activeFilterPanel;
          if (currentPanel !== 'specials') {
            console.log('⚠️ State was changed during transition, restoring to specials');
            setActivePanel('specials');
          }

          switchingToPanel.current = null;
          isSwitchingPanels.current = false;
        });

      } else {
        // OPEN Specials (no panel currently open)
        console.log('✅ OPEN Specials - No panel was open');
        setActivePanel('specials');
        Animated.parallel([
          Animated.timing(specialsPanelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 150, useNativeDriver: true })
        ]).start(() => {
          console.log('✅ OPEN Specials animation complete');
        });
      }
    }
  };
  
  // Debug: Track activePanel changes
  React.useEffect(() => {
    console.log('📊 activePanel changed to:', activePanel);
  }, [activePanel]);
  
  // Sync animations when activePanel changes externally, but not during switches
  React.useEffect(() => {
    if (activePanel === null && !isSwitchingPanels.current) {
      console.log('🔄 activePanel set to null externally, closing animations');
      Animated.parallel([
        Animated.timing(eventsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(specialsPanelOpacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 0, useNativeDriver: true })
      ]).start();
    }
  }, [activePanel]);
  
  const toggleEvents = () => {
    setFilterCriteria({ showEvents: !filterCriteria.showEvents });
  };
  
  const toggleSpecials = () => {
    if (eventsClearArmedRef.current) {
      console.log('🧯 Specials pill pressed while Events clear is armed → cancel only');
      cancelEventsClearArmed('tap-elsewhere');
      return;
    }
    setFilterCriteria({ showSpecials: !filterCriteria.showSpecials });
  };

  const getTimeFilterDisplayText = (timeFilter: TimeFilterType): string => {
    switch (timeFilter) {
      case TimeFilterType.NOW: return 'Now';
      case TimeFilterType.TODAY: return 'Today';
      case TimeFilterType.TOMORROW: return 'Tomorrow';
      case TimeFilterType.UPCOMING: return 'Upcoming';
      default: return '';
    }
  };

  const getPillDisplayText = (type: 'events' | 'specials'): string => {
    const timeFilter = type === 'events' 
      ? filterCriteria.eventFilters.timeFilter
      : filterCriteria.specialFilters.timeFilter;
    const timeText = getTimeFilterDisplayText(timeFilter);
    return timeText || (type === 'events' ? 'Events' : 'Specials');
  };

  const HIDE_SENTINEL = '__FILTER_PILLS_HIDE__';

  const isVisibleCategory = (category?: string): category is string =>
    !!category && category !== HIDE_SENTINEL;

  const isSentinelCategory = (category?: string) => category === HIDE_SENTINEL;

  const getCategoryIconName = (category: string): string => {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('live music') || categoryLower.includes('music')) return 'audiotrack';
    if (categoryLower.includes('comedy')) return 'sentiment-very-satisfied';
    if (categoryLower.includes('sport')) return 'sports-basketball';
    if (categoryLower.includes('trivia')) return 'psychology-alt';
    if (categoryLower.includes('workshop') || categoryLower.includes('class')) return 'school';
    if (categoryLower.includes('religious') || categoryLower.includes('church')) return 'church';
    if (categoryLower.includes('family')) return 'family-restroom';
    if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) return 'nightlife';
    if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) return 'theaters';
    if (categoryLower.includes('happy hour')) return 'local-bar';
    if (categoryLower.includes('food') || categoryLower.includes('wing')) return 'restaurant';
    if (categoryLower.includes('drink')) return 'wine-bar';
    return 'category';
   };
  
  const eventsPillHasActiveFilters =
    filterCriteria.showEvents &&
    !isSentinelCategory(filterCriteria.eventFilters.category) &&
    (filterCriteria.eventFilters.timeFilter !== TimeFilterType.ALL ||
      isVisibleCategory(filterCriteria.eventFilters.category));

  const specialsPillHasActiveFilters =
    filterCriteria.showSpecials &&
    !isSentinelCategory(filterCriteria.specialFilters.category) &&
    (filterCriteria.specialFilters.timeFilter !== TimeFilterType.ALL ||
      isVisibleCategory(filterCriteria.specialFilters.category));

  React.useEffect(() => {
    if (eventsClearArmedRef.current && !eventsPillHasActiveFilters) {
      cancelEventsClearArmed('filters-cleared-externally');
    }
    if (specialsClearArmedRef.current && !specialsPillHasActiveFilters) {
      cancelSpecialsClearArmed('filters-cleared-externally');
    }
  }, [eventsPillHasActiveFilters, specialsPillHasActiveFilters]);
  
  const viewRef = useRef<View>(null);

  return (
    <View style={[styles.container, tutorialHighlight && { zIndex: 99999 }]}>
      {(eventsClearArmed || specialsClearArmed) && (
        <TouchableOpacity
          style={styles.eventsClearArmedOverlay}
          activeOpacity={1}
          onPress={() => {
            cancelEventsClearArmed('tap-outside');
            cancelSpecialsClearArmed('tap-outside');
          }}
        />
      )}

      {/* Filter Pills */}
      <Animated.View
        ref={viewRef}
        onLayout={() => {
          if (viewRef.current) {
            viewRef.current.measure((x, y, width, height, pageX, pageY) => {
              (global as any).filterPillsLayout = { x: pageX, y: pageY, width, height };
            });
          }
        }}
        style={[
          styles.pillsContainer,
          { transform: [{ scale: tutorialPulseAnim }] }
        ]}
      >
        {/* Events Pill */}
        <TouchableOpacity
          style={[
            styles.pill,
            styles.eventsPill,
            !filterCriteria.showEvents && styles.inactivePill,
            activePanel === 'events' && styles.activePill,
          ]}
          onLayout={(e) => {
            const width = e?.nativeEvent?.layout?.width ?? 0;
            if (width && width !== eventsPillWidth) {
              setEventsPillWidth(width);
            }
          }}
          onPress={() => {
            if (eventsClearArmed) {
              confirmClearEventsFilters();
              return;
            }
            toggleEvents();
          }}
          onLongPress={() => togglePanel('events')}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.eventsClearHoldFill,
              {
                width: eventsClearFillAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, eventsPillWidth || 0],
                }),
              },
            ]}
          />
          {eventsClearArmed ? (
            <View style={styles.clearConfirmContainer}>
              <Ionicons
                name="calendar"
                size={16}
                color="white"
                style={styles.clearConfirmIcon}
              />
              <Text numberOfLines={1} style={[styles.pillText, styles.clearConfirmText]}>
                Clear
              </Text>
            </View>
          ) : (
            <>
              <Ionicons name="calendar" size={16} color={filterCriteria.showEvents ? "white" : "#F7F7F7"} />
              <View style={styles.stackedLabelContainer}>
                <Text numberOfLines={1} style={[styles.stackedLabelTop, !filterCriteria.showEvents && styles.inactiveText]}>
                  Events
                </Text>
                <View style={[styles.stackedLabelDivider, !filterCriteria.showEvents && styles.inactiveDivider]} />
                <Text numberOfLines={1} style={[styles.stackedLabelBottom, !filterCriteria.showEvents && styles.inactiveText]}>
                  {getTimeFilterDisplayText(filterCriteria.eventFilters.timeFilter) || 'All'}
                </Text>
              </View>
              {isVisibleCategory(filterCriteria.eventFilters.category) && (
                <MaterialIcons
                  name={getCategoryIconName(filterCriteria.eventFilters.category) as any}
                  size={16}
                  color={filterCriteria.showEvents ? "white" : "#ccc"}
                  style={styles.categoryIconInPill}
                />
              )}
              <Text numberOfLines={1} style={[styles.pillText, !filterCriteria.showEvents && styles.inactiveText]}>
                {filterCriteria.showEvents ? visibleEvents : 0}/{totalEvents}
              </Text>
            </>
          )}
          <TouchableOpacity 
            style={[
              styles.filterIcon,
              styles.filterIconContainer,
              eventsPillHasActiveFilters && styles.filterIconContainerActive
            ]}
            delayLongPress={150}
            onLongPress={() => {
              if (eventsClearArmedRef.current) {
                cancelEventsClearArmed('long-press-while-armed');
                return;
              }
              startEventsHoldToArmClear();
            }}
            onPressOut={() => {
              if (eventsClearHoldInProgressRef.current && !eventsClearArmedRef.current) {
                cancelEventsClearArmed('released-before-armed', false);
              }
            }}
            onPress={() => {
              if (eventsClearSuppressNextChevronPressRef.current) {
                console.log('🛑 Suppressing Events chevron press (hold gesture consumed it)');
                eventsClearSuppressNextChevronPressRef.current = false;
                return;
              }

              if (eventsClearArmedRef.current) {
                console.log('🧯 Events chevron pressed while armed → cancel + open panel');
                cancelEventsClearArmed('open-panel');
                togglePanel('events');
                return;
              }

              togglePanel('events');
            }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons 
              name={activePanel === 'events' ? "chevron-up" : "chevron-down"}
              size={14} 
              color={
                !filterCriteria.showEvents
                  ? "#ccc"
                  : (eventsPillHasActiveFilters ? "#FF3B30" : "white")
              } 
            />
            {eventsPillHasActiveFilters && (
              <View pointerEvents="none" style={styles.activeFilterDot} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
        
        {/* Specials Pill */}
<TouchableOpacity 
          style={[
            styles.pill, 
            styles.specialsPill,
            !filterCriteria.showSpecials && styles.inactivePill,
            activePanel === 'specials' && styles.activePill,
          ]}
          onLayout={(e) => {
            const width = e?.nativeEvent?.layout?.width ?? 0;
            if (width && width !== specialsPillWidth) setSpecialsPillWidth(width);
          }}
          onPress={() => {
            if (specialsClearArmed) {
              confirmClearSpecialsFilters();
              return;
            }
            toggleSpecials();
          }}
          onLongPress={() => togglePanel('specials')}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.eventsClearHoldFill, // Reuse style
              {
                width: specialsClearFillAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, specialsPillWidth || 0],
                }),
              },
            ]}
          />
          {specialsClearArmed ? (
            <View style={styles.clearConfirmContainer}>
              <Ionicons name="restaurant" size={16} color="white" style={styles.clearConfirmIcon} />
              <Text numberOfLines={1} style={[styles.pillText, styles.clearConfirmText]}>Clear</Text>
            </View>
          ) : (
            <>
              <Ionicons name="restaurant" size={16} color={filterCriteria.showSpecials ? "white" : "#F7F7F7"} />
              <View style={styles.stackedLabelContainer}>
                <Text numberOfLines={1} style={[styles.stackedLabelTop, !filterCriteria.showSpecials && styles.inactiveText]}>
                  Specials
                </Text>
                <View style={[styles.stackedLabelDivider, !filterCriteria.showSpecials && styles.inactiveDivider]} />
                <Text numberOfLines={1} style={[styles.stackedLabelBottom, !filterCriteria.showSpecials && styles.inactiveText]}>
                  {getTimeFilterDisplayText(filterCriteria.specialFilters.timeFilter) || 'All'}
                </Text>
              </View>
              {isVisibleCategory(filterCriteria.specialFilters.category) && (
                <MaterialIcons
                  name={getCategoryIconName(filterCriteria.specialFilters.category) as any}
                  size={16}
                  color={filterCriteria.showSpecials ? "white" : "#ccc"}
                  style={styles.categoryIconInPill}
                />
              )}
              <Text numberOfLines={1} style={[styles.pillText, !filterCriteria.showSpecials && styles.inactiveText]}>
                {filterCriteria.showSpecials ? visibleSpecials : 0}/{totalSpecials}
              </Text>
            </>
          )}
          <TouchableOpacity 
            style={[
              styles.filterIcon,
              styles.filterIconContainer,
              specialsPillHasActiveFilters && styles.filterIconContainerActive
            ]}
            delayLongPress={150}
            onLongPress={() => {
              if (specialsClearArmedRef.current) {
                cancelSpecialsClearArmed('long-press-while-armed');
                return;
              }
              startSpecialsHoldToArmClear();
            }}
            onPressOut={() => {
              if (specialsClearHoldInProgressRef.current && !specialsClearArmedRef.current) {
                cancelSpecialsClearArmed('released-before-armed', false);
              }
            }}
            onPress={() => {
              if (specialsClearSuppressNextChevronPressRef.current) {
                specialsClearSuppressNextChevronPressRef.current = false;
                return;
              }
              if (specialsClearArmedRef.current) {
                cancelSpecialsClearArmed('open-panel');
                togglePanel('specials');
                return;
              }
              togglePanel('specials');
            }}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons 
              name={activePanel === 'specials' ? "chevron-up" : "chevron-down"} 
              size={14} 
              color={!filterCriteria.showSpecials ? "#ccc" : (specialsPillHasActiveFilters ? "#FF3B30" : "white")} 
            />
            {specialsPillHasActiveFilters && (
              <View pointerEvents="none" style={styles.activeFilterDot} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
      
      {/* Background Overlay - Always rendered */}
      <Animated.View
        pointerEvents={effectivePanel ? 'auto' : 'none'}
        style={[styles.filterBackgroundOverlay, { opacity: overlayOpacity }]}
      >
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1} 
          onPress={() => {
            console.log('🖱️ Background overlay pressed');
            togglePanel(null);
          }} 
        />
      </Animated.View>

      {/* Events Panel - Always rendered */}
      <Animated.View
        pointerEvents={effectivePanel === 'events' ? 'auto' : 'none'}
        style={[styles.filterPanel, { opacity: eventsPanelOpacity }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(230, 240, 255, 0.92)', 'rgba(200, 220, 250, 0.75)', 'rgba(180, 210, 245, 0.65)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.filterPanelGradient}
        />
        <View style={styles.panelHeader} pointerEvents="box-none">
          <Text style={styles.panelTitle}>Event Filters</Text>
          <TouchableOpacity onPress={() => {
            console.log('❎ Events X button pressed');
            togglePanel(null);
          }}>
            <Ionicons name="close" size={20} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.filterSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>When</Text>
            {filterCriteria.eventFilters.timeFilter !== TimeFilterType.ALL && (
              <TouchableOpacity onPress={() => setTypeFilters('event', { timeFilter: TimeFilterType.ALL })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TimeFilterOptions 
            selected={filterCriteria.eventFilters.timeFilter}
            onSelect={(timeFilter) => {
              const newFilter = filterCriteria.eventFilters.timeFilter === timeFilter ? TimeFilterType.ALL : timeFilter;
              setTypeFilters('event', { timeFilter: newFilter });
            }}
            counts={getTimeFilterCounts('event')}
          />
        </View>
        <View style={[styles.filterSection, styles.lastFilterSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filterCriteria.eventFilters.category && (
              <TouchableOpacity onPress={() => setTypeFilters('event', { category: undefined })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <CategoryFilterOptions type="event" counts={getCategoryFilterCounts('event')} />
        </View>
      </Animated.View>

      {/* Specials Panel - Always rendered */}
      <Animated.View
        pointerEvents={effectivePanel === 'specials' ? 'auto' : 'none'}

        style={[styles.filterPanel, { opacity: specialsPanelOpacity }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(230, 240, 255, 0.92)', 'rgba(200, 220, 250, 0.75)', 'rgba(180, 210, 245, 0.65)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.filterPanelGradient}
        />
        <View style={styles.panelHeader} pointerEvents="box-none">
          <Text style={styles.panelTitle}>Special Filters</Text>
          <TouchableOpacity onPress={() => {
            console.log('❎ Specials X button pressed');
            togglePanel(null);
          }}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.filterSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>When</Text>
            {filterCriteria.specialFilters.timeFilter !== TimeFilterType.ALL && (
              <TouchableOpacity onPress={() => setTypeFilters('special', { timeFilter: TimeFilterType.ALL })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TimeFilterOptions 
            selected={filterCriteria.specialFilters.timeFilter}
            onSelect={(timeFilter) => {
              const newFilter = filterCriteria.specialFilters.timeFilter === timeFilter ? TimeFilterType.ALL : timeFilter;
              setTypeFilters('special', { timeFilter: newFilter });
            }}
            counts={getTimeFilterCounts('special')}
          />
        </View>
        <View style={[styles.filterSection, styles.lastFilterSection]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Category</Text>
            {filterCriteria.specialFilters.category && (
              <TouchableOpacity onPress={() => setTypeFilters('special', { category: undefined })}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <CategoryFilterOptions type="special" counts={getCategoryFilterCounts('special')} />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    left: 0,
    right: 0,
    zIndex: 5,
  },
  pillsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    flex: 0,
    minWidth: 110,
    marginHorizontal: 3,
  },
  eventsPill: {
    backgroundColor: '#2196F3',
    marginLeft: 15,
  },
  specialsPill: {
    backgroundColor: '#34A853',
    marginRight: 15,
  },

  inactivePill: {
    backgroundColor: '#999',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingRight: 8,
  },
  clearText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '500',
  },
  inactiveText: {
    color: '#F7F7F7',
  },
  activePill: {
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 14,
  },
  pillText: {
    color: 'white',
    fontWeight: 'bold',
    marginHorizontal: 4,
    fontSize: 12,
  },
  categoryIconInPill: {
    marginLeft: 3,
    marginRight: 1,
  },
  filterIcon: {
    padding: 3,
    marginLeft: 4,
  },
  filterIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 2,
  },
  filterIconContainerActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.20)',
  },
  activeFilterDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF3B30',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  eventsClearHoldFill: {
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
  clearConfirmContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  clearConfirmIcon: {
    marginRight: 6,
  },
  clearConfirmText: {
    marginHorizontal: 0,
  },
  eventsClearArmedOverlay: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    bottom: 2000,
    backgroundColor: 'rgba(0, 0, 0, 0.001)',
    zIndex: 8,
  },
  filterPanel: {
    position: 'absolute',
    top: 50,
    left: 6,
    right: 6,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: 350,
    zIndex: 10,
    overflow: 'hidden',
    ...(Platform.OS === 'ios' && {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    }),
  },
  filterPanelGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    ...(Platform.OS === 'ios' && {
      backdropFilter: 'blur(10px)',
    }),
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterBackgroundOverlay: {
    position: 'absolute',
    top: -10,
    left: 0,
    right: 0,
    bottom: 2000,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    zIndex: 9,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterSection: {
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  lastFilterSection: {
    marginBottom: 0,
  },
  tutorialHighlight: {
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  stackedLabelContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    paddingLeft: 2,
  },
  stackedLabelTop: {
    color: 'white',
    fontWeight: '600',
    fontSize: 9,
    lineHeight: 10,
  },
  stackedLabelDivider: {
    width: '100%',
    height: 0.5,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginVertical: 1,
  },
  inactiveDivider: {
    backgroundColor: 'rgba(247, 247, 247, 0.4)',
  },
  stackedLabelBottom: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 11,
  },
});

export default FilterPills;
