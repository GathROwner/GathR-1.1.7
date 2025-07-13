import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMapStore } from '../../store';
import { TimeFilterType } from '../../types';
import TimeFilterOptions from './TimeFilterOptions';
import CategoryFilterOptions from './CategoryFilterOptions';

// Import centralized time utilities
import {
  isEventNow,
  isEventHappeningToday
} from '../../utils/dateUtils';

const FilterPills = () => {
  const { events, filteredEvents, filterCriteria, setFilterCriteria, setTypeFilters, activeFilterPanel: activePanel, setActiveFilterPanel: setActivePanel, getTimeFilterCounts, getCategoryFilterCounts } = useMapStore();
  
  // Animation for sliding panel
  const slideAnimation = useRef(new Animated.Value(-300)).current;
  
  // Count events based on centralized time utilities for maximum accuracy
  const getTotalNowEvents = (eventsList: typeof events) => {
    return eventsList.filter(event => isEventNow(
      event.startDate, 
      event.startTime, 
      event.endDate || event.startDate, 
      event.endTime || ''
    )).length;
  };
  
  const getTotalTodayEvents = (eventsList: typeof events) => {
    return eventsList.filter(event => isEventHappeningToday(event)).length;
  };
  
  // Calculate counts
  const eventsData = events.filter(e => e.type === 'event');
  const specialsData = events.filter(e => e.type === 'special');
  const visibleEvents = filteredEvents.filter(e => e.type === 'event').length;
  const visibleSpecials = filteredEvents.filter(e => e.type === 'special').length;
  const totalEvents = eventsData.length;
  const totalSpecials = specialsData.length;
  
  // Enhanced diagnostics to show now/today counts
  const eventsNowCount = getTotalNowEvents(eventsData);
  const eventsTodayCount = getTotalTodayEvents(eventsData);
  const specialsNowCount = getTotalNowEvents(specialsData);
  const specialsTodayCount = getTotalTodayEvents(specialsData);
  
  // LOG: Filter pills render state - shows current filter criteria and event/special counts for debugging
  // console.log('FilterPills render:', {
  //   filterCriteria,
  //   visibleEvents,
  //   visibleSpecials,
  //   totalEvents,
  //   totalSpecials,
  //   diagnostics: {
  //     eventsNow: eventsNowCount,
  //     eventsToday: eventsTodayCount,
  //     specialsNow: specialsNowCount,
  //     specialsToday: specialsTodayCount
  //   }
  // });
  
  // Toggle filter panel
  const togglePanel = (panel: 'events' | 'specials' | null) => {
    // If clicking the same panel that's already active, close it
    const newState = panel === activePanel ? null : panel;
    
    // Update active panel state
    setActivePanel(newState);
    
    // Animate panel
    Animated.timing(slideAnimation, {
      toValue: newState ? 0 : -300,
      duration: 300,
      useNativeDriver: true
    }).start();
  };
  
  // Toggle events visibility
  const toggleEvents = () => {
    // LOG: Events visibility toggle
    // console.log('Toggling events from', filterCriteria.showEvents, 'to', !filterCriteria.showEvents);
    setFilterCriteria({ 
      showEvents: !filterCriteria.showEvents 
    });
  };
  
  // Toggle specials visibility
  const toggleSpecials = () => {
    // LOG: Specials visibility toggle
    // console.log('Toggling specials from', filterCriteria.showSpecials, 'to', !filterCriteria.showSpecials);
    setFilterCriteria({ 
      showSpecials: !filterCriteria.showSpecials 
    });
  };
  
  // Clear filters for the active panel type
  const clearFilters = () => {
    if (activePanel === 'events') {
      setTypeFilters('event', {
        timeFilter: TimeFilterType.ALL,
        category: undefined,
      });
    } else if (activePanel === 'specials') {
      setTypeFilters('special', {
        timeFilter: TimeFilterType.ALL,
        category: undefined,
      });
    }
  };
  
  // Get the active time filter for the current panel
  const getActiveTimeFilter = () => {
    return activePanel === 'events'
      ? filterCriteria.eventFilters.timeFilter
      : filterCriteria.specialFilters.timeFilter;
  };
  
  // Get the active category for the current panel
  const getActiveCategory = () => {
    return activePanel === 'events'
      ? filterCriteria.eventFilters.category
      : filterCriteria.specialFilters.category;
  };
  
  // Handle time filter selection
  // Handle time filter selection with toggle behavior
  const handleTimeFilterSelected = (timeFilter: TimeFilterType) => {
    const currentFilter = getActiveTimeFilter();
    
    // If clicking the already selected filter, deselect it (set to ALL)
    const newFilter = currentFilter === timeFilter ? TimeFilterType.ALL : timeFilter;
    
    if (activePanel === 'events') {
      setTypeFilters('event', { timeFilter: newFilter });
    } else if (activePanel === 'specials') {
      setTypeFilters('special', { timeFilter: newFilter });
    }
  };
  
  // Set to show all events (no time filtering)
  const handleShowAll = () => {
    if (activePanel === 'events') {
      setTypeFilters('event', { timeFilter: TimeFilterType.ALL });
    } else if (activePanel === 'specials') {
      setTypeFilters('special', { timeFilter: TimeFilterType.ALL });
    }
  };
  
  return (
    <View style={styles.container}>
      {/* Filter Pills */}
      <View style={styles.pillsContainer}>
        <TouchableOpacity 
          style={[
            styles.pill, 
            styles.eventsPill,
            !filterCriteria.showEvents && styles.inactivePill,
            activePanel === 'events' && styles.activePill
          ]}
          onPress={toggleEvents}
          onLongPress={() => togglePanel('events')}
        >
          <Ionicons 
            name="calendar" 
            size={20} 
            color={filterCriteria.showEvents ? "white" : "#ccc"} 
          />
          <Text style={[
            styles.pillText,
            !filterCriteria.showEvents && styles.inactiveText
          ]}>
            Events {filterCriteria.showEvents ? visibleEvents : 0}/{totalEvents}
          </Text>
          <TouchableOpacity 
            style={[styles.filterIcon, styles.filterIconContainer]}
            onPress={() => togglePanel(activePanel === 'events' ? null : 'events')}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }} // Extends touchable area beyond visible bounds
          >
            <Ionicons 
              name={activePanel === 'events' ? "chevron-up" : "chevron-down"}
              size={16} 
              color={filterCriteria.showEvents ? "white" : "#ccc"} 
            />
          </TouchableOpacity>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[
            styles.pill, 
            styles.specialsPill,
            !filterCriteria.showSpecials && styles.inactivePill,
            activePanel === 'specials' && styles.activePill
          ]}
          onPress={toggleSpecials}
          onLongPress={() => togglePanel('specials')}
        >
          <Ionicons 
            name="restaurant" 
            size={20} 
            color={filterCriteria.showSpecials ? "white" : "#ccc"} 
          />
          <Text style={[
            styles.pillText,
            !filterCriteria.showSpecials && styles.inactiveText
          ]}>
            Specials {filterCriteria.showSpecials ? visibleSpecials : 0}/{totalSpecials}
          </Text>
          <TouchableOpacity 
            style={[styles.filterIcon, styles.filterIconContainer]}
            onPress={() => togglePanel(activePanel === 'specials' ? null : 'specials')}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons 
              name={activePanel === 'specials' ? "chevron-up" : "chevron-down"} 
              size={16} 
              color={filterCriteria.showSpecials ? "white" : "#ccc"} 
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
      
      {activePanel && (
        <TouchableOpacity
          style={styles.filterBackgroundOverlay}
          activeOpacity={1}
          onPress={() => togglePanel(null)}
        />
      )}

      {/* Sliding Filter Panel */}
      {activePanel && (
        <Animated.View 
          style={[
            styles.filterPanel,
            { transform: [{ translateX: slideAnimation }] }
          ]}
        >
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              {activePanel === 'events' ? 'Event Filters' : 'Special Filters'}
            </Text>
            <TouchableOpacity onPress={() => togglePanel(null)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.filterSection}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>When</Text>
              {getActiveTimeFilter() !== TimeFilterType.ALL && (
                <TouchableOpacity onPress={handleShowAll}>
                  <Text style={styles.clearText}>Show All</Text>
                </TouchableOpacity>
              )}
            </View>
            <TimeFilterOptions 
              selected={getActiveTimeFilter()}
              onSelect={handleTimeFilterSelected}
              counts={activePanel ? getTimeFilterCounts(activePanel === 'events' ? 'event' : 'special') : undefined}
            />
          </View>
          
          <View style={[styles.filterSection, styles.lastFilterSection]}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Category</Text>
              {getActiveCategory() && (
                <TouchableOpacity 
                  onPress={() => {
                    if (activePanel === 'events') {
                      setTypeFilters('event', { category: undefined });
                    } else {
                      setTypeFilters('special', { category: undefined });
                    }
                  }}
                >
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <CategoryFilterOptions 
              type={activePanel === 'events' ? 'event' : 'special'}
              counts={activePanel ? getCategoryFilterCounts(activePanel === 'events' ? 'event' : 'special') : undefined}
            />
          </View>
         <View style={styles.dividerLine} />

          <View style={styles.filterActions}>
            <TouchableOpacity 
              style={styles.toggleButton}
              onPress={activePanel === 'events' ? toggleEvents : toggleSpecials}
            >
              <Text style={styles.toggleButtonText}>
                {activePanel === 'events' 
                  ? (filterCriteria.showEvents ? 'Hide All Events' : 'Show All Events')
                  : (filterCriteria.showSpecials ? 'Hide All Specials' : 'Show All Specials')
                }
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

// Replace the styles section in your FilterPills.tsx with these updated styles:

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 30, // Reduced from 50 to bring much closer to header
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
    paddingVertical: 6, // Reduced from 10 to make more compact
    paddingHorizontal: 12, // Reduced from 15 to make more compact
    borderRadius: 20, // Reduced from 25 to match smaller padding
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    flex: 0,
    minWidth: 130, // Reduced from 140 to be more compact
    marginHorizontal: 3,
  },
  eventsPill: {
    backgroundColor: '#2196F3',
    marginLeft: 15, // Reduced from 20
  },
  specialsPill: {
    backgroundColor: '#4CAF50',
    marginRight: 15, // Reduced from 20
  },
  inactivePill: {
    backgroundColor: '#999',
    opacity: 0.7,
  },
  inactiveText: {
    color: '#eee',
  },
  activePill: {
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  pillText: {
    color: 'white',
    fontWeight: 'bold',
    marginHorizontal: 6, // Reduced from 8
    fontSize: 13, // Added explicit font size to keep text readable but compact
  },
  filterIcon: {
    padding: 3, // Reduced from 4
    marginLeft: 4, // Reduced from 5
  },
  filterIconContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10, // Reduced from 12
    padding: 3, // Reduced from 4
  },
  filterPanel: {
    position: 'absolute',
    top: 50, // Reduced from 60 to account for new pill position
    left: '50%',
    marginLeft: -150,
    width: 300,
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: 450,
    zIndex: 2,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterBackgroundOverlay: {
    position: 'absolute',
    top: -10, // Adjusted from -50 to account for new position
    left: 0,
    right: 0,
    bottom: 2000,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterSection: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  clearText: {
    color: '#2196F3',
    fontSize: 14,
  },
  filterActions: {
    paddingTop: 0,
    paddingBottom: 10,
    alignItems: 'center',
  },
  dividerLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginVertical: 8,
    width: '100%',
  },
  toggleButton: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  toggleButtonText: {
    color: '#555',
    fontWeight: '500',
    fontSize: 14,
  },
  lastFilterSection: {
    marginBottom: 0,
  },
});

export default FilterPills;