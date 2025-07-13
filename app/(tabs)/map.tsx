import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, TouchableOpacity, Easing } from 'react-native';
import * as Location from 'expo-location';
import MapboxGL from '@rnmapbox/maps';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

// Analytics integration
import useAnalytics from '../../hooks/useAnalytics';

// Add these after your existing imports
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { RegistrationPrompt } from '../../components/RegistrationPrompt';
import { InteractionType } from '../../types/guestLimitations';
import { useAuth } from '../../contexts/AuthContext'; // Adjust path as needed

// Import the store and types
import { useMapStore } from '../../store';
import type { Event, Venue, Cluster, TimeStatus, InterestLevel } from '../../types/events';
import { FilterCriteria, TimeFilterType } from '../../types/filter';

// Import components
import FilterPills from '../../components/map/FilterPills';
import EventCallout from '../../components/map/EventCallout';

// Import centralized date utilities
import { 
  isEventNow, 
  isEventHappeningToday, 
  getEventTimeStatus 
} from '../../utils/dateUtils';

// Import user service for preferences
import * as userService from '../../services/userService';

// Import from store utility - assuming this is exported from your store
import { ZOOM_THRESHOLDS, getThresholdIndexForZoom, calculateDistance } from '../../store/mapStore';

// Initialize Mapbox token
try {
  MapboxGL.setAccessToken('MAPBOX_ACCESS_TOKEN_REMOVED');
} catch (error) {
  console.error('Error setting Mapbox token:', error);
}

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper function to get color for time status
const getTimeStatusColor = (timeStatus: TimeStatus): string => {
  switch (timeStatus) {
    case 'now':
      return '#34A853'; // Green for now
    case 'today':
      return '#FBBC05'; // Yellow for today
    case 'future':
    default:
      return '#9AA0A6'; // Gray for future
  }
};

// Helper function to get badge color for time status
const getTimeBadgeColor = (timeStatus: TimeStatus): string => {
  switch (timeStatus) {
    case 'now':
      return '#FF5722'; // Red-orange for now
    case 'today':
      return '#F57C00'; // Orange for today
    default:
      return 'transparent'; // No badge for future
  }
};

// Helper function to get size based on interest level
const getInterestLevelSize = (interestLevel: InterestLevel): number => {
  switch (interestLevel) {
    case 'high':
      return 18; // 50px diameter (25px radius)
    case 'medium':
      return 15; // 40px diameter (20px radius)
    case 'low':
    default:
      return 12; // 30px diameter (15px radius)
  }
};

// Broadcasting effect component for "now" events
interface BroadcastingEffectProps {
  size: number;
  color: string;
}

/**
 * Broadcasting effect component for "now" events with pulsing animation
 */
const BroadcastingEffect: React.FC<BroadcastingEffectProps> = ({ size, color }) => {
  // Create animation values for each ring
  const [animations] = useState([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0)
  ]);
  
  useEffect(() => {
    // Create staggered animations for each ring
    const createAnimation = (index: number) => {
      return Animated.loop(
        Animated.sequence([
          // Delay start based on ring index for staggered effect
          Animated.delay(index * 1000),
          // Animation sequence
          Animated.timing(animations[index], {
            toValue: 1,
            duration: 3000,
            useNativeDriver: true,
            easing: Easing.linear
          }),
          // Reset
          Animated.timing(animations[index], {
            toValue: 0,
            duration: 0,
            useNativeDriver: true
          })
        ])
      );
    };
    
    // Start animations
    const animationSequences = animations.map((_, index) => createAnimation(index));
    Animated.parallel(animationSequences).start();
    
    // Clean up animations on unmount
    return () => {
      animations.forEach(anim => anim.stopAnimation());
    };
  }, []);
  
  return (
    <View style={styles.broadcastContainer}>
      {animations.map((anim, index) => {
        // Calculate opacity and scale based on animation progress
        const opacity = anim.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0.6, 0.4, 0],
          extrapolate: 'clamp'
        });
        
        const scale = anim.interpolate({
          inputRange: [0, 2.5],
          outputRange: [.5, 4.5],
          extrapolate: 'clamp'
        });
        
        return (
          <Animated.View
            key={`ring-${index}`}
            style={[
              styles.broadcastRing,
              {
                borderColor: color,
                opacity,
                transform: [{ scale }],
                width: size * 2, // Match the tree top size
                height: size * 2, // Match the tree top size
                borderRadius: size
              }
            ]}
          />
        );
      })}
    </View>
  );
};

/**
 * User Location Marker component with pulsing animation
 */
const UserLocationMarker: React.FC<{ location: Location.LocationObject }> = ({ location }) => {
  if (!location) return null;
  
  const userMarkerSize = 16;
  const userMarkerColor = '#4285F4'; // Google Maps blue
  
  return (
    <MapboxGL.MarkerView
      coordinate={[location.coords.longitude, location.coords.latitude]}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.userMarkerWrapper}>
        <BroadcastingEffect size={userMarkerSize} color={userMarkerColor} />
        <View 
          style={[
            styles.userMarkerDot, 
            { 
              width: userMarkerSize, 
              height: userMarkerSize,
              borderRadius: userMarkerSize / 2,
              backgroundColor: userMarkerColor,
              borderColor: '#FFFFFF',
              borderWidth: 2
            }
          ]} 
        />
      </View>
    </MapboxGL.MarkerView>
  );
};

// Tree Marker component for map points
interface TreeMarkerProps {
  cluster: Cluster;
  isSelected: boolean;
}

const TreeMarker: React.FC<TreeMarkerProps> = ({ cluster, isSelected }) => {
  // Determine color based on time status
  const color = getTimeStatusColor(cluster.timeStatus);
  
  // Determine size based on interest level
  const size = getInterestLevelSize(cluster.interestLevel);
  
  // Scale up if selected
  const scaleFactor = isSelected ? 1.2 : 1;
  const adjustedSize = size * scaleFactor;
  
  return (
    <View style={styles.markerWrapper}>
      {/* Broadcasting effect for 'now' events */}
      {cluster.isBroadcasting && (
        <BroadcastingEffect size={adjustedSize} color={color} />
      )}
      
      {/* Tree top (circle) */}
      <View
        style={[
          styles.treeTop,
          {
            backgroundColor: color,
            width: adjustedSize * 1.5,
            height: adjustedSize * 1.5,
            borderRadius: adjustedSize, // Circular shape
            justifyContent: 'center',
            alignItems: 'center'
          }
        ]}
      >
        {/* Venue count indicator */}
        <View
          style={[
            styles.venueCountContainer,
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              // Remove the fixed width to allow contents to scale
              // width: adjustedSize  // commented out or adjust this value if needed
            }
          ]}
        >
          <MaterialIcons
            name="home"
            size={adjustedSize / 2} // Adjusted size factor for a larger icon
            color={['#34A853', '#FBBC05'].includes(color) ? '#000000' : '#FFFFFF'}
            style={{ marginRight: 0 }} // Increased margin for clarity
          />
          <Text
            style={[
              styles.venueCountText,
              {
                color: ['#34A853', '#FBBC05'].includes(color) ? '#000000' : '#FFFFFF',
                fontSize: adjustedSize / 2.5, // Adjusted font size for larger text
                textAlign: 'center'
              }
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.2}
          >
            {cluster.venues.length}
          </Text>
        </View>
      </View>

      {/* Tree trunk (rectangle) */}
      <View 
        style={[
          styles.treeTrunk, 
          { 
            backgroundColor: color, 
            width: adjustedSize / 2.5, 
            height: adjustedSize / 2,
          }
        ]} 
      />
      
      {/* Label area with category icons */}
      <View 
        style={[
          styles.markerLabel, 
          { 
            width: Math.max(adjustedSize * 3.8, 62), // Minimum width of 62px
            height: Math.max(adjustedSize, 25), // Minimum height of 25px
          }
        ]}
      >
        {/* Event icon and count */}
        {cluster.eventCount > 0 && (
          <View style={styles.iconContainer}>
            <MaterialIcons 
              name="event" 
              size={Math.max(adjustedSize/2.5, 12)} // Minimum icon size of 12px
              color="#666666" 
            />
            <Text style={styles.countText}>{cluster.eventCount}</Text>
          </View>
        )}
        
        {/* Special icon and count */}
        {cluster.specialCount > 0 && (
          <View style={styles.iconContainer}>
            <MaterialIcons 
              name="restaurant" 
              size={Math.max(adjustedSize/2.5, 12)} // Minimum icon size of 12px
              color="#666666" 
            />
            <Text style={styles.countText}>{cluster.specialCount}</Text>
          </View>
        )}
      </View>
      
      {/* Time indicator badge for now/today */}
      {cluster.timeStatus !== 'future' && (
        <View 
          style={[
            styles.timeIndicator, 
            { 
              backgroundColor: getTimeBadgeColor(cluster.timeStatus),
              width: 16,                // Fixed width (pixels)
              height: 16,               // Fixed height (pixels)
              borderRadius: 8,          // Fixed border radius
              position: 'absolute',     // Ensure absolute positioning works
              top: -4,                  // Position to overlap with tree top
              right: 12,                // Position to overlap with tree top
              borderWidth: 1.5,         // Add a white border
              borderColor: '#FFFFFF',   // White border color
            }
          ]}
        >
          <Text style={[styles.timeIndicatorText, { fontSize: 10 }]}>
            {cluster.timeStatus === 'now' ? 'N' : 'T'}
          </Text>
        </View>
      )}
    </View>
  );
};

// Re-center button component
const RecenterButton: React.FC<{ 
  onPress: () => void,
  disabled: boolean 
}> = ({ onPress, disabled }) => {
  return (
    <TouchableOpacity 
      style={[
        styles.recenterButton,
        disabled && styles.recenterButtonDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <MaterialIcons 
        name="my-location" 
        size={24} 
        color={disabled ? "#BBBBBB" : "#4285F4"} 
      />
    </TouchableOpacity>
  );
};

// Main Map Screen component
function MapScreen() {
  // 🔥 ANALYTICS INTEGRATION: Initialize analytics hook
  const analytics = useAnalytics();

  // Auth state for guest checking  
  const { user } = useAuth(); // Adjust import path as needed
  const isGuest = !user;

  // Guest limitation hook - only for guests
  const { trackInteraction } = useGuestInteraction();

  // Use the map store
  const { 
    clusters,
    selectedVenue,
    selectedVenues,
    selectedCluster,
    isLoading, 
    error, 
    fetchEvents, 
    selectVenue,
    selectVenues,
    selectCluster,
    setZoomLevel,
    filterCriteria,
    zoomLevel,
    shouldClusterBeVisible,
    setUserLocation,
    activeFilterPanel,
    setActiveFilterPanel
  } = useMapStore();

  // 🎯 TUTORIAL INTEGRATION: Make map store available globally
  useEffect(() => {
    (global as any).mapStore = {
      clusters,
      selectedVenues,
      filterCriteria,
      zoomLevel
    };
    
    // 🎯 TUTORIAL INTEGRATION: Expose camera ref for tutorial repositioning
    (global as any).mapCameraRef = cameraRef;
    
    return () => {
      delete (global as any).mapStore;
      delete (global as any).mapCameraRef;
    };
  }, [clusters, selectedVenues, filterCriteria, zoomLevel]);

  // Close filter panel and callouts when user switches away from map tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        // This runs when the screen loses focus (user switches tabs)
        if (activeFilterPanel) {
          setActiveFilterPanel(null);
        }
        if (selectedVenues && selectedVenues.length > 0) {
          selectVenue(null);
        }
      };
    }, [activeFilterPanel, setActiveFilterPanel, selectedVenues, selectVenue])
  );

  // Local state for location and map
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean>(false);
  const [hasInitiallyPositioned, setHasInitiallyPositioned] = useState<boolean>(false);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const calloutAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const mapRef = useRef<MapboxGL.MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  
  // Filter pills auto-hide functionality
  const [isMapMoving, setIsMapMoving] = useState<boolean>(false);
  const pillsAnimation = useRef(new Animated.Value(0)).current; // 0 = visible, -100 = hidden
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCameraChangeRef = useRef<number>(0);
  
  // Add a ref to track current zoom threshold and visible clusters for stability
  const currentThresholdIndex = useRef<number>(getThresholdIndexForZoom(zoomLevel));
  const visibleClusterIds = useRef<Set<string>>(new Set());
  const previousFilterCriteria = useRef<FilterCriteria>(filterCriteria);

  // 🔥 ANALYTICS: Add refs for tracking performance and behavior
  const mapInteractionStartTime = useRef<number | null>(null);
  const lastZoomLevel = useRef<number>(zoomLevel);
  const sessionClusterInteractions = useRef<number>(0);

  // Create a memoized initial center coordinate
  // This will only update when location changes, not on every render
  const initialCenterCoordinate = useMemo(() => {
    return location
      ? [location.coords.longitude, location.coords.latitude]
      : [-63.1276, 46.2336]; // Default to PEI coordinates
  }, [location]);
  
  // Request location permissions as soon as possible
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        // 🔥 ANALYTICS: Track location permission request
        analytics.trackMapInteraction('location_permission_requested');
        
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setLocationPermissionGranted(granted);
        
        // 🔥 ANALYTICS: Track location permission result
        analytics.trackMapInteraction('location_permission_result', {
          granted,
          status,
          is_guest: isGuest
        });
        
        if (!granted) {
          console.log('Location permission denied');
          // 🔥 ANALYTICS: Track specific denial for analysis
          analytics.trackUserAction('location_permission_denied', {
            user_type: isGuest ? 'guest' : 'registered'
          });
        }
      } catch (error) {
        console.error('Error requesting location permission:', error);
        // 🔥 ANALYTICS: Track permission errors
        analytics.trackError('location_permission_error', 
          error instanceof Error ? error.message : 'Unknown permission error',
          { screen: 'map' }
        );
      }
    };

    requestLocationPermission();
  }, []); // 🔥 STABLE: Empty dependency array - runs once only

  // Set up location tracking when permission is granted
  useEffect(() => {
    if (!locationPermissionGranted) return;
    
    const startLocationTracking = async () => {
      try {
        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        
        setLocation(initialLocation);
        
        // Share location with the store for use in other components
        setUserLocation(initialLocation);
        
        // 🔥 ANALYTICS: Track successful location acquisition
        analytics.trackMapInteraction('location_acquired', {
          accuracy: initialLocation.coords.accuracy || 0,
          latitude_rounded: Math.round(initialLocation.coords.latitude * 100) / 100,
          longitude_rounded: Math.round(initialLocation.coords.longitude * 100) / 100,
          is_guest: isGuest
        });
        
        // Set up ongoing location tracking with less frequent updates
        locationSubscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50, // Update if user moves 50 meters (increased from 10)
            timeInterval: 10000    // Update every 10 seconds (increased from 5 seconds)
          },
          (newLocation) => {
            setLocation(newLocation);
            
            // Share new location with the store but DON'T update the camera
            setUserLocation(newLocation);
            
            // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT
            // if (Math.random() < 0.1) { // Only track 10% of location updates to avoid spam
            //   analytics.trackMapInteraction('location_updated', {
            //     movement_distance: calculateDistance(
            //       initialLocation.coords.latitude,
            //       initialLocation.coords.longitude,
            //       newLocation.coords.latitude,
            //       newLocation.coords.longitude
            //     )
            //   });
            // }
          }
        );
      } catch (error) {
        console.error('Error tracking location:', error);
        // 🔥 ANALYTICS: Track location tracking errors
        analytics.trackError('location_tracking_error',
          error instanceof Error ? error.message : 'Unknown location error',
          { screen: 'map' }
        );
      }
    };
    
    startLocationTracking();
    
    // Cleanup function to stop tracking location when component unmounts
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [locationPermissionGranted, setUserLocation]); // 🔥 STABLE: Only essential dependencies
  
  // Effect to handle first-time positioning to user location
  useEffect(() => {
    // Only do this once when we first get a location
    if (location && !hasInitiallyPositioned && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 12,
        animationDuration: 500,
      });
      
      // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT
      // analytics.trackMapInteraction('initial_position_set', {
      //   zoom_level: 12,
      //   positioned_to_user_location: true,
      //   is_guest: isGuest
      // });
      
      setHasInitiallyPositioned(true);
    }
  }, [location, hasInitiallyPositioned]); // REMOVED analytics, isGuest dependencies
  
  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 🔥 ANALYTICS: Track data fetch start
        const fetchStartTime = Date.now();
        
        await fetchEvents();
        
        // 🔥 ANALYTICS: Track data fetch completion
        const fetchDuration = Date.now() - fetchStartTime;
        analytics.logEvent('map_data_fetch', {
          duration_ms: fetchDuration,
          screen: 'map',
          is_guest: isGuest
        });
        
        analytics.trackMapInteraction('events_loaded', {
          load_duration_ms: fetchDuration
        });
      } catch (error) {
        console.error('Error fetching events:', error);
        // 🔥 ANALYTICS: Track fetch errors
        analytics.trackError('map_data_fetch_error',
          error instanceof Error ? error.message : 'Unknown fetch error',
          { screen: 'map' }
        );
      }
    };

    fetchData();
  }, [fetchEvents]); // 🔥 STABLE: Only fetchEvents dependency (from store)

  // 🔥 ANALYTICS: Track filter panel usage
  useEffect(() => {
    if (activeFilterPanel) {
      analytics.trackMapInteraction('filter_panel_opened', {
        panel_type: activeFilterPanel,
        current_zoom: zoomLevel,
        visible_clusters: visibleClusterIds.current.size,
        is_guest: isGuest
      });
    } else {
      // Track when filter panel is closed (if it was previously open)
      const wasOpen = activeFilterPanel !== null;
      if (wasOpen) {
        analytics.trackMapInteraction('filter_panel_closed', {
          interaction_duration_ms: mapInteractionStartTime.current 
            ? Date.now() - mapInteractionStartTime.current 
            : 0
        });
      }
    }
  }, [activeFilterPanel, analytics, zoomLevel, isGuest]); // 🔥 FULL DEPENDENCIES: Testing if this causes infinite loop

  // 🔥 ANALYTICS: Track filter criteria changes
  useEffect(() => {
    const hasFiltersApplied = (
      !filterCriteria.showEvents || 
      !filterCriteria.showSpecials || 
      filterCriteria.eventFilters.timeFilter !== 'all' ||
      filterCriteria.specialFilters.timeFilter !== 'all' ||
      filterCriteria.eventFilters.category !== 'all' ||
      filterCriteria.specialFilters.category !== 'all'
    );

    if (hasFiltersApplied) {
      analytics.trackEventFilter('map_filter_applied', JSON.stringify(filterCriteria));
      analytics.trackMapInteraction('filter_criteria_changed', {
        show_events: filterCriteria.showEvents,
        show_specials: filterCriteria.showSpecials,
        event_time_filter: filterCriteria.eventFilters.timeFilter,
        special_time_filter: filterCriteria.specialFilters.timeFilter,
        event_category: filterCriteria.eventFilters.category,
        special_category: filterCriteria.specialFilters.category,
        is_guest: isGuest
      });
    }
  }, [filterCriteria, analytics, isGuest]); // 🔥 SMOKING GUN: filterCriteria object dependency

  // Animate callout when selected venue changes
  useEffect(() => {
    if (selectedVenues && selectedVenues.length > 0) {
      // Show callout (animate to bottom position)
      Animated.spring(calloutAnimation, {
        toValue: 0, // Position at bottom
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();

      // 🔥 ANALYTICS: Track venue selection and callout display
      analytics.trackMapInteraction('venue_callout_opened', {
        venue_count: selectedVenues.length,
        primary_venue: selectedVenues[0]?.venue || 'unknown',
        event_count: selectedVenues.reduce((sum, v) => sum + v.events.length, 0),
        has_multiple_venues: selectedVenues.length > 1,
        is_guest: isGuest
      });

      // Track venue exploration details
      selectedVenues.forEach((venue, index) => {
        analytics.trackEventViewWithContext({
          id: `venue_${venue.locationKey}`,
          title: venue.venue,
          category: 'venue_exploration',
          type: 'venue',
          venue: venue.venue
        });
      });
    } else {
      // Hide callout (move off-screen)
      Animated.spring(calloutAnimation, {
        toValue: SCREEN_HEIGHT, // Move off-screen
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();

      // 🔥 ANALYTICS: Track callout closure if it was previously open
      if (selectedVenues && selectedVenues.length === 0) {
        analytics.trackMapInteraction('venue_callout_closed', {
          session_interactions: sessionClusterInteractions.current
        });
      }
    }
  }, [selectedVenues, calloutAnimation]); // 🔥 STABLE: Only essential dependencies

  useEffect(() => {
    // LOG: Map state changed - tracks selected venues and clusters for debugging venue selection flow
    // console.log("MAP STATE CHANGED - selectedVenues:", 
    //             selectedVenues ? selectedVenues.length : 0,
    //             "venue names:", selectedVenues ? selectedVenues.map(v => v.venue).join(", ") : "none",
    //             "selectedCluster:", selectedCluster ? selectedCluster.id : "none");
  }, [selectedVenues, selectedCluster]);

  // Re-center the map on user location
  const handleRecenterPress = () => {
    if (location && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [location.coords.longitude, location.coords.latitude],
        zoomLevel: 12,
        animationDuration: 500,
      });

      // 🔥 ANALYTICS: Track re-center actions
      analytics.trackMapInteraction('recenter_to_user_location', {
        current_zoom: zoomLevel,
        distance_from_center: location ? calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          location.coords.latitude, // This would be current map center
          location.coords.longitude  // This would be current map center
        ) : 0,
        is_guest: isGuest
      });
    }
  };
  
  // Enhanced handleMarkerPress with comprehensive prioritization
  const handleMarkerPress = useCallback(async (cluster: Cluster): Promise<void> => {
    // LOG: Processing cluster press - tracks which cluster was tapped and venue count
    // console.log("Processing cluster press:", cluster.id, "with", cluster.venues.length, "venues");
    
    // 🔥 ANALYTICS: Track cluster interaction start
    const interactionStartTime = Date.now();
    sessionClusterInteractions.current += 1;
    
    // Track guest interaction - only for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_CLICK)) {
      console.log("Cluster interaction blocked by guest limitation");
      
      // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT
      // analytics.trackMapInteraction('cluster_interaction_blocked', {
      //   cluster_id: cluster.id,
      //   cluster_size: cluster.venues.length,
      //   session_interactions: sessionClusterInteractions.current,
      //   reason: 'guest_limitation'
      // });
      
      return;
    }
    
    try {
      // Get current user location for proximity calculations
      const userLocation = location;
      
      // Calculate distance to cluster if user location available
      const distanceToCluster = userLocation && cluster.venues.length > 0 
        ? calculateDistance(
            userLocation.coords.latitude,
            userLocation.coords.longitude,
            cluster.venues[0].latitude,
            cluster.venues[0].longitude
          )
        : null;
      
      // Fetch user interests and saved events with proper typing
      const userInterests: string[] = await userService.getUserInterests();
      const savedEvents: string[] = await userService.getSavedEvents();
      
      // LOG: User data loaded - shows if user has interests/saved events for scoring algorithm
      // console.log("User data loaded:", {
      //   hasInterests: userInterests.length > 0,
      //   hasSaved: savedEvents.length > 0
      // });
      
      // Create a deep copy of venues with proper typing
      // Use a type assertion to ensure TypeScript understands the structure
      const venuesWithScores: Venue[] = JSON.parse(JSON.stringify(cluster.venues));
      
      // Track relevance scoring analytics
      let highRelevanceEvents = 0;
      let savedEventMatches = 0;
      let interestMatches = 0;
      
      // Process all venues to add relevance scores to each event and venue
      for (const venue of venuesWithScores) {
        // Calculate scores for each event in the venue
        for (const event of venue.events) {
          // Base score components
          let baseScore = 0;
          
          // 1. Saved Status (Highest Priority - 1000 points base)
          const isSaved = savedEvents.includes(event.id.toString());
          const savedScore = isSaved ? 1000 : 0;
          if (isSaved) savedEventMatches++;
          
          // 2. User Interest Match (Second Priority - 100 points base)
          const matchesInterest = userInterests.includes(event.category);
          const interestScore = matchesInterest ? 100 : 0;
          if (matchesInterest) interestMatches++;
          
          // 3. Time Status (Third Priority - 10 points base)
          let timeScore = 0;
          if (isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) {
            timeScore = 10;
          } else if (isEventHappeningToday(event)) {
            timeScore = 5;
          } else {
            timeScore = 1;
          }
          
          // 4. Engagement Score (Fourth Priority - direct points)
          const engagementScore = event.engagementScore || 0;
          
          // 5. Proximity Score (Final Tiebreaker - fractional points)
          let proximityScore = 0;
          if (userLocation) {
            const distance = calculateDistance(
              userLocation.coords.latitude,
              userLocation.coords.longitude,
              event.latitude,
              event.longitude
            );
            // Normalize distance to a score between 0-1
            // Closer locations get higher scores
            proximityScore = Math.max(0, 1 - (distance / 10000));
          }
          
          // Calculate final relevance score
          event.relevanceScore = savedScore + interestScore + timeScore + engagementScore + proximityScore;
          
          if (event.relevanceScore > 100) highRelevanceEvents++;
          
          // Log scores for debugging
          // LOG: Event scoring breakdown - shows how relevance scores are calculated for each event
          // if (process.env.NODE_ENV !== 'production') {
          //   console.log(`Event "${event.title}" scores:`, {
          //     saved: savedScore,
          //     interest: interestScore,
          //     time: timeScore,
          //     engagement: engagementScore,
          //     proximity: proximityScore.toFixed(3),
          //     total: event.relevanceScore
          //   });
          // }
        }
        
        // Calculate venue relevance score based on its highest-scoring event
        venue.relevanceScore = venue.events.length > 0 
          ? Math.max(...venue.events.map((event: Event) => event.relevanceScore || 0)) 
          : 0;
        
        // Also sort events within each venue by relevance score
        venue.events.sort((a: Event, b: Event) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
      }
      
      // Sort venues by their relevance scores
      const sortedVenues = venuesWithScores.sort((a: Venue, b: Venue) => 
        (b.relevanceScore || 0) - (a.relevanceScore || 0)
      );
      
      // Log the sorting results
      // LOG: Venue sorting results - shows how venues are prioritized by relevance scoring
      // console.log("Venues sorted by relevance:", sortedVenues.map((v: Venue, i: number) => {
      //   const topEvent = v.events[0];
      //   return `${i}: ${v.venue} (score: ${v.relevanceScore?.toFixed(2)}, top event: "${topEvent?.title}")`;
      // }));
      
      // Select prioritized venues
      selectVenues(sortedVenues);
      
      // Store the entire cluster if it contains multiple venues
      if (cluster.clusterType === 'multi') {
        selectCluster(cluster);
      } else {
        selectCluster(null);
      }
      
      // For backward compatibility - select the first (most relevant) venue as primary
      selectVenue(sortedVenues[0]);
      
      // Calculate center coordinates for the cluster
      const coordinates = cluster.clusterType === 'multi'
        ? [
            cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) / cluster.venues.length,
            cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) / cluster.venues.length
          ]
        : [cluster.venues[0].longitude, cluster.venues[0].latitude];
      
      // Move camera to the cluster
      cameraRef.current?.setCamera({
        centerCoordinate: coordinates,
        zoomLevel: 14,
        animationDuration: 500,
      });

      // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT - Track successful cluster interaction
      // const interactionDuration = Date.now() - interactionStartTime;
      // analytics.trackMapInteraction('cluster_clicked', {
      //   cluster_id: cluster.id,
      //   cluster_type: cluster.clusterType,
      //   venue_count: cluster.venues.length,
      //   event_count: cluster.eventCount,
      //   special_count: cluster.specialCount,
      //   time_status: cluster.timeStatus,
      //   interest_level: cluster.interestLevel,
      //   is_broadcasting: cluster.isBroadcasting,
      //   interaction_duration_ms: interactionDuration,
      //   distance_to_cluster_meters: distanceToCluster,
      //   current_zoom_level: zoomLevel,
      //   session_interactions: sessionClusterInteractions.current,
      //   is_guest: isGuest,
      //   // Relevance analytics
      //   high_relevance_events: highRelevanceEvents,
      //   saved_event_matches: savedEventMatches,
      //   interest_matches: interestMatches,
      //   has_user_location: !!userLocation,
      //   top_venue: sortedVenues[0]?.venue || 'unknown',
      //   top_venue_score: sortedVenues[0]?.relevanceScore || 0
      // });

      // Track personalization effectiveness
      // if (savedEventMatches > 0 || interestMatches > 0) {
      //   analytics.trackFeatureEngagement('personalized_cluster_selection', {
      //     saved_matches: savedEventMatches,
      //     interest_matches: interestMatches,
      //     total_events: cluster.eventCount + cluster.specialCount
      //   });
      // }
      
    } catch (error) {
      console.error("Error in handleMarkerPress:", error);
      
      // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT
      // analytics.trackError('cluster_interaction_error',
      //   error instanceof Error ? error.message : 'Unknown cluster error',
      //   {
      //     cluster_id: cluster.id,
      //     screen: 'map',
      //     interaction_duration_ms: Date.now() - interactionStartTime
      //   }
      // );
      
      // Fallback to original functionality if scoring fails
      const defaultVenues = [...cluster.venues];
      selectVenues(defaultVenues);
      selectVenue(defaultVenues[0]);
      selectCluster(cluster.clusterType === 'multi' ? cluster : null);
    }
  }, [isGuest, trackInteraction, location]); // REMOVED analytics, zoomLevel dependencies

  // Handle map press to close callout
  const handleMapPress = () => {
    // 🔥 ANALYTICS: Track map exploration (tapping on empty areas)
    analytics.trackMapInteraction('map_exploration', {
      has_active_callout: !!(selectedVenues && selectedVenues.length > 0),
      has_active_filter_panel: !!activeFilterPanel,
      current_zoom: zoomLevel,
      visible_clusters: visibleClusterIds.current.size,
      is_guest: isGuest
    });

    // Only close if there's a callout currently open
    if (selectedVenues && selectedVenues.length > 0) {
      selectVenue(null);
      // Analytics for callout closure tracked in useEffect above
    }
    // Close filter panel if open
    if (activeFilterPanel) {
      setActiveFilterPanel(null);
      // Analytics for filter panel closure tracked in useEffect above
    }
  };

  // Auto-hide filter pills functionality
  const hidePills = useCallback(() => {
    // Don't hide if filter panel is open
    if (activeFilterPanel) return;
    
    // LOG: Hiding filter pills animation started
    // console.log('EXECUTING hidePills animation to -100');
    Animated.timing(pillsAnimation, {
      toValue: -100, // Hide above screen
      duration: 200, // Faster animation
      useNativeDriver: true,
    }).start(() => {
      console.log('hidePills animation completed');
    });
  }, [activeFilterPanel, pillsAnimation]);

  const showPills = useCallback(() => {
    // LOG: Showing filter pills animation started
    // console.log('EXECUTING showPills animation to 0');
    Animated.timing(pillsAnimation, {
      toValue: 0, // Show in normal position
      duration: 200, // Faster animation
      useNativeDriver: true,
    }).start(() => {
    //  console.log('showPills animation completed');
    });
  }, [pillsAnimation]);

  const handleMapMovementStart = useCallback(() => {
    // LOG: Map movement started - triggers filter pills hiding
    // console.log('MAP MOVEMENT START - activeFilterPanel:', activeFilterPanel);
    setIsMapMoving(true);
    mapInteractionStartTime.current = Date.now();
    
    // Clear any existing timeouts
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    
    // Hide pills immediately when movement starts (unless filter panel is open)
    if (!activeFilterPanel) {
      console.log('HIDING PILLS');
      hidePills();
    } else {
      console.log('NOT HIDING - filter panel is open');
    }
  }, [activeFilterPanel, hidePills]);

  const handleMapMovementEnd = useCallback(() => {
    // LOG: Map movement ended - triggers filter pills showing
    // console.log('MAP MOVEMENT END');
    setIsMapMoving(false);
    
    // 🔥 ANALYTICS: Track map movement session
    if (mapInteractionStartTime.current) {
      const movementDuration = Date.now() - mapInteractionStartTime.current;
      analytics.trackMapInteraction('map_movement_session', {
        duration_ms: movementDuration,
        zoom_change: Math.abs(zoomLevel - lastZoomLevel.current),
        is_guest: isGuest
      });
      mapInteractionStartTime.current = null;
    }
    
    // Clear any existing timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }
    
    // Show pills after a shorter delay when movement stops
    showTimeoutRef.current = setTimeout(() => {
      console.log('SHOWING PILLS AFTER DELAY');
      showPills();
    }, 300); // Much shorter delay: 300ms instead of 1000ms
  }, [showPills, analytics, zoomLevel, isGuest]); // 🔥 RESTORED: Full dependencies for testing

  // Add this right before the return statement in the component
  //console.log("RENDERING MAP - callout conditions:", {
  //  hasSelectedVenues: selectedVenues && selectedVenues.length > 0,
  //  selectedVenuesCount: selectedVenues ? selectedVenues.length : 0,
  //  selectedVenueNames: selectedVenues ? selectedVenues.map(v => v.venue) : []
  //});

  // Handle map camera changes (both zoom and movement) with debouncing for movement detection
  const handleCameraChange = useCallback((e: any) => {
    const now = Date.now();
    const zoom = e.properties.zoom;
    
    // Handle zoom changes (restore clustering functionality)
    if (zoom) {
      // 🔥 ANALYTICS: Track significant zoom changes
      const zoomDelta = Math.abs(zoom - lastZoomLevel.current);
      if (zoomDelta > 0.5) { // Only track significant zoom changes
        analytics.trackMapInteraction('zoom_change', {
          from_zoom: lastZoomLevel.current,
          to_zoom: zoom,
          delta: zoomDelta,
          direction: zoom > lastZoomLevel.current ? 'in' : 'out',
          visible_clusters_before: visibleClusterIds.current.size,
          is_guest: isGuest
        });
        lastZoomLevel.current = zoom;
      }

      // Determine if we've crossed a threshold boundary
      const newThresholdIndex = getThresholdIndexForZoom(zoom);
      const thresholdChanged = newThresholdIndex !== currentThresholdIndex.current;
      
      // If threshold has changed, clear the visible cluster cache to force recalculation
      if (thresholdChanged) {
        // 🔥 ANALYTICS: Track threshold changes for clustering analysis
        analytics.trackMapInteraction('clustering_threshold_changed', {
          from_threshold: ZOOM_THRESHOLDS[currentThresholdIndex.current].name,
          to_threshold: ZOOM_THRESHOLDS[newThresholdIndex].name,
          zoom_level: zoom,
          clusters_visible_before: visibleClusterIds.current.size
        });

        //  console.log(`THRESHOLD CHANGE: ${ZOOM_THRESHOLDS[currentThresholdIndex.current].name} → ${ZOOM_THRESHOLDS[newThresholdIndex].name}`);
        visibleClusterIds.current.clear();
        currentThresholdIndex.current = newThresholdIndex;
      }
      
      setZoomLevel(zoom);
    }
    
    // Handle movement detection with improved thresholds
    const timeSinceLastChange = now - lastCameraChangeRef.current;
    lastCameraChangeRef.current = now;
    
    // Lower threshold for movement start detection to catch small movements
    if (!isMapMoving && timeSinceLastChange > 50) { // Reduced from 100ms to 50ms
    //  console.log('MOVEMENT START DETECTED - timeSinceLastChange:', timeSinceLastChange);
      handleMapMovementStart();
    }
    
    // Clear any existing end timeout and set a new one
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    // Set timeout to detect when movement has stopped - longer timeout for better detection
    hideTimeoutRef.current = setTimeout(() => {
      if (isMapMoving) {
    //    console.log('MOVEMENT END DETECTED - no camera changes for 250ms');
        handleMapMovementEnd();
      }
    }, 250); // Increased from 150ms to 250ms for more reliable detection
    
    // FALLBACK: Always ensure pills come back after any camera interaction
    // Clear any existing fallback timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
    }
    
    // Set a longer fallback timeout to guarantee pills return
    showTimeoutRef.current = setTimeout(() => {
      if (isMapMoving) {
      //  console.log('FALLBACK TRIGGERED - forcing pills to show after 1 second');
        handleMapMovementEnd();
      }
    }, 1000); // 1 second fallback to ensure pills always come back
  }, [isMapMoving, handleMapMovementStart, handleMapMovementEnd]); // REMOVED analytics, isGuest dependencies

  // Effect to show pills when filter panel opens
  useEffect(() => {
    if (activeFilterPanel) {
      // If filter panel opens, always show pills
      showPills();
      // Clear any pending timeouts
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
    }
  }, [activeFilterPanel, showPills]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  // Handle event selection in callout
  const handleEventSelected = (event: Event) => {
    // 🔥 ANALYTICS: Track specific event selection from callout
    analytics.trackEventViewWithContext({
      id: event.id,
      title: event.title,
      category: event.category,
      type: event.type || 'event',
      venue: event.venue
    });

    analytics.trackMapInteraction('callout_event_selected', {
      event_id: event.id,
      event_title: event.title,
      event_category: event.category,
      venue_name: event.venue,
      selection_source: 'map_callout',
      is_guest: isGuest
    });

    // You could add additional logic here, such as highlighting the event on the map
    console.log('Selected event:', event.title);
  };

  // Render cluster markers on the map with improved stability
  const renderClusterMarkers = () => {
    // Get the current threshold index and determine if it changed
    const thresholdIndex = getThresholdIndexForZoom(zoomLevel);
    const thresholdChanged = thresholdIndex !== currentThresholdIndex.current;
    
    // Check if filter criteria changed by comparing with previous
    const filterChanged = JSON.stringify(filterCriteria) !== JSON.stringify(previousFilterCriteria.current);
    
    //console.log(`Rendering ${clusters.length} clusters with zoom level ${zoomLevel.toFixed(2)}`);
    
    // If this is the first render, threshold changed, OR filter changed, recalculate visible clusters
    if (visibleClusterIds.current.size === 0 || thresholdChanged || filterChanged) {
      // Update our tracking references
      if (thresholdChanged) {
        currentThresholdIndex.current = thresholdIndex;
      }
      if (filterChanged) {
        previousFilterCriteria.current = { ...filterCriteria };
     //   console.log('FILTER CRITERIA CHANGED - forcing cluster recalculation');
      }
      
      // Calculate which clusters should be visible based on current filters
      const visibleClusters = clusters.filter(cluster => 
        shouldClusterBeVisible(cluster, filterCriteria)
      );
      
      // Store their IDs for future reference
      visibleClusterIds.current = new Set(
        visibleClusters.map(cluster => cluster.id)
      );
      
      // Enhanced debug logging
      const reason = visibleClusterIds.current.size === 0 ? 'FIRST_RENDER' : 
                    thresholdChanged ? 'THRESHOLD_CHANGE' : 
                    filterChanged ? 'FILTER_CHANGE' : 'UNKNOWN';
      
    //  console.log(`VISIBILITY RECALCULATED (${reason}): ${visibleClusters.length}/${clusters.length} clusters visible`);
      
      if (filterChanged) {
        console.log('Filter criteria:', {
          showEvents: filterCriteria.showEvents,
          showSpecials: filterCriteria.showSpecials,
          eventTimeFilter: filterCriteria.eventFilters.timeFilter,
          specialTimeFilter: filterCriteria.specialFilters.timeFilter,
          eventCategory: filterCriteria.eventFilters.category,
          specialCategory: filterCriteria.specialFilters.category
        });

        // 🔥 ANALYTICS: TEMPORARILY COMMENTED OUT
        // analytics.trackMapInteraction('cluster_visibility_changed', {
        //   reason,
        //   visible_before: visibleClusterIds.current.size,
        //   visible_after: visibleClusters.length,
        //   total_clusters: clusters.length,
        //   filter_active: hasFiltersApplied,
        //   zoom_level: zoomLevel
        // });
      }
      
      visibleClusters.forEach(cluster => {
       // console.log(`  - Visible cluster: ${cluster.id} (${cluster.eventCount} events, ${cluster.specialCount} specials)`);
      });
    } else {
      // Debug logging for stable visibility
     // console.log(`STABLE VISIBILITY: Using ${visibleClusterIds.current.size}/${clusters.length} previously visible clusters`);
    }
    
    // Render only clusters that we've determined should be visible
    return clusters
      .filter(cluster => visibleClusterIds.current.has(cluster.id))
      .map((cluster: Cluster, index: number) => {
        // Calculate the coordinates for the cluster
        const coordinates =
          cluster.clusterType === 'multi'
            ? [
                cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) /
                  cluster.venues.length,
                cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) /
                  cluster.venues.length
              ]
            : [cluster.venues[0].longitude, cluster.venues[0].latitude];
      
        // Check if this cluster contains the selected venue
        const isSelected =
          selectedVenues && selectedVenues.length > 0
            ? cluster.venues.some((venue: Venue) =>
                selectedVenues.some(selectedVenue => selectedVenue.locationKey === venue.locationKey)
              )
            : false;

        // 🎯 TUTORIAL INTEGRATION: Add targeting for closest cluster
        const isClosestCluster = index === 0; // First cluster is prioritized
      
        return (
          <MapboxGL.MarkerView
            key={`cluster-${cluster.id}`}
            id={`cluster-${cluster.id}`}
            coordinate={coordinates}
            anchor={{ x: 0.5, y: 1.0 }}
          >
            <TouchableOpacity 
              onPress={() => handleMarkerPress(cluster)}
              testID={isClosestCluster ? "closest-cluster" : undefined}
            >
              <TreeMarker cluster={cluster} isSelected={isSelected} />
            </TouchableOpacity>
          </MapboxGL.MarkerView>
        );
      });
  };

  // Render error state if there is an error
  if (error) {
    // 🔥 ANALYTICS: Track error display
    analytics.trackError('map_render_error', error, { screen: 'map' });
    
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  // Render the map
  return (
    <View style={styles.container}>
      {/* Add Filter Bar at the top */}
      <Animated.View
        style={{
          transform: [{ translateY: pillsAnimation }],
          zIndex: 5,
          position: 'relative',
        }}
      >
        <View testID="filter-pills">
          <FilterPills />
        </View>
      </Animated.View>
      
      <MapboxGL.MapView 
        ref={mapRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        onDidFinishLoadingMap={() => {
          console.log('Map finished loading');
          // 🔥 ANALYTICS: Track map load completion
          analytics.trackMapInteraction('map_loaded', {
            is_guest: isGuest,
            has_location_permission: locationPermissionGranted
          });
        }}
        onMapLoadingError={() => {
          console.log('Map failed to load');
          // 🔥 ANALYTICS: Track map load errors
          analytics.trackError('map_load_error', 'Map failed to load', { screen: 'map' });
        }}
        onCameraChanged={handleCameraChange}
        onPress={handleMapPress}
      >
        <MapboxGL.Camera
          ref={cameraRef}
          zoomLevel={12}
          centerCoordinate={initialCenterCoordinate}
          followUserLocation={false}
          followZoomLevel={12}
        />
        
        {/* Render the user location marker if we have location and permission */}
        {location && locationPermissionGranted && (
          <UserLocationMarker location={location} />
        )}
        
        {/* Render event markers */}
        {!isLoading && renderClusterMarkers()}
      </MapboxGL.MapView>
      
      {/* Add the Re-center button */}
      {location && locationPermissionGranted && (
        <RecenterButton 
          onPress={handleRecenterPress}
          disabled={!location} 
        />
      )}
      
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <Text>Loading map data...</Text>
        </View>
      )}
      
      {selectedVenues && selectedVenues.length > 0 && (
        <>
          {/* Optional background dimming overlay */}
          <Animated.View 
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: 'black',
                opacity: calloutAnimation.interpolate({
                  inputRange: [0, SCREEN_HEIGHT],
                  outputRange: [0.3, 0],
                  extrapolate: 'clamp'
                }),
                zIndex: 4
              }
            ]}
            pointerEvents="none"
          />
          
          {/* Callout container */}
          <Animated.View 
            style={[
              styles.calloutAnimatedContainer,
              { transform: [{ translateY: calloutAnimation }] }
            ]}
          >
            <EventCallout 
              venues={selectedVenues}
              cluster={selectedCluster}
              onClose={() => selectVenue(null)}
              onEventSelected={handleEventSelected}
            />
          </Animated.View>
        </>
      )}
      
      {/* Guest limitation registration prompt - only for guests */}
      {isGuest && <RegistrationPrompt />}
    </View>
  );
}

// Styles remain the same
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  errorText: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    padding: 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Marker container - must be a single top-level view
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 100, 
    height: 120,
    // Debugging border - remove for production
    // borderWidth: 1,
    // borderColor: 'red',
  },
  // Tree elements
  markerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // User location marker
  userMarkerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  userMarkerDot: {
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 3,
  },
  treeTop: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 3,
  },
  venueCountContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row', // Add this to ensure horizontal alignment
    zIndex: 4,
  },
  venueCountText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 0,
  },
  treeTrunk: {
    marginTop: -2,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 3,
    zIndex: 2,
  },
  markerLabel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 5,
    marginTop: -1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDDDDD',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    zIndex: 1,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  countText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333333',
    marginLeft: 2,
  },
  timeIndicator: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
    zIndex: 4,
  },
  timeIndicatorText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
  },
  // Broadcasting effect styles
  broadcastContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  broadcastRing: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'solid',
  },
  calloutAnimatedContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
  },
  // Re-center button styles
  recenterButton: {
    position: 'absolute',
    bottom: 40,
    right: 10,
    backgroundColor: 'white',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 10,
  },
  recenterButtonDisabled: {
    backgroundColor: '#F5F5F5',
    shadowOpacity: 0.1,
  }
});

// Explicitly mark the default export for Expo Router
const MapPage = MapScreen;
export default MapPage;