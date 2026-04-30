/**
 * Map gesture gating when callout is visible
 *
 * WHY:
 *   When the bottom callout is open, vertical drags should scroll the callout—NOT pan the map underneath.
 *   Otherwise Android often lets the map steal the gesture.
 *
 * WHAT:
 *   - Compute isCalloutOpen from selectedCluster/selectedVenues.
 *   - Set MapView scrollEnabled/zoomEnabled/rotateEnabled/pitchEnabled = !isCalloutOpen.
 *
 * EFFECT:
 *   Prevents the map from intercepting callout drags on Android. iOS remains unaffected.
 */

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, PixelRatio, TouchableOpacity, Easing, Keyboard, Pressable, Image, Modal, InteractionManager } from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapboxGL from '@rnmapbox/maps';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Platform } from 'react-native';



// Analytics integration
import useAnalytics from '../../hooks/useAnalytics';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';

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
import MapLegend from '../../components/map/MapLegend';
import InterestFilterPills from '../../components/map/InterestFilterPills';
import InterestsCarousel from '../../components/map/InterestsCarousel';
import HotFlamePill from '../../components/map/HotFlamePill';

import EventCallout from '../../components/map/EventCallout';
import EventImageLightbox from '../../components/map/EventImageLightbox';
import HotspotHighlight from '../../components/map/HotspotHighlight';
import MapTracePanel from '../../components/debug/MapTracePanel';
import StaticDebugCallout from '../../components/map/StaticDebugCallout';
import CompactCalloutAdWarmup from '../../components/ads/CompactCalloutAdWarmup';

// Import centralized date utilities
import { 
  isEventNow, 
  isEventHappeningToday, 
  getEventTimeStatus 
} from '../../utils/dateUtils';

// Import user service for preferences
import { getUserInterestsSync, getSavedEventsSync, getFavoriteVenuesSync } from '../../store/userPrefsStore';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';

// Import from store utility - assuming this is exported from your store
import { ZOOM_THRESHOLDS, getThresholdIndexForZoom, calculateDistance } from '../../store/mapStore';

// Import viewport calculation utilities
import {
  getViewportBoundingBox,
  roundBoundingBoxForCache,
  formatBoundingBoxForAPI,
  type BoundingBox,
  type GeoCoordinate
} from '../../utils/geoUtils';
import {
  MAP_TRACE_UI_ENABLED,
  captureMapTraceSamplers,
  registerMapTraceSampler,
  setMapTraceSnapshot,
  traceMapEvent,
} from '../../utils/mapTrace';

// Initialize Mapbox token
try {
  MapboxGL.setAccessToken('MAPBOX_ACCESS_TOKEN_REMOVED');
} catch (error) {
  console.error('Error setting Mapbox token:', error);
}

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HOTSPOT_HARD_DISABLED_FOR_PREVIEW_DEBUG = false;
const STATIC_CALLOUT_ISOLATION_DEBUG = false;
const IOS_CALLOUT_NATIVE_AD_ISOLATION_DEBUG = Platform.OS === 'ios';
const ANDROID_MAPBOX_STARTUP_ISOLATION_DEBUG = false;
const ANDROID_CLUSTER_MARKERVIEW_ISOLATION_DEBUG = false;
const DEBUG_TREE_MARKER_EVENTS = false;
const STAGE_CLUSTER_MARKERS_ON_STARTUP = Platform.OS === 'android';
const STARTUP_CLUSTER_MARKER_LIMIT = 12;
const FULL_CLUSTER_MARKER_DELAY_MS = 1000;
const RICH_CLUSTER_MARKER_DELAY_MS = Platform.OS === 'ios' ? 0 : 2000;
const ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS = 0;
const ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_BACKUP_MS = 4000;

const getAndroidHotspotStartupPhase = (): string | null => {
  if (Platform.OS !== 'android') {
    return null;
  }

  return ((global as any).mapHotspotStartupPhase as string | undefined) ?? null;
};

const isAndroidHotspotStartupCameraActive = (): boolean => {
  const phase = getAndroidHotspotStartupPhase();
  return phase === 'running' || phase === 'overlay_ready';
};

const getStartupClusterScore = (cluster: Cluster): number => {
  const statusScore =
    cluster.timeStatus === 'now'
      ? 100000
      : cluster.timeStatus === 'today'
      ? 50000
      : 0;
  const contentScore = ((cluster.eventCount || 0) + (cluster.specialCount || 0)) * 100;
  return statusScore + contentScore + (cluster.venues?.length || 0);
};

const pickStartupClusters = (clusters: Cluster[], limit: number): Cluster[] => {
  if (clusters.length <= limit) {
    return clusters;
  }

  const startupClusterIds = new Set(
    [...clusters]
      .sort((a, b) => getStartupClusterScore(b) - getStartupClusterScore(a))
      .slice(0, limit)
      .map(cluster => cluster.id)
  );

  return clusters.filter(cluster => startupClusterIds.has(cluster.id));
};

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

// Helper function to get icon for category
const getCategoryIcon = (category: string): string => {
  const categoryLower = category.toLowerCase();

  // Handle variations in category names
  if (categoryLower.includes('live music') || categoryLower.includes('music')) {
    return 'audiotrack';
  }
  if (categoryLower.includes('comedy')) {
    return 'sentiment-very-satisfied';
  }
  if (categoryLower.includes('sport')) {
    return 'sports-basketball';
  }
  if (categoryLower.includes('trivia')) {
    return 'psychology-alt';
  }
  if (categoryLower.includes('workshop') || categoryLower.includes('class')) {
    return 'school';
  }
  if (categoryLower.includes('religious') || categoryLower.includes('church')) {
    return 'church';
  }
  if (categoryLower.includes('family')) {
    return 'family-restroom';
  }
  if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) {
    return 'nightlife';
  }
  if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) {
    return 'theaters';
  }
  if (categoryLower.includes('happy hour')) {
    return 'local-bar';
  }
  if (categoryLower.includes('food') || categoryLower.includes('wing')) {
    return 'restaurant';
  }
  if (categoryLower.includes('drink')) {
    return 'wine-bar';
  }

  // Default fallback icon
  return 'category';
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
          outputRange: [0, 0.4, 0], // Changed from [0.6, 0.4, 0] to start invisible
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
 * Category Carousel component - rotates through all categories in a cluster
 * Prioritizes user interests first, then cycles through all remaining categories
 */
interface CategoryCarouselProps {
  cluster: Cluster;
  size: number;
}

interface CategoryItem {
  category: string;
  count: number;
  isUserInterest: boolean;
}

const CategoryCarousel: React.FC<CategoryCarouselProps> = ({ cluster, size }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Get user interests
  const userInterests = getUserInterestsSync();

  // Extract all categories from cluster with counts
  const categoryItems = useMemo(() => {
    const categoryMap = new Map<string, number>();

    // Count categories from all events in all venues
    cluster.venues.forEach(venue => {
      venue.events.forEach(event => {
        const currentCount = categoryMap.get(event.category) || 0;
        categoryMap.set(event.category, currentCount + 1);
      });
    });

    // Convert to array with user interest flag
    const items: CategoryItem[] = Array.from(categoryMap.entries()).map(([category, count]) => ({
      category,
      count,
      isUserInterest: userInterests.includes(category),
    }));

    // Sort: user interests first, then by count (descending)
    items.sort((a, b) => {
      if (a.isUserInterest && !b.isUserInterest) return -1;
      if (!a.isUserInterest && b.isUserInterest) return 1;
      return b.count - a.count;
    });

    // Debug: log unique categories
    // if (items.length > 0) {
    //   console.log(`[CategoryCarousel] Cluster ${cluster.id} has ${items.length} unique categories:`,
    //     items.map(i => `${i.category}(${i.count})`).join(', '));
    // }

    return items;
  }, [cluster, userInterests]);

  // Clamp index when categories shrink (e.g., filters reduce to 0/1)
  useEffect(() => {
    if (categoryItems.length === 0) return;
    if (currentIndex >= categoryItems.length) {
      setCurrentIndex(0);
    }
  }, [categoryItems.length, currentIndex]);

  // Rotate through categories (only if there are 2+ unique categories)
  useEffect(() => {
    if (categoryItems.length <= 1) return; // Don't animate if only one category

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        // Change index
        setCurrentIndex((prev) => (prev + 1) % categoryItems.length);

        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }, 2500); // 2.5 seconds per category

    return () => clearInterval(interval);
  }, [categoryItems.length, fadeAnim]);

  // Pulse animation for user interests
  useEffect(() => {
    if (categoryItems.length === 0) return;

    const currentItem = categoryItems[currentIndex];
    if (currentItem?.isUserInterest) {
      // Start pulsing
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
        ])
      ).start();
    } else {
      // Reset pulse
      pulseAnim.setValue(1);
    }
  }, [currentIndex, categoryItems, pulseAnim]);

  if (categoryItems.length === 0) return null;

  const currentItem = categoryItems[currentIndex];
  if (!currentItem) return null;
  const iconName = getCategoryIcon(currentItem.category);

  return (
    <Animated.View
      style={[
        styles.categoryCarousel,
        {
          opacity: fadeAnim,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Light blue glow for user interests */}
      {currentItem.isUserInterest && (
        <View style={styles.interestGlow} />
      )}

      <MaterialIcons
        name={iconName as any}
        size={size * 0.75}
        color={currentItem.isUserInterest ? '#4A90E2' : '#333333'}
        style={styles.categoryIcon}
      />
      <Text
        style={[
          styles.categoryCount,
          {
            fontSize: size * 0.6,
            color: currentItem.isUserInterest ? '#4A90E2' : '#333333',
          },
        ]}
      >
        {currentItem.count}
      </Text>
    </Animated.View>
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

// Animated "New Content" Indicator Dot for map markers
interface IndicatorDotProps {
  hasNewContent: boolean;
  style: any;
}

const IndicatorDot: React.FC<IndicatorDotProps> = ({ hasNewContent, style }) => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.9)).current;
  const fadeOpacity = useRef(new Animated.Value(hasNewContent ? 1 : 0)).current;

  // Breathing pulse animation
  useEffect(() => {
    if (hasNewContent) {
      // Fade in
      Animated.timing(fadeOpacity, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }).start();

      // Start continuous pulse
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
    } else {
      // Fade out smoothly when cleared
      Animated.timing(fadeOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [hasNewContent]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: Animated.multiply(fadeOpacity, pulseOpacity),
          transform: [{ scale: pulseScale }],
        },
      ]}
    />
  );
};

// Tree Marker component for map points
interface TreeMarkerProps {
  cluster: Cluster;
  isSelected: boolean;
  isProcessing?: boolean;
  isReady?: boolean;
  detailsEnabled?: boolean;
}

const TreeMarker: React.FC<TreeMarkerProps> = React.memo(({ cluster, isSelected, isProcessing = false, isReady = true, detailsEnabled = true }) => {
  // Determine color based on time status
  const color = getTimeStatusColor(cluster.timeStatus);

  // Determine size based on interest level
  const size = getInterestLevelSize(cluster.interestLevel);

  // Scale up if selected
  const scaleFactor = isSelected ? 1.2 : 1;
  const adjustedSize = size * scaleFactor;

  // Check if cluster contains Firestore-sourced events
  const hasFirestoreEvents = detailsEnabled
    ? cluster.venues.some(venue =>
        venue.events.some(event => event.source === 'firestore')
      )
    : false;

  // DEBUG: Log clusters with Firestore events
  if (DEBUG_TREE_MARKER_EVENTS && hasFirestoreEvents) {
    const fsEventCount = cluster.venues.reduce((count, venue) =>
      count + venue.events.filter(e => e.source === 'firestore').length, 0);
    console.log(`[TreeMarker] Cluster ${cluster.id} has ${fsEventCount} Firestore events`);
  }

  return (
    <View style={styles.markerWrapper}>
      {/* Category Carousel - positioned above the tree */}
      {detailsEnabled && <CategoryCarousel cluster={cluster} size={adjustedSize} />}

      {/* Broadcasting effect for 'now' events */}
      {detailsEnabled && cluster.isBroadcasting && (
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
            alignItems: 'center',
            opacity: !isReady ? 0.4 : isProcessing ? 0.6 : 1, // Dim when not ready or processing
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

        {/* New content indicator - animated red dot */}
        {detailsEnabled && cluster.hasNewContent && (
          <IndicatorDot
            hasNewContent
            style={[
              styles.newContentDot,
              {
                width: adjustedSize * 0.5,
                height: adjustedSize * 0.5,
                borderRadius: adjustedSize * 0.25,
                top: -(adjustedSize * 0.15),
                right: -(adjustedSize * 0.15),
              }
            ]}
          />
        )}

        {/* Firestore source indicator - subtle "F" badge in top-left */}
        {hasFirestoreEvents && (
          <View
            style={[
              styles.firestoreIndicator,
              {
                width: adjustedSize * 0.45,
                height: adjustedSize * 0.45,
                borderRadius: adjustedSize * 0.225,
                top: -(adjustedSize * 0.15),
                left: -(adjustedSize * 0.15),
              }
            ]}
          >
            <Text
              style={[
                styles.firestoreIndicatorText,
                { fontSize: adjustedSize * 0.25 }
              ]}
            >
              F
            </Text>
          </View>
        )}
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
            width: Math.max(adjustedSize * 3.4, 58),
            height: Math.max(adjustedSize * 0.5, 16),
          }
        ]}
      >
        {/* Event icon and count */}
        {cluster.eventCount > 0 && (
          <View style={styles.iconContainer}>
            <MaterialIcons
              name="event"
              size={Math.max(adjustedSize / 3, 11)}
              color="#2196F3"
            />
            <Text style={[styles.countText, { color: '#2196F3' }]}>{cluster.eventCount}</Text>
          </View>
        )}

        {/* Special icon and count */}
        {cluster.specialCount > 0 && (
          <View style={styles.iconContainer}>
            <MaterialIcons
              name="restaurant"
              size={Math.max(adjustedSize / 3, 11)}
              color="#34A853"
            />
            <Text style={[styles.countText, { color: '#34A853' }]}>{cluster.specialCount}</Text>
          </View>
        )}
      </View>

      {/* Processing indicator - pulsing ring overlay */}
      {isProcessing && (
        <View
          style={[
            styles.processingRing,
            {
              position: 'absolute',
              top: 0,
              left: adjustedSize * 0.75,
              width: adjustedSize * 1.5,
              height: adjustedSize * 1.5,
              borderRadius: adjustedSize,
              borderWidth: 2,
              borderColor: color,
              backgroundColor: 'transparent',
              opacity: 0.8,
            }
          ]}
        />
      )}

    </View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these specific props change
  return (
    prevProps.cluster.id === nextProps.cluster.id &&
    prevProps.cluster.timeStatus === nextProps.cluster.timeStatus &&
    prevProps.cluster.interestLevel === nextProps.cluster.interestLevel &&
    prevProps.cluster.eventCount === nextProps.cluster.eventCount &&
    prevProps.cluster.specialCount === nextProps.cluster.specialCount &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isProcessing === nextProps.isProcessing &&
    prevProps.isReady === nextProps.isReady &&
    prevProps.detailsEnabled === nextProps.detailsEnabled
  );
});

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

/**
 * DeepLinkLightbox - Standalone lightbox for deep links
 * Renders when globalSelectedImageData is set from deep link handlers
 * This is separate from the EventCallout lightbox (which only renders when a cluster is open)
 */
const DeepLinkLightbox = () => {
  const globalSelectedImageData = useMapStore((state) => state.selectedImageData);
  const setGlobalSelectedImageData = useMapStore((state) => state.setSelectedImageData);

  const handleClose = useCallback(() => {
    setGlobalSelectedImageData(null);
  }, [setGlobalSelectedImageData]);

  if (!globalSelectedImageData) return null;

  return (
    <Modal
      transparent={true}
      visible={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
      presentationStyle="overFullScreen"
      hardwareAccelerated={true}
    >
      <EventImageLightbox
        imageUrl={globalSelectedImageData.imageUrl}
        event={globalSelectedImageData.event}
        venue={globalSelectedImageData.venue}
        cluster={globalSelectedImageData.cluster}
        onClose={handleClose}
      />
    </Modal>
  );
};

 // Main Map Screen component
function MapScreen() {
   const ActiveCalloutComponent = STATIC_CALLOUT_ISOLATION_DEBUG ? StaticDebugCallout : EventCallout;
   // ───── DEBUG: Map load session & timers ─────
   const DEBUG_MAP_LOAD = __DEV__;
   const DEBUG_CAMERA_TICKS = false;
   const __ml_sessionIdRef = React.useRef<string>(`ML-${Date.now()}`);
   const __ml_t0Ref = React.useRef<number>(Date.now());
const __ml_firstMarkersLoggedRef = React.useRef<boolean>(false);
const __ml_cameraTickCountRef = React.useRef<number>(0);
const __ml_firstClustersLoggedRef = React.useRef<boolean>(false);
const __ml_firstFrameLoggedRef = React.useRef<boolean>(false);
const __ml_firstClustersReadyRef = React.useRef<boolean>(false);
const __ml_userStartAppliedRef = React.useRef<boolean>(false);
const __ml_styleReadyRef = React.useRef<boolean>(true);  // Set to true since callbacks don't work
const __ml_initialSnapDoneRef = React.useRef<boolean>(false);
const ANDROID_STARTUP_TIMING_DIAGNOSTICS = __DEV__ && Platform.OS === 'android';
const logAndroidStartupTiming = (label: string, details?: Record<string, unknown>) => {
  if (!ANDROID_STARTUP_TIMING_DIAGNOSTICS) {
    return;
  }

  console.warn('[GathRStartupTiming]', label, JSON.stringify({
    elapsedMs: Date.now() - __ml_t0Ref.current,
    ...(details ?? {}),
  }));
};
const [startupHotspotPreviewCluster, setStartupHotspotPreviewCluster] = useState<Cluster | null>(null);

// Preferred starting zoom (city-level)
const START_ZOOM = 12;

// Pick a start center dynamically:
// 1) If we already know the user's location, use it
// 2) Otherwise, fall back to your existing initialCenterCoordinate (global-safe)
const computeStartCenter = (): [number, number] => {
  if (location && location.coords && typeof location.coords.longitude === 'number' && typeof location.coords.latitude === 'number') {
    return [location.coords.longitude, location.coords.latitude];
  }
  return (initialCenterCoordinate as [number, number]) ?? [-63.128, 46.238];
};

useEffect(() => {
  if (Platform.OS !== 'android') {
    return undefined;
  }

  const globalAny = global as any;
  const previewClusterCallback = (cluster: Cluster | null) => {
    setStartupHotspotPreviewCluster(cluster);
    logAndroidStartupTiming('hotspot_preview_marker_callback', {
      clusterId: cluster?.id ?? null,
      venueCount: cluster?.venues?.length ?? 0,
    });
  };

  globalAny.mapStartupHotspotPreviewClusterCallback = previewClusterCallback;

  return () => {
    if (globalAny.mapStartupHotspotPreviewClusterCallback === previewClusterCallback) {
      delete globalAny.mapStartupHotspotPreviewClusterCallback;
    }
  };
}, []);



  // 🔥 ANALYTICS INTEGRATION: Initialize analytics hook
  const analytics = useAnalytics();

  // Auth state for guest checking  
  const { user } = useAuth(); // Adjust import path as needed
  const isGuest = !user;

  // Guest limitation hook - only for guests
  const { trackInteraction } = useGuestInteraction();

  // Focus state - skip expensive renders when Map tab is not visible
  const isFocused = useIsFocused();

  // Use the map store - individual selectors to prevent infinite loops
  // (Combined object selectors with shallow cause getSnapshot caching issues)
  const clusters = useMapStore((state) => state.clusters);
  const events = useMapStore((state) => state.events);
  const viewportEvents = useMapStore((state) => state.viewportEvents);
  const selectedVenue = useMapStore((state) => state.selectedVenue);
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  const selectedCluster = useMapStore((state) => state.selectedCluster);
  const isLoading = useMapStore((state) => state.isLoading);
  const error = useMapStore((state) => state.error);
  const fetchEvents = useMapStore((state) => state.fetchEvents);
  const fetchViewportEvents = useMapStore((state) => state.fetchViewportEvents);
  const prefetchIfStale = useMapStore((state) => state.prefetchIfStale);
  const selectVenue = useMapStore((state) => state.selectVenue);
  const selectVenues = useMapStore((state) => state.selectVenues);
  const selectCluster = useMapStore((state) => state.selectCluster);
  const setZoomLevel = useMapStore((state) => state.setZoomLevel);
  const generateClusters = useMapStore((state) => state.generateClusters);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const zoomLevel = useMapStore((state) => state.zoomLevel);
  const shouldClusterBeVisible = useMapStore((state) => state.shouldClusterBeVisible);
  const setUserLocation = useMapStore((state) => state.setUserLocation);
  const activeFilterPanel = useMapStore((state) => state.activeFilterPanel);
  const setActiveFilterPanel = useMapStore((state) => state.setActiveFilterPanel);
  const closeCalloutTrigger = useMapStore((state) => state.closeCalloutTrigger);
  const triggerCloseCallout = useMapStore((state) => state.triggerCloseCallout);
  const isHeaderSearchActive = useMapStore((state) => state.isHeaderSearchActive);
  const setHeaderSearchActive = useMapStore((state) => state.setHeaderSearchActive);
  const setTypeFilters = useMapStore((state) => state.setTypeFilters);

  // Is the bottom callout visible?
  const isCalloutOpen = !!selectedCluster || (Array.isArray(selectedVenues) && selectedVenues.length > 0);
  const selectedVenueCount = Array.isArray(selectedVenues) ? selectedVenues.length : 0;
  const selectedClusterId = selectedCluster?.id ?? null;

  // 🎯 TUTORIAL INTEGRATION: Make map store available globally
  useEffect(() => {

    (global as any).mapStore = {
      clusters,
      selectedVenues,
      filterCriteria,
      zoomLevel
    };
    return () => {
      delete (global as any).mapStore;
    };
  }, [clusters, selectedVenues, filterCriteria, zoomLevel]);

  // Keep tutorial/hotspot refs stable across normal cluster/filter/zoom updates.
  // Android hotspot startup can hit a passive-effect cleanup window if these
  // globals are deleted every time mapStore refreshes.
  useEffect(() => {
    (global as any).mapCameraRef = cameraRef;
    (global as any).mapViewRef = mapRef;

    return () => {
      const globalAny = global as any;
      if (globalAny.mapCameraRef === cameraRef) {
        delete globalAny.mapCameraRef;
      }
      if (globalAny.mapViewRef === mapRef) {
        delete globalAny.mapViewRef;
      }
    };
  }, []);

  // Local state for location and map
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean>(false);
  const [hasInitiallyPositioned, setHasInitiallyPositioned] = useState<boolean>(false);
  const [processingClusterId, setProcessingClusterId] = useState<string | null>(null);
  const [clustersReady, setClustersReady] = useState<boolean>(false);
  const [fullClusterMarkersEnabled, setFullClusterMarkersEnabled] = useState<boolean>(false);
  const [richClusterMarkersEnabled, setRichClusterMarkersEnabled] = useState<boolean>(false);
  const [isTracePanelVisible, setIsTracePanelVisible] = useState(false);
  const [renderedCalloutVenues, setRenderedCalloutVenues] = useState<Venue[]>([]);
  const [renderedCalloutCluster, setRenderedCalloutCluster] = useState<Cluster | null>(null);
  const [calloutLayoutReadyKey, setCalloutLayoutReadyKey] = useState<string | null>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const calloutAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const mapRef = useRef<MapboxGL.MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const calloutAnimationRequestRef = useRef(0);
  const calloutOpenTouchGuardUntilRef = useRef(0);
  const latestClusterCountRef = useRef(0);
  const isMapLoadingRef = useRef(false);
  const clustersReadyForInteractionRef = useRef(false);
  const fullClusterMarkersEnabledRef = useRef(false);
  const fullClusterMarkersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const richClusterMarkersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestClusterCountRef.current = clusters.length;
  isMapLoadingRef.current = isLoading;

  // Make these ref objects available during the first passive-effect flush.
  // The daily hotspot can trigger synchronously on Android, before the older
  // global-ref effect above has run.
  (global as any).mapCameraRef = cameraRef;
  (global as any).mapViewRef = mapRef;

  const renderedCalloutVenueCount = renderedCalloutVenues.length;
  const renderedCalloutClusterId = renderedCalloutCluster?.id ?? null;
  const hasRenderedCallout = renderedCalloutVenueCount > 0;
  const selectedCalloutSignature = useMemo(
    () =>
      Array.isArray(selectedVenues) && selectedVenues.length > 0
        ? selectedVenues.map((venue) => venue.locationKey).join('|')
        : '',
    [selectedVenues]
  );
  const renderedCalloutSignature = useMemo(
    () =>
      renderedCalloutVenues.length > 0
        ? renderedCalloutVenues.map((venue) => venue.locationKey).join('|')
        : '',
    [renderedCalloutVenues]
  );
  const hasSelectedCalloutRendered =
    selectedCalloutSignature !== '' && selectedCalloutSignature === renderedCalloutSignature;
  const renderedCalloutPresentationKey = useMemo(
    () => `${renderedCalloutClusterId ?? 'single'}::${renderedCalloutSignature || 'no-venues'}`,
    [renderedCalloutClusterId, renderedCalloutSignature]
  );
  const isRenderedCalloutLayoutReady =
    hasSelectedCalloutRendered && calloutLayoutReadyKey === renderedCalloutPresentationKey;
  const presentedCalloutVenues =
    Array.isArray(selectedVenues) && selectedVenues.length > 0
      ? selectedVenues
      : renderedCalloutVenues;
  const presentedCalloutCluster =
    Array.isArray(selectedVenues) && selectedVenues.length > 0
      ? selectedCluster
      : renderedCalloutCluster;
  const presentedCalloutVenueCount = presentedCalloutVenues.length;
  const presentedCalloutClusterId = presentedCalloutCluster?.id ?? null;
  const hasPresentedCallout = presentedCalloutVenueCount > 0;
  const presentedCalloutSignature = useMemo(
    () =>
      presentedCalloutVenues.length > 0
        ? presentedCalloutVenues.map((venue) => venue.locationKey).join('|')
        : '',
    [presentedCalloutVenues]
  );
  const presentedCalloutPresentationKey = useMemo(
    () => `${presentedCalloutClusterId ?? 'single'}::${presentedCalloutSignature || 'no-venues'}`,
    [presentedCalloutClusterId, presentedCalloutSignature]
  );
  const clustersReadyForInteraction = !isLoading && clusters.length > 0;
  clustersReadyForInteractionRef.current = clustersReadyForInteraction;
  fullClusterMarkersEnabledRef.current = fullClusterMarkersEnabled;
  const shouldRenderAncillaryOverlays = !isCalloutOpen && !hasPresentedCallout;

  // Close filter panel and callouts only when the map tab actually loses focus.
  // A useFocusEffect cleanup tied to selectedVenues was firing during selection
  // changes and immediately tearing down a freshly opened callout on Android.
  useEffect(() => {
    if (isFocused) {
      return;
    }

    const cleanupTask = InteractionManager.runAfterInteractions(() => {
      console.log('[MapFocusCleanup] clearing map-only UI after blur', {
        activeFilterPanel: activeFilterPanel ?? 'none',
        selectedVenueCount: Array.isArray(selectedVenues) ? selectedVenues.length : 0,
      });
      if (activeFilterPanel) {
        setActiveFilterPanel(null);
      }
      if (selectedVenues && selectedVenues.length > 0) {
        selectVenue(null);
      }
      setRenderedCalloutVenues([]);
      setRenderedCalloutCluster(null);
      setCalloutLayoutReadyKey(null);
    });

    return () => {
      cleanupTask.cancel?.();
    };
  }, [
    activeFilterPanel,
    isFocused,
    selectedVenues,
    selectVenue,
    setActiveFilterPanel,
    setRenderedCalloutCluster,
    setRenderedCalloutVenues,
    setCalloutLayoutReadyKey,
  ]);

  // Hot interest carousel state (for HotFlamePill)
  const [hotInterestCarouselActive, setHotInterestCarouselActive] = useState(false);
  const hotInterestCarouselActiveRef = useRef(false);

  useEffect(() => {
    hotInterestCarouselActiveRef.current = hotInterestCarouselActive;
  }, [hotInterestCarouselActive]);

  useEffect(() => {
    if (!isCalloutOpen && !hasRenderedCallout) {
      return;
    }

    if (activeFilterPanel) {
      traceMapEvent('callout_forced_filter_panel_close', {
        activeFilterPanel,
      });
      setActiveFilterPanel(null);
    }

    if (hotInterestCarouselActiveRef.current) {
      traceMapEvent('callout_forced_hot_interest_close', {
        hotModeActive: true,
      });
      setHotInterestCarouselActive(false);
    }
  }, [activeFilterPanel, hasRenderedCallout, isCalloutOpen, setActiveFilterPanel]);

  useEffect(() => {
    traceMapEvent('map_screen_mounted');

    return () => {
      traceMapEvent('map_screen_unmounted');
    };
  }, []);

  useEffect(() => {
    setMapTraceSnapshot({
      isGuest,
      isLoading,
      clustersReady: clustersReadyForInteraction,
      clustersReadyState: clustersReady,
      clusterCount: clusters.length,
      processingClusterId: processingClusterId ?? null,
      selectedVenueCount,
      selectedClusterId,
      isCalloutOpen,
      renderedCalloutVenueCount,
      renderedCalloutClusterId,
      hasRenderedCallout,
      hasSelectedCalloutRendered,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      activeFilterPanel: activeFilterPanel ?? null,
      hotspotFilterActive: hotInterestCarouselActive,
      hasInitiallyPositioned,
      locationPermissionGranted,
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
    });
  }, [
    activeFilterPanel,
    clusters.length,
    clustersReady,
    clustersReadyForInteraction,
    hasSelectedCalloutRendered,
    hasInitiallyPositioned,
    hasRenderedCallout,
    hotInterestCarouselActive,
    isRenderedCalloutLayoutReady,
    isCalloutOpen,
    isGuest,
    isLoading,
    locationPermissionGranted,
    processingClusterId,
    renderedCalloutClusterId,
    renderedCalloutVenueCount,
    selectedClusterId,
    selectedVenueCount,
  ]);

  // Filter pills auto-hide functionality
  const [isMapMoving, setIsMapMoving] = useState<boolean>(false);

  // 0 = visible; we'll compute hidden distance from measured height
  const pillsAnimation = useRef(new Animated.Value(0)).current;
  const pillsOpacity = useRef(new Animated.Value(1)).current;

  // Measure pill row height so we can hide exactly by its height
  const [pillsHeight, setPillsHeight] = useState<number>(56); // sensible default

  useEffect(() => {
    const readAnimatedValue = (value: Animated.Value): number | string =>
      typeof (value as any).__getValue === 'function' ? (value as any).__getValue() : 'unknown';

    return registerMapTraceSampler('map_callout', () => ({
      calloutRequestId: calloutAnimationRequestRef.current,
      calloutTranslateY: readAnimatedValue(calloutAnimation),
      pillsTranslateY: readAnimatedValue(pillsAnimation),
      pillsOpacity: readAnimatedValue(pillsOpacity),
      selectedVenueCount,
      renderedCalloutVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
      hasRenderedCallout,
      hasSelectedCalloutRendered,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      isCalloutOpen,
      hotInterestCarouselActive,
      activeFilterPanel: activeFilterPanel ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      clustersReady: clustersReadyForInteraction,
      clustersReadyState: clustersReady,
      isLoading,
    }));
  }, [
    activeFilterPanel,
    calloutAnimation,
    clustersReady,
    clustersReadyForInteraction,
    hasSelectedCalloutRendered,
    hasRenderedCallout,
    hotInterestCarouselActive,
    isRenderedCalloutLayoutReady,
    isCalloutOpen,
    isLoading,
    pillsAnimation,
    pillsOpacity,
    renderedCalloutClusterId,
    renderedCalloutVenueCount,
    selectedClusterId,
    selectedVenueCount,
  ]);

  useEffect(() => {
    traceMapEvent('map_loading_state_changed', {
      isLoading,
      clusterCount: clusters.length,
    });
  }, [clusters.length, isLoading]);

  useEffect(() => {
    traceMapEvent('clusters_ready_state_changed', {
      clustersReady,
      clustersReadyForInteraction,
      clusterCount: clusters.length,
    });
  }, [clusters.length, clustersReady, clustersReadyForInteraction]);

  useEffect(() => {
    console.log('[CalloutProbe] store selection changed', {
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      isCalloutOpen,
    });
    traceMapEvent('callout_selection_state_changed', {
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      isCalloutOpen,
    });
  }, [isCalloutOpen, selectedClusterId, selectedVenueCount]);

  useEffect(() => {
    traceMapEvent('processing_cluster_state_changed', {
      processingClusterId: processingClusterId ?? 'none',
    });
  }, [processingClusterId]);

  // Dismiss interest carousel (both hot mode and category filters)
  const dismissInterestCarousel = useCallback((reason: string = 'unspecified') => {
    const mapState = useMapStore.getState();
    const liveFilterCriteria = mapState.filterCriteria;

    const hasActiveCategoryFilter =
      !!liveFilterCriteria.eventFilters.category ||
      !!liveFilterCriteria.specialFilters.category;
    const hotModeWasActive = hotInterestCarouselActiveRef.current;

    if (!hotModeWasActive && !hasActiveCategoryFilter) {
      return false;
    }

    if (hotModeWasActive) {
      setHotInterestCarouselActive(false);
    }

    // Only clear category filters that were set by interest pills
    if (liveFilterCriteria.eventFilters.categoryFilterSource === 'interest-pills') {
      setTypeFilters('event', { category: undefined });
    }
    if (liveFilterCriteria.specialFilters.categoryFilterSource === 'interest-pills') {
      setTypeFilters('special', { category: undefined });
    }

    return true;
  }, [setTypeFilters]);

  // Handle hot flame pill press
  const handleHotFlamePress = useCallback(() => {
    if (!hotInterestCarouselActive) {
      // Hot mode is a separate interest carousel mode; clear category pill filters when activating it.
      setTypeFilters('event', { category: undefined });
      setTypeFilters('special', { category: undefined });
    }

    setHotInterestCarouselActive((prev) => !prev);
  }, [hotInterestCarouselActive, setTypeFilters]);

  // Auto-dismiss hot mode if category filter is activated
  useEffect(() => {
    const hasActiveCategoryFilter =
      !!filterCriteria.eventFilters.category ||
      !!filterCriteria.specialFilters.category;

    if (hotInterestCarouselActive && hasActiveCategoryFilter) {
      setHotInterestCarouselActive(false);
    }
  }, [
    hotInterestCarouselActive,
    filterCriteria.eventFilters.category,
    filterCriteria.specialFilters.category,
  ]);

  // Actual map viewport dimensions (accounting for header, tab bar, safe areas)
  const [mapDimensions, setMapDimensions] = useState<{ width: number; height: number } | null>(null);

// Debounce + gating
/**
 * ────────────────────────────────────────────────────────────────────────────────
 * FILTER PILLS AUTO-HIDE: DEBOUNCE + GATING REFS
 *
 * - hideTimeoutRef: debounces “movement end” (250ms idle) before re-showing pills.
 * - showTimeoutRef: fallback re-show (1000ms) so pills can’t get “stuck” hidden.
 * - hideCapTimeoutRef: hard cap (MAX_HIDDEN_MS) so long zoom tails can’t hide forever.
 * - lastCameraChangeRef: timestamp of last camera tick for timing decisions.
 *
 * Paired with significance gating in handleCameraChange:
 *   • A tick is “meaningful” only if zoom/center/heading/pitch crosses thresholds.
 *   • Non-meaningful ticks DO NOT reset the movement-end debounce (prevents long
 *     zoom-out tails at low zoom from keeping pills hidden).
 * ────────────────────────────────────────────────────────────────────────────────
 */
const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const hideCapTimeoutRef = useRef<NodeJS.Timeout | null>(null); // force-show cap



const lastCameraChangeRef = useRef<number>(0);


// Track previous camera values to compute true deltas
const previousCenterRef = useRef<[number, number] | null>(null); // [lng, lat]
const previousHeadingRef = useRef<number | null>(null);
const previousPitchRef = useRef<number | null>(null);

// After pills re-show, ignore hides for a short window
const postShowLockoutUntilRef = useRef<number>(0);

// --- DEBUG: pills logging helper + session id ---
// Debug logging for Filter Pills (toggle-able)
// Set DEBUG_PILLS = true to print detailed pill hide/show and camera-change logs.
const pillsDebugSession = useRef(Math.floor(Math.random() * 1e6)).current;

/** Master switch for filter-pills logging. true = verbose logs, false = silent. */
const DEBUG_PILLS = false; /** Master switch for filter-pills logging. true = verbose logs, false = silent. */

const logPills = (msg: string, ctx?: Record<string, any>) => {
  if (!__DEV__ || !DEBUG_PILLS) return;
  const t = new Date().toISOString().split('T')[1]?.replace('Z','');
  console.log(`[PILLS ${pillsDebugSession}] ${t} ${msg}`, ctx || {});
};

// ------------------------------------------------

  // Ignore non-user (programmatic) camera moves for a short window
  const ignoreProgrammaticCameraRef = useRef<boolean>(false);
  const setIgnoreProgrammaticTrace = useCallback((value: boolean, reason: string) => {
    ignoreProgrammaticCameraRef.current = value;
    setMapTraceSnapshot({
      ignoreProgrammatic: value,
      ignoreProgrammaticReason: reason,
    });
    traceMapEvent(value ? 'ignore_programmatic_on' : 'ignore_programmatic_off', {
      reason,
    });
  }, []);

  // Enable auto-hide only after initial camera settle
  const autoHideEnabledRef = useRef<boolean>(false);

  // After a reload/tutorial, wait for the first real user gesture before allowing hides again
  const userGestureSeenRef = useRef<boolean>(false);

  // Viewport filtering refs
  const lastViewportBboxRef = useRef<BoundingBox | null>(null);
  const viewportFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastViewportFetchTimeRef = useRef<number>(0);  // Track last fetch timestamp for throttling
  const currentCameraStateRef = useRef<{ center: [number, number]; zoom: number } | null>(null);
  const startupFallbackViewportUsedRef = useRef(false);


  // Add a ref to track current zoom threshold and visible clusters for stability
const currentThresholdIndex = useRef<number>(getThresholdIndexForZoom(zoomLevel));
const visibleClusterIds = useRef<Set<string>>(new Set());
const previousFilterCriteria = useRef<FilterCriteria>(filterCriteria);
const previousClusterCount = useRef<number>(0);
const startupMarkerSubsetLoggedRef = useRef<boolean>(false);
const startupHotspotPreviewMarkerLoggedRef = useRef<boolean>(false);

  // 🔥 ANALYTICS: Add refs for tracking performance and behavior
const mapInteractionStartTime = useRef<number | null>(null);
const lastZoomLevel = useRef<number>(zoomLevel);
const sessionClusterInteractions = useRef<number>(0);
const clusterOpenStartRef = useRef<number | null>(null);
const lastOpenedClusterIdRef = useRef<string | number | null>(null);


  // Create a memoized initial center coordinate
  // This will only update when location changes, not on every render
  const initialCenterCoordinate = useMemo(() => {
    return location
      ? [location.coords.longitude, location.coords.latitude]
      : [-63.1276, 46.2336]; // Default to PEI coordinates
  }, [location]);

  const requestStartupViewportFetch = (
    center: GeoCoordinate,
    source: 'fallback_center' | 'gps_location'
  ) => {
    const { width, height } = Dimensions.get('window');
    const bbox = getViewportBoundingBox(center, START_ZOOM, width, height, 1.0);
    const roundedBbox = roundBoundingBoxForCache(bbox, 3);  // 3 decimals = ~110m resolution

    const previousBbox = lastViewportBboxRef.current;
    const bboxChanged = !previousBbox || JSON.stringify(roundedBbox) !== JSON.stringify(previousBbox);
    if (!bboxChanged) {
      return;
    }

    if (DEBUG_MAP_LOAD) {
      console.log('[Viewport] Startup load:', source, roundedBbox);
    }

    logAndroidStartupTiming('initial_viewport_fetch_requested', {
      bbox: roundedBbox,
      source,
    });

    lastViewportBboxRef.current = roundedBbox;
    lastViewportFetchTimeRef.current = Date.now();
    startupFallbackViewportUsedRef.current = source === 'fallback_center';
    fetchViewportEvents(roundedBbox);
  };
  
  // Request location permissions as soon as possible
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        logAndroidStartupTiming('location_permission_request_started');
        // 🔥 ANALYTICS: Track location permission request
        analytics.trackMapInteraction('location_permission_requested');
        
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === 'granted';
        setLocationPermissionGranted(granted);
        logAndroidStartupTiming('location_permission_request_completed', {
          status,
          granted,
        });
        
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
        logAndroidStartupTiming('location_permission_request_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
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
        logAndroidStartupTiming('initial_location_request_started');
        // Get initial location
        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        
        setLocation(initialLocation);
        logAndroidStartupTiming('initial_location_request_completed', {
          accuracy: initialLocation.coords.accuracy ?? null,
        });
        
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
        logAndroidStartupTiming('initial_location_request_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
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
      const hotspotStartupPhase = getAndroidHotspotStartupPhase();
      if (isAndroidHotspotStartupCameraActive()) {
        logAndroidStartupTiming('initial_center_camera_move_skipped_for_hotspot', {
          hotspotStartupPhase,
        });
        traceMapEvent('initial_center_camera_move_skipped_for_hotspot', {
          hotspotStartupPhase,
        });
        setHasInitiallyPositioned(true);
        return;
      }

        // Ignore hides briefly while we move the camera programmatically
    setIgnoreProgrammaticTrace(true, 'initial_center');
    logPills('PROGRAMMATIC MOVE START (initial center) — suppress hides 800ms');
    setTimeout(() => {
      setIgnoreProgrammaticTrace(false, 'initial_center_complete');
      logPills('PROGRAMMATIC MOVE END (initial center)');
    }, 800);

    traceMapEvent('initial_center_camera_move_started', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });


    cameraRef.current.setCamera({
      centerCoordinate: [location.coords.longitude, location.coords.latitude],

      zoomLevel: 12,
      animationDuration: 500,
    });

    setHasInitiallyPositioned(true);

        // Arm auto-hide after a short grace period so startup camera churn can't hide pills
    autoHideEnabledRef.current = false;
    logPills('AUTO-HIDE ARMED pending (600ms)');
    setTimeout(() => {
      autoHideEnabledRef.current = true;
      logPills('AUTO-HIDE ARMED = true');
    }, 600);

  }

  }, [location, hasInitiallyPositioned]); // REMOVED analytics, isGuest dependencies

  // Initial viewport load from the same fallback center used by the camera.
  // Live GPS refines this below; this removes the first-cluster wait on location.
  useEffect(() => {
    if (lastViewportBboxRef.current) return;

    requestStartupViewportFetch(
      {
        latitude: initialCenterCoordinate[1],
        longitude: initialCenterCoordinate[0],
      },
      'fallback_center'
    );
  }, []);

  // Initial viewport refinement when location is acquired
  useEffect(() => {
    if (location && (!lastViewportBboxRef.current || startupFallbackViewportUsedRef.current)) {
      requestStartupViewportFetch(
        {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
        },
        'gps_location'
      );
    }
  }, [location, fetchViewportEvents]);

// (Test code removed - validation complete)

// Prefer preloaded events; derive clusters immediately. Fallback only if no events.
  useEffect(() => {
    const t0 = Date.now();
    const eventsLen = Array.isArray(events) ? events.length : 0;
    const cachedClusters = Array.isArray(clusters) ? clusters.length : 0;
    console.log('[MapScreen] Mount: events =', eventsLen, 'cached clusters =', cachedClusters, 'isLoading =', isLoading);

    if (eventsLen > 0) {
      console.log('[MapScreen] Using preloaded events on mount — generating clusters now');
      // Defer cluster generation to not block initial render
      setTimeout(() => {
        try {
          generateClusters();
          // Log the cluster count after the store updates on the next tick
          setTimeout(() => {
            const afterClusters = Array.isArray(clusters) ? clusters.length : 0;
            console.log('[MapScreen] generateClusters() invoked; clusters now =', afterClusters);
          }, 0);
        } catch (err) {
          console.error('[MapScreen] generateClusters() error:', err);
        }
      }, 0);
      return;
    }

    // Check if viewport data already exists, or the startup viewport request
    // has already begun. That path fetches/derives the same minimal event data,
    // so running prefetchIfStale here just toggles isLoading and delays
    // interaction readiness after first clusters are already available.
    const hasViewportData = viewportEvents.length > 0;
    const hasStartupViewportRequest = lastViewportBboxRef.current !== null;

    if (hasViewportData || hasStartupViewportRequest) {
      console.log('[MapScreen] Startup viewport active, skipping prefetchIfStale');
    } else {
      console.log('[MapScreen] No preloaded events on mount — invoking prefetchIfStale(0)');
      logAndroidStartupTiming('prefetch_if_stale_requested_from_map_mount');
      prefetchIfStale(0)
        .catch((error) => {
          console.error('Error prefetching events:', error);
          // 🔥 ANALYTICS: Track fetch errors
          analytics.trackError('map_data_fetch_error',
            error instanceof Error ? error.message : 'Unknown prefetch error',
            { screen: 'map' }
          );
        })
        .finally(() => {
          const dur = Date.now() - t0;
          console.log('[MapScreen] prefetchIfStale(0) finished in', dur, 'ms');
          logAndroidStartupTiming('prefetch_if_stale_finished_from_map_mount', {
            durationMs: dur,
          });
          analytics.logEvent('map_data_fetch', {
            duration_ms: dur,
            screen: 'map',
            is_guest: isGuest
          });
          analytics.trackMapInteraction('events_loaded', { load_duration_ms: dur });
        });
    }
  }, []); // run once


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

      return;
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

  // Handle callout closing when map tab is re-pressed
  const previousCloseCalloutTrigger = useRef(0);
  
  useEffect(() => {
    // Only act when the trigger actually increments (not just when it's > 0)
    if (closeCalloutTrigger > previousCloseCalloutTrigger.current) {
      console.log('[MapScreen] Received close callout trigger, closing callouts');
      previousCloseCalloutTrigger.current = closeCalloutTrigger;
      
      // Close any open callouts
      if (selectedVenues && selectedVenues.length > 0) {
      closeCallout('tab-repress-trigger'); // This will clear all selections
        
        // 🔥 ANALYTICS: Track callout closure via tab re-press
        analytics.trackMapInteraction('callout_closed_via_tab_repress', {
          venue_count: selectedVenues.length,
          session_interactions: sessionClusterInteractions.current,
          is_guest: isGuest
        });
      }

      return;
    }
  }, [closeCalloutTrigger]); // Removed unnecessary dependencies

  useEffect(() => {
    if (selectedVenues && selectedVenues.length > 0) {
      calloutOpenTouchGuardUntilRef.current = Date.now() + 900;
      console.log('[CalloutProbe] arming map press guard', {
        until: calloutOpenTouchGuardUntilRef.current,
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedCluster?.id ?? 'none',
      });
      console.log('[CalloutProbe] promoting selected venues to rendered callout', {
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedCluster?.id ?? 'none',
        venueNames: selectedVenues.slice(0, 5).map((venue) => venue.venue).join(' | '),
      });
      setCalloutLayoutReadyKey(null);
      setRenderedCalloutVenues(selectedVenues);
      setRenderedCalloutCluster(selectedCluster);
      return;
    }
    calloutOpenTouchGuardUntilRef.current = 0;
    console.log('[CalloutProbe] selected venues empty', {
      selectedClusterId: selectedCluster?.id ?? 'none',
    });
  }, [selectedCluster, selectedVenues]);

  useEffect(() => {
    console.log('[CalloutProbe] rendered callout state changed', {
      renderedVenueCount: renderedCalloutVenues.length,
      renderedClusterId: renderedCalloutClusterId ?? 'none',
      hasRenderedCallout,
      calloutLayoutReadyKey: calloutLayoutReadyKey ?? 'none',
    });
  }, [
    calloutLayoutReadyKey,
    hasRenderedCallout,
    renderedCalloutClusterId,
    renderedCalloutVenues.length,
  ]);

  const closeCallout = useCallback((reason: string) => {
    console.log('[CalloutProbe] closeCallout', {
      reason,
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      renderedVenueCount: renderedCalloutVenues.length,
      renderedClusterId: renderedCalloutClusterId ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      guardRemainingMs: Math.max(0, calloutOpenTouchGuardUntilRef.current - Date.now()),
    });
    selectVenue(null);
  }, [
    isRenderedCalloutLayoutReady,
    renderedCalloutClusterId,
    renderedCalloutVenues.length,
    selectedClusterId,
    selectedVenueCount,
    selectVenue,
  ]);

  // Parent callout lifecycle only mounts/dismisses the subtree.
  // EventCallout owns the visible sheet presentation.
  useEffect(() => {
    const animationRequestId = ++calloutAnimationRequestRef.current;
    const readCalloutAnimationValue = (): number | string =>
      typeof (calloutAnimation as any).__getValue === 'function'
        ? (calloutAnimation as any).__getValue()
        : 'unknown';
    traceMapEvent('callout_animation_request_started', {
      requestId: animationRequestId,
      selectedVenueCount,
      renderedVenueCount: renderedCalloutVenues.length,
      selectedClusterId: selectedClusterId ?? 'none',
      renderedClusterId: renderedCalloutClusterId ?? 'none',
    });
    captureMapTraceSamplers('callout_animation_request', {
      requestId: animationRequestId,
      phase:
        selectedVenues && selectedVenues.length > 0
          ? 'open'
          : renderedCalloutVenues.length > 0
            ? 'close'
            : 'idle',
      delayMs: 0,
    });
    calloutAnimation.stopAnimation();
    traceMapEvent('callout_animation_stop_requested', {
      requestId: animationRequestId,
      selectedVenueCount,
      renderedVenueCount: renderedCalloutVenues.length,
    });

    if (selectedVenues && selectedVenues.length > 0) {
      if (!hasSelectedCalloutRendered) {
        calloutAnimation.setValue(SCREEN_HEIGHT);
        traceMapEvent('callout_animation_reset_for_open', {
          requestId: animationRequestId,
          translateY: SCREEN_HEIGHT,
        });
        traceMapEvent('callout_animation_open_waiting_for_mount', {
          requestId: animationRequestId,
          selectedVenueCount: selectedVenues.length,
          selectedClusterId: selectedClusterId ?? 'none',
          selectedCalloutSignature: selectedCalloutSignature || 'none',
          renderedCalloutSignature: renderedCalloutSignature || 'none',
        });
        return;
      }

      if (!isRenderedCalloutLayoutReady) {
        calloutAnimation.setValue(SCREEN_HEIGHT);
        traceMapEvent('callout_animation_open_waiting_for_layout', {
          requestId: animationRequestId,
          selectedVenueCount: selectedVenues.length,
          selectedClusterId: selectedClusterId ?? 'none',
          renderedClusterId: renderedCalloutClusterId ?? 'none',
          renderedVenueCount: renderedCalloutVenues.length,
          renderedCalloutPresentationKey,
        });
        return;
      }

      traceMapEvent('callout_animation_open_started', {
        requestId: animationRequestId,
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedClusterId ?? 'none',
        primaryVenue: selectedVenues[0]?.venue || 'unknown',
      });
      calloutAnimation.setValue(0);
      traceMapEvent('callout_parent_presentation_applied', {
        requestId: animationRequestId,
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedClusterId ?? 'none',
        renderedCalloutPresentationKey,
        translateY: readCalloutAnimationValue(),
      });
      traceMapEvent('callout_open_animation_finished', {
        requestId: animationRequestId,
        finished: true,
        translateY: readCalloutAnimationValue(),
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedClusterId ?? 'none',
        primaryVenue: selectedVenues[0]?.venue || 'unknown',
      });
      captureMapTraceSamplers('callout_animation_finished', {
        requestId: animationRequestId,
        phase: 'open',
        finished: true,
      });

      // 🔥 ANALYTICS: Track venue selection and callout display
      analytics.trackMapInteraction('venue_callout_opened', {
        venue_count: selectedVenues.length,
        primary_venue: selectedVenues[0]?.venue || 'unknown',
        event_count: selectedVenues.reduce((sum, v) => sum + v.events.length, 0),
        has_multiple_venues: selectedVenues.length > 1,
        is_guest: isGuest
      });

      // Track venue exploration details
      selectedVenues.forEach((venue) => {
        analytics.trackEventViewWithContext({
          id: `venue_${venue.locationKey}`,
          title: venue.venue,
          category: 'venue_exploration',
          type: 'venue',
          venue: venue.venue
        });
      });
      return;
    }

    if (renderedCalloutVenues.length > 0) {
      traceMapEvent('callout_animation_close_started', {
        requestId: animationRequestId,
        selectedClusterId: renderedCalloutClusterId ?? 'none',
        renderedVenueCount: renderedCalloutVenues.length,
      });
      calloutAnimation.setValue(SCREEN_HEIGHT);
      traceMapEvent('callout_parent_presentation_clearing', {
        requestId: animationRequestId,
        renderedVenueCount: renderedCalloutVenues.length,
        renderedClusterId: renderedCalloutClusterId ?? 'none',
        translateY: readCalloutAnimationValue(),
      });

      // 🔥 ANALYTICS: Track callout closure
      if (clusterOpenStartRef.current != null) {
        const dur = Date.now() - clusterOpenStartRef.current;
        amplitudeTrack('cluster_closed', {
          cluster_active_for_ms: dur,
          cluster_active_for_seconds: Math.round(dur / 1000),
          cluster_id: lastOpenedClusterIdRef.current ?? 'unknown',
          session_interactions: sessionClusterInteractions.current,
        });
        clusterOpenStartRef.current = null;
        lastOpenedClusterIdRef.current = null;
      }
      setRenderedCalloutVenues([]);
      setRenderedCalloutCluster(null);
      setCalloutLayoutReadyKey(null);

      traceMapEvent('callout_close_animation_finished', {
        requestId: animationRequestId,
        finished: true,
        renderedVenueCount: renderedCalloutVenues.length,
        renderedClusterId: renderedCalloutClusterId ?? 'none',
        translateY: readCalloutAnimationValue(),
      });
      captureMapTraceSamplers('callout_animation_finished', {
        requestId: animationRequestId,
        phase: 'close',
        finished: true,
      });
      return;
    }

    calloutAnimation.setValue(SCREEN_HEIGHT);
  }, [
    calloutAnimation,
    hasSelectedCalloutRendered,
    isRenderedCalloutLayoutReady,
    renderedCalloutClusterId,
    renderedCalloutPresentationKey,
    renderedCalloutSignature,
    selectedCalloutSignature,
    selectedClusterId,
  ]); // Parent exposes a stable callout subtree once the selected content is ready

  useEffect(() => {
    // LOG: Map state changed - tracks selected venues and clusters for debugging venue selection flow
    // console.log("MAP STATE CHANGED - selectedVenues:",
    //             selectedVenues ? selectedVenues.length : 0,
    //             "venue names:", selectedVenues ? selectedVenues.map(v => v.venue).join(", ") : "none",
    //             "selectedCluster:", selectedCluster ? selectedCluster.id : "none");
  }, [selectedVenues, selectedCluster]);

  // Mirror derived cluster readiness for diagnostics. User-facing gates use
  // clustersReadyForInteraction directly so they are not blocked on a passive
  // effect/state round trip during Android startup.
  useEffect(() => {
    if (clustersReadyForInteraction && !clustersReady) {
      logAndroidStartupTiming('clusters_ready_immediate_started', {
        clusterCount: clusters.length,
      });
      traceMapEvent('clusters_ready_immediate_started', {
        clusterCount: clusters.length,
        delayMs: 0,
      });
      console.log('[map] Clusters ready for interaction');
      setClustersReady(true);
      traceMapEvent('clusters_ready_immediate_completed', {
        clusterCount: clusters.length,
      });
      logAndroidStartupTiming('clusters_ready_immediate_completed', {
        clusterCount: clusters.length,
      });
      return;
    }

    // Reset clustersReady when loading starts again
    if (!clustersReadyForInteraction && clustersReady) {
      setClustersReady(false);
      traceMapEvent('clusters_ready_reset_for_loading');
    }
  }, [clusters.length, clustersReady, clustersReadyForInteraction]);

  useEffect(() => {
    return () => {
      if (fullClusterMarkersTimerRef.current) {
        clearTimeout(fullClusterMarkersTimerRef.current);
        fullClusterMarkersTimerRef.current = null;
      }
      if (richClusterMarkersTimerRef.current) {
        clearTimeout(richClusterMarkersTimerRef.current);
        richClusterMarkersTimerRef.current = null;
      }
    };
  }, []);

  const enableFullClusterMarkers = useCallback((source: string) => {
    if (
      fullClusterMarkersEnabledRef.current ||
      isMapLoadingRef.current ||
      latestClusterCountRef.current === 0 ||
      !clustersReadyForInteractionRef.current
    ) {
      return false;
    }

    if (fullClusterMarkersTimerRef.current) {
      clearTimeout(fullClusterMarkersTimerRef.current);
      fullClusterMarkersTimerRef.current = null;
    }

    const clusterCount = latestClusterCountRef.current;
    fullClusterMarkersEnabledRef.current = true;
    setFullClusterMarkersEnabled(true);
    traceMapEvent('full_cluster_markers_enabled', {
      clusterCount,
      startupLimit: STARTUP_CLUSTER_MARKER_LIMIT,
      source,
    });
    logAndroidStartupTiming('full_cluster_markers_enabled', {
      clusterCount,
      startupLimit: STARTUP_CLUSTER_MARKER_LIMIT,
      source,
    });
    if (DEBUG_MAP_LOAD) {
      const delta = Date.now() - __ml_t0Ref.current;
      console.log(`[MapLoad][${__ml_sessionIdRef.current}] T5d full_cluster_markers_enabled +${delta}ms (clusters=${clusterCount}) source=${source}`);
    }

    return true;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const globalAny = global as any;
    const restoreCallback = (source = 'hotspot_overlay_ready') => {
      if (source === 'hotspot_overlay_ready' && !fullClusterMarkersEnabledRef.current) {
        if (fullClusterMarkersTimerRef.current) {
          clearTimeout(fullClusterMarkersTimerRef.current);
          fullClusterMarkersTimerRef.current = null;
        }

        traceMapEvent('full_cluster_markers_hotspot_overlay_ready', {
          clusterCount: latestClusterCountRef.current,
          settleDelayMs: ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS,
        });
        logAndroidStartupTiming('full_cluster_markers_hotspot_overlay_ready', {
          clusterCount: latestClusterCountRef.current,
          settleDelayMs: ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS,
        });

        if (ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS <= 0) {
          enableFullClusterMarkers('hotspot_overlay_ready');
          return;
        }

        fullClusterMarkersTimerRef.current = setTimeout(() => {
          fullClusterMarkersTimerRef.current = null;
          enableFullClusterMarkers('hotspot_overlay_ready_settled');
        }, ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS);
        return;
      }

      enableFullClusterMarkers(source);
    };

    globalAny.mapStartupFullMarkerRestoreCallback = restoreCallback;

    return () => {
      if (globalAny.mapStartupFullMarkerRestoreCallback === restoreCallback) {
        delete globalAny.mapStartupFullMarkerRestoreCallback;
      }
    };
  }, [enableFullClusterMarkers]);

  // Keep startup MarkerView work low on slower Android devices. iOS renders the
  // full custom marker set immediately because the visible fill-in is too
  // noticeable there.
  useEffect(() => {
    if (isLoading || clusters.length === 0 || !clustersReadyForInteraction) {
      if (fullClusterMarkersTimerRef.current) {
        clearTimeout(fullClusterMarkersTimerRef.current);
        fullClusterMarkersTimerRef.current = null;
      }
      if (richClusterMarkersTimerRef.current) {
        clearTimeout(richClusterMarkersTimerRef.current);
        richClusterMarkersTimerRef.current = null;
      }
      if (fullClusterMarkersEnabled) {
        fullClusterMarkersEnabledRef.current = false;
        setFullClusterMarkersEnabled(false);
        traceMapEvent('full_cluster_markers_reset');
      }
      if (richClusterMarkersEnabled) {
        setRichClusterMarkersEnabled(false);
        traceMapEvent('rich_cluster_markers_reset');
      }
      return;
    }

    if (!STAGE_CLUSTER_MARKERS_ON_STARTUP) {
      if (!fullClusterMarkersEnabled) {
        fullClusterMarkersEnabledRef.current = true;
        setFullClusterMarkersEnabled(true);
      }
      logAndroidStartupTiming('full_cluster_markers_enabled_immediate', {
        clusterCount: latestClusterCountRef.current,
        platform: Platform.OS,
      });
      traceMapEvent('full_cluster_markers_enabled_immediate', {
        clusterCount: latestClusterCountRef.current,
        platform: Platform.OS,
      });
      return;
    }

    if (fullClusterMarkersEnabled) {
      return;
    }

    // Start the restore countdown once. Cluster count changes during hotspot
    // zoom/refinement should not restart this timer.
    if (fullClusterMarkersTimerRef.current) {
      return;
    }

    const scheduledClusterCount = latestClusterCountRef.current;
    traceMapEvent('full_cluster_markers_delay_started', {
      clusterCount: scheduledClusterCount,
      delayMs: FULL_CLUSTER_MARKER_DELAY_MS,
      startupLimit: STARTUP_CLUSTER_MARKER_LIMIT,
    });
    logAndroidStartupTiming('full_cluster_markers_delay_started', {
      clusterCount: scheduledClusterCount,
      delayMs: FULL_CLUSTER_MARKER_DELAY_MS,
      startupLimit: STARTUP_CLUSTER_MARKER_LIMIT,
    });

    fullClusterMarkersTimerRef.current = setTimeout(() => {
      fullClusterMarkersTimerRef.current = null;

      if (Platform.OS === 'android' && (global as any).mapHotspotStartupPhase === 'running') {
        traceMapEvent('full_cluster_markers_deferred_for_hotspot_overlay', {
          clusterCount: latestClusterCountRef.current,
          backupDelayMs: ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_BACKUP_MS,
        });
        logAndroidStartupTiming('full_cluster_markers_deferred_for_hotspot_overlay', {
          clusterCount: latestClusterCountRef.current,
          backupDelayMs: ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_BACKUP_MS,
        });

        fullClusterMarkersTimerRef.current = setTimeout(() => {
          fullClusterMarkersTimerRef.current = null;
          enableFullClusterMarkers('hotspot_overlay_backup');
        }, ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_BACKUP_MS);
        return;
      }

      enableFullClusterMarkers('timer');
    }, FULL_CLUSTER_MARKER_DELAY_MS);
  }, [clusters.length, clustersReadyForInteraction, enableFullClusterMarkers, fullClusterMarkersEnabled, isLoading, richClusterMarkersEnabled]);

  // Restore animated/rich marker children after the full MarkerView set is back.
  useEffect(() => {
    if (isLoading || clusters.length === 0 || !clustersReadyForInteraction || !fullClusterMarkersEnabled) {
      if (richClusterMarkersTimerRef.current) {
        clearTimeout(richClusterMarkersTimerRef.current);
        richClusterMarkersTimerRef.current = null;
      }
      if (richClusterMarkersEnabled) {
        setRichClusterMarkersEnabled(false);
        traceMapEvent('rich_cluster_markers_reset');
      }
      return;
    }

    if (richClusterMarkersEnabled) {
      return;
    }

    // Keep the rich-detail countdown anchored to the first full-marker restore.
    if (richClusterMarkersTimerRef.current) {
      return;
    }

    const scheduledClusterCount = latestClusterCountRef.current;
    traceMapEvent('rich_cluster_markers_delay_started', {
      clusterCount: scheduledClusterCount,
      delayMs: RICH_CLUSTER_MARKER_DELAY_MS,
    });
    logAndroidStartupTiming('rich_cluster_markers_delay_started', {
      clusterCount: scheduledClusterCount,
      delayMs: RICH_CLUSTER_MARKER_DELAY_MS,
    });

    richClusterMarkersTimerRef.current = setTimeout(() => {
      richClusterMarkersTimerRef.current = null;
      const clusterCount = latestClusterCountRef.current;
      setRichClusterMarkersEnabled(true);
      traceMapEvent('rich_cluster_markers_enabled', {
        clusterCount,
      });
      logAndroidStartupTiming('rich_cluster_markers_enabled', {
        clusterCount,
      });
      if (DEBUG_MAP_LOAD) {
        const delta = Date.now() - __ml_t0Ref.current;
        console.log(`[MapLoad][${__ml_sessionIdRef.current}] T5e rich_marker_details_enabled +${delta}ms (clusters=${clusterCount})`);
      }
    }, RICH_CLUSTER_MARKER_DELAY_MS);
  }, [clusters.length, clustersReadyForInteraction, fullClusterMarkersEnabled, isLoading, richClusterMarkersEnabled]);

  // Re-center the map on user location
  const handleRecenterPress = () => {
    if (location && cameraRef.current) {
        setIgnoreProgrammaticTrace(true, 'recenter');
    logPills('PROGRAMMATIC MOVE START (recenter) — suppress hides 800ms');
    setTimeout(() => {
      setIgnoreProgrammaticTrace(false, 'recenter_complete');
      logPills('PROGRAMMATIC MOVE END (recenter)');
    }, 800);

    traceMapEvent('recenter_pressed', {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });


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

  // Ref to prevent duplicate cluster clicks (rapid tapping)
  const clusterProcessingRef = useRef<string | null>(null);
  const clusterProcessingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enhanced handleMarkerPress with comprehensive prioritization
  const handleMarkerPress = useCallback(async (cluster: Cluster): Promise<void> => {
    traceMapEvent('marker_press_started', {
      clusterId: cluster.id,
      clusterType: cluster.clusterType,
      venueCount: cluster.venues?.length ?? 0,
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      activeProcessingClusterId: clusterProcessingRef.current ?? 'none',
      hasRenderedCallout,
      renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
    });
    if (hasRenderedCallout) {
      traceMapEvent('marker_press_blocked_callout_rendered', {
        clusterId: cluster.id,
        renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
        renderedVenueCount: renderedCalloutVenueCount,
      });
      return;
    }
    // 🛡️ CLICK PREVENTION: Block rapid taps on same or different clusters
    if (clusterProcessingRef.current !== null) {
      console.log(`[map] Cluster tap blocked: already processing ${clusterProcessingRef.current}`);
      traceMapEvent('marker_press_blocked_processing', {
        clusterId: cluster.id,
        processingClusterId: clusterProcessingRef.current,
      });
      return;
    }

    // 🛡️ HOTSPOT PREVENTION: Block clicks during programmatic camera animations
    if (ignoreProgrammaticCameraRef.current) {
      console.log('[map] Cluster tap blocked: camera animating');
      traceMapEvent('marker_press_blocked_programmatic', {
        clusterId: cluster.id,
      });
      return;
    }

    // 📳 HAPTIC FEEDBACK: Provide immediate tactile confirmation of tap
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Silently fail if haptics not available (some devices/simulators)
    });

    // Mark this cluster as being processed (both ref and state)
    clusterProcessingRef.current = cluster.id;
    setProcessingClusterId(cluster.id);
    console.log(`[map] Cluster processing started: ${cluster.id}`);
    traceMapEvent('marker_processing_started', {
      clusterId: cluster.id,
    });

    // Safety timeout: auto-clear guard after 1000ms to prevent deadlock
    clusterProcessingTimeoutRef.current = setTimeout(() => {
      console.log(`[map] Cluster processing auto-cleared (timeout): ${clusterProcessingRef.current}`);
      traceMapEvent('marker_processing_timeout_cleared', {
        clusterId: clusterProcessingRef.current ?? 'none',
      });
      clusterProcessingRef.current = null;
      setProcessingClusterId(null);
    }, 1000);

    // LOG: Processing cluster press - tracks which cluster was tapped and venue count
    console.log('[map] handleMarkerPress()', { cluster_id: cluster.id, type: cluster.clusterType, venue_count: cluster.venues?.length });

    // Record interaction immediately for single-venue markers
    // Tapping a single-venue marker is explicit intent, so clear indicator immediately
    if (cluster.clusterType === 'single' && cluster.venues.length === 1) {
      const venue = cluster.venues[0];
      const venueEventIds = venue.events.map(event => event.id.toString());
      const stableVenueId = venue.locationKey;
      const { recordInteraction } = useClusterInteractionStore.getState();
      console.log(`[SingleVenueTap] Recording immediate engagement for: ${venue.venue}, StableVenueID: ${stableVenueId}`);
      recordInteraction(stableVenueId, venueEventIds);
    }

    // 🔥 ANALYTICS: Track cluster interaction start
    // If another cluster was already open, close it and log its duration
if (clusterOpenStartRef.current != null) {
  const prevDur = Date.now() - clusterOpenStartRef.current;
  amplitudeTrack('cluster_closed', {
    cluster_active_for_ms: prevDur,
    cluster_active_for_seconds: Math.round(prevDur / 1000),
    cluster_id: lastOpenedClusterIdRef.current ?? 'unknown',
    reason: 'open_another',
    session_interactions: sessionClusterInteractions.current,
  });
  clusterOpenStartRef.current = null;
  lastOpenedClusterIdRef.current = null;
}

// 🔥 ANALYTICS: Track cluster interaction start
const interactionStartTime = Date.now();
sessionClusterInteractions.current += 1;

// Track cluster opened + start the open-duration timer
console.log('[analytics] cluster_opened about to send', {
  cluster_id: cluster.id,
  cluster_size: cluster.venues.length,
  session_interactions: sessionClusterInteractions.current,
});
amplitudeTrack('cluster_opened', {
  cluster_id: cluster.id,
  cluster_size: cluster.venues.length,
  referrer_screen: '/map',
  source: 'map',
  session_interactions: sessionClusterInteractions.current,
});
console.log('[analytics] cluster_opened sent');

clusterOpenStartRef.current = interactionStartTime;
lastOpenedClusterIdRef.current = cluster.id;

    // NOTE: We do NOT record venue interactions here on cluster open.
    // Venue interactions are recorded by EventCallout when:
    // 1. The callout opens and displays the default venue (first venue viewed)
    // 2. The user swipes to a different venue in the venue selector
    // This ensures we only mark venues as "seen" when the user actually views them.

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
      
      // Read cached prefs synchronously (no network on tap)
      const userInterests: string[] = getUserInterestsSync();
      const savedEvents: string[] = getSavedEventsSync();
      const favoriteVenues: string[] = getFavoriteVenuesSync();
            
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
        // Check if this is a favorite venue (applies to all events at this venue)
        const isFavoriteVenue = favoriteVenues.includes(venue.locationKey);
        const favoriteVenueScore = isFavoriteVenue ? 500 : 0;

        // Calculate scores for each event in the venue
        for (const event of venue.events) {
          // Base score components
          let baseScore = 0;

          // 1. Saved Status (Highest Priority - 1000 points base)
          const isSaved = savedEvents.includes(event.id.toString());
          const savedScore = isSaved ? 1000 : 0;
          if (isSaved) savedEventMatches++;

          // 2. Favorite Venue (Second Priority - 500 points)
          // (favoriteVenueScore calculated at venue level above)

          // 3. User Interest Match (Third Priority - 100 points base)
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
          event.relevanceScore = savedScore + favoriteVenueScore + interestScore + timeScore + engagementScore + proximityScore;
          
          if (event.relevanceScore > 100) highRelevanceEvents++;
          
          // Log scores for debugging
          // LOG: Event scoring breakdown - shows how relevance scores are calculated for each event
          // if (process.env.NODE_ENV !== 'production') {
          //   console.log(`Event "${event.title}" scores:`, {
          //     saved: savedScore,
          //     favorite: favoriteVenueScore,
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
      traceMapEvent('marker_press_selected', {
        clusterId: cluster.id,
        venueCount: sortedVenues.length,
        selectedClusterId: cluster.clusterType === 'multi' ? cluster.id : 'none',
        primaryVenue: sortedVenues[0]?.venue || 'unknown',
      });

      // DEBUG LOG 4: Log which venue is selected when cluster opens (via map tap)
      console.log('[Hotspot] ===== Cluster opened via MAP tap =====');
      console.log(`[Hotspot] Cluster: timeStatus=${cluster.timeStatus}, venues=${sortedVenues.length}`);
      console.log(`[Hotspot] Selected venue (first after sort): ${sortedVenues[0]?.venue} (score: ${sortedVenues[0]?.relevanceScore?.toFixed(2)})`);
      sortedVenues.slice(0, 5).forEach((v, idx) => {
        const topEvent = v.events?.[0];
        console.log(`[Hotspot]   ${idx + 1}. ${v.venue} (score: ${v.relevanceScore?.toFixed(2)}, top event: "${topEvent?.title}" ${topEvent?.category})`);
      });
      
      // Calculate center coordinates for the cluster
      const coordinates = cluster.clusterType === 'multi'
        ? [
            cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) / cluster.venues.length,
            cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) / cluster.venues.length
          ]
        : [cluster.venues[0].longitude, cluster.venues[0].latitude];
      
      // Move camera to the cluster
      setIgnoreProgrammaticTrace(true, 'cluster_tap_camera_move');
      logPills('PROGRAMMATIC MOVE START (cluster tap) — suppress hides 800ms');
      setTimeout(() => {
        setIgnoreProgrammaticTrace(false, 'cluster_tap_camera_move_complete');
        logPills('PROGRAMMATIC MOVE END (cluster tap)');
      }, 800);


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
      traceMapEvent('marker_press_error', {
        clusterId: cluster.id,
        message: error instanceof Error ? error.message : String(error),
      });
      
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
      traceMapEvent('marker_press_fallback_selected', {
        clusterId: cluster.id,
        venueCount: defaultVenues.length,
        selectedClusterId: cluster.clusterType === 'multi' ? cluster.id : 'none',
        primaryVenue: defaultVenues[0]?.venue || 'unknown',
      });
    } finally {
      // 🛡️ CLEANUP: Clear processing guard after completion or error
      if (clusterProcessingTimeoutRef.current) {
        clearTimeout(clusterProcessingTimeoutRef.current);
        clusterProcessingTimeoutRef.current = null;
      }
      console.log(`[map] Cluster processing completed: ${clusterProcessingRef.current}`);
      traceMapEvent('marker_processing_completed', {
        clusterId: clusterProcessingRef.current ?? cluster.id,
      });
      clusterProcessingRef.current = null;
      setProcessingClusterId(null);
    }
  }, [
    hasRenderedCallout,
    isGuest,
    location,
    renderedCalloutClusterId,
    renderedCalloutVenueCount,
    trackInteraction,
  ]); // REMOVED analytics, zoomLevel dependencies

  // Handle map press to close callout
  const handleMapPress = () => {
    const guardRemainingMs = Math.max(0, calloutOpenTouchGuardUntilRef.current - Date.now());
    console.log('[CalloutProbe] handleMapPress fired', {
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      guardRemainingMs,
    });

    if (ignoreProgrammaticCameraRef.current) {
      console.log('[CalloutProbe] handleMapPress ignored during programmatic camera move');
      return;
    }

    if (selectedVenues && selectedVenues.length > 0 && !isRenderedCalloutLayoutReady) {
      console.log('[CalloutProbe] handleMapPress ignored while callout layout is pending');
      return;
    }

    if (guardRemainingMs > 0) {
      console.log('[CalloutProbe] handleMapPress ignored by post-open guard', {
        guardRemainingMs,
      });
      return;
    }

    traceMapEvent('map_press_fired', {
      hasActiveCallout: selectedVenueCount > 0,
      selectedClusterId: selectedClusterId ?? 'none',
      activeFilterPanel: activeFilterPanel ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      processingClusterId: clusterProcessingRef.current ?? 'none',
    });
    // 🔥 ANALYTICS: Track map exploration (tapping on empty areas)
    analytics.trackMapInteraction('map_exploration', {
      has_active_callout: !!(selectedVenues && selectedVenues.length > 0),
      has_active_filter_panel: !!activeFilterPanel,
      current_zoom: zoomLevel,
      visible_clusters: visibleClusterIds.current.size,
      is_guest: isGuest
    });

    // ✅ Cancel Events "hold-to-arm clear" if active (FilterPills can't reliably capture map taps)
    const isEventsClearGestureActive = (global as any).gathrEventsClearGestureActive;
    const cancelEventsClearArmed = (global as any).gathrCancelEventsClearArmed;

    if (isEventsClearGestureActive && typeof cancelEventsClearArmed === 'function') {
      console.log('🧯 handleMapPress: cancelling Events clear (armed/hold)');
      cancelEventsClearArmed('map-press');
    }

    dismissInterestCarousel('map-press');

    // Only close if there's a callout currently open
    if (selectedVenues && selectedVenues.length > 0) {
      traceMapEvent('map_press_closing_callout', {
        selectedClusterId: selectedClusterId ?? 'none',
        selectedVenueCount,
      });
      closeCallout('map-press');
      // Analytics for callout closure tracked in useEffect above
    }
    // Close filter panel if open
    if (activeFilterPanel) {
      traceMapEvent('map_press_closing_filter_panel', {
        activeFilterPanel,
      });
      setActiveFilterPanel(null);
      // Analytics for filter panel closure tracked in useEffect above
    }
  };

  // Auto-hide filter pills functionality
  /**
 * Hide the pill row by translating it upward (out of view) and fading slightly.
 * Notes:
 *  • Skips when a filter panel is open (pills must remain accessible).
 *  • Uses measured pill height so the slide fully clears (min 44dp safety).
 *  • Accepts a `reason` string for log forensics (startup, movement_start, etc.).
 */
const hidePills = useCallback((reason: string = 'unspecified') => {

    // Don't hide if filter panel is open
    if (activeFilterPanel) {
      logPills('hidePills SKIPPED (panel open)', { reason });
      return;
    }

    const distance = -Math.max(pillsHeight, 44); // slide up by actual height (min 44)
    logPills('hidePills RUN', { reason, distance });

    Animated.parallel([
      Animated.timing(pillsAnimation, {
        toValue: distance,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(pillsOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      logPills('hidePills DONE', { reason });
    });
  }, [activeFilterPanel, pillsAnimation, pillsOpacity, pillsHeight]);


  /**
 * Show the pill row (translateY → 0, opacity → 1) and start a short
 * POST_SHOW_LOCKOUT window so a tiny camera tick right after showing
 * can’t immediately trigger a new hide (prevents “blink-hide”).
 */
const showPills = useCallback((reason: string = 'unspecified') => {

    logPills('showPills RUN', { reason });
    // Set a brief lockout to prevent immediate re-hide flicker
    postShowLockoutUntilRef.current = Date.now() + POST_SHOW_LOCKOUT_MS;
    logPills('LOCKOUT set post-show', { lockoutMs: POST_SHOW_LOCKOUT_MS });

    Animated.parallel([
      Animated.timing(pillsAnimation, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(pillsOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => {
      logPills('showPills DONE', { reason });
    });
  }, [pillsAnimation, pillsOpacity]);


  // --- Floating pills top offset (baseline + small per-platform nudge) ---
const BASELINE_TOP = 0; // dp - starting point that looks good under the header (reduced by 6px)
const PLATFORM_NUDGE = Platform.select({ ios: 20, android: 20, default: 0 })!;
const TOP_OFFSET = BASELINE_TOP + PLATFORM_NUDGE;
// -----------

// --- Movement significance thresholds (tune if needed) ---

/**
 * ────────────────────────────────────────────────────────────────────────────────
 * FILTER PILLS AUTO-HIDE: THRESHOLDS & TUNING
 *
 * Goals
 *  1) Hide immediately on real pans/zooms.
 *  2) Ignore jitter/render settling (esp. iOS zoom-out tails).
 *  3) Always re-show within a bounded window.
 *
 * Meaningful movement = any of:
 *  • zoomDelta ≥ MIN_ZOOM_DELTA_TO_HIDE  (primary signal for pinch zooms)
 *  • centerMovedMeters ≥ metersPerPixel * CENTER_PX_THRESHOLD
 *      (with a floor of MIN_CENTER_METERS_TO_HIDE at high zooms)
 *  • headingDelta ≥ MIN_HEADING_DELTA_TO_HIDE
 *  • pitchDelta   ≥ MIN_PITCH_DELTA_TO_HIDE
 *
 * Behavioral guarantees
 *  • Only meaningful ticks extend “moving”; tiny drifts don’t.
 *  • After re-show we enforce POST_SHOW_LOCKOUT_MS to avoid blink-hide.
 *  • MAX_HIDDEN_MS cap ensures pills never stay hidden too long.
 *
 * Quick tuning
 *  • CENTER_PX_THRESHOLD: raise (8–10) if zoom-out tails feel sticky.
 *  • MIN_ZOOM_DELTA_TO_HIDE: 0.05–0.07 to make zoom triggers stricter/looser.
 *  • MAX_HIDDEN_MS: 1200–2000ms for how long pills can stay hidden mid-gesture.
 * ────────────────────────────────────────────────────────────────────────────────
 */
const MIN_ZOOM_DELTA_TO_HIDE = 0.05;     // ignore tiny zoom jitters
const MIN_CENTER_METERS_TO_HIDE = 10;    // minimum center move at high zooms
const CENTER_PX_THRESHOLD = 6;           // ~how many pixels must the center move to count at any zoom
const MIN_HEADING_DELTA_TO_HIDE = 4;     // degrees
const MIN_PITCH_DELTA_TO_HIDE = 3;       // degrees
const POST_SHOW_LOCKOUT_MS = 600;        // after pills re-show, ignore hides briefly
const MAX_HIDDEN_MS = 1500;              // hard cap: never keep pills hidden longer than this
// ---------------------------------------------------------

// Small helpers for deltas
const haversineMeters = (lng1: number, lat1: number, lng2: number, lat2: number) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const metersPerPixel = (lat: number, zoom: number) => {
  // Web Mercator: ~156543.03392 m/px at z0 at equator, scaled by cos(lat)
  return 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
};

const angularDelta = (a?: number, b?: number) => {
  if (typeof a !== 'number' || typeof b !== 'number') return 0;
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
// ---------------------------------------------------------



/**
 * Movement START:
 *  • Gated by: initial positioning done, auto-hide armed, not programmatic,
 *    and not within the post-show lockout window.
 *  • Starts MAX_HIDDEN_MS hard cap: if the map emits a long tail of meaningful
 *    ticks (e.g., iOS zoom-out inertia), we force a movement end so pills re-show.
 *  • Immediately hides (unless a filter panel is open).
 */
const handleMapMovementStart = useCallback(() => {
  // Ignore until initial positioning is done AND auto-hide is armed
  if (!hasInitiallyPositioned || !autoHideEnabledRef.current || ignoreProgrammaticCameraRef.current) {
    // logPills('MOVEMENT START IGNORED', { hasInitiallyPositioned, autoHideEnabled: autoHideEnabledRef.current, ignoreProgrammatic: ignoreProgrammaticCameraRef.current });
    return;
  }

  // NEW: require a REAL user gesture before we ever hide
  if (!userGestureSeenRef.current) {
    // logPills('MOVEMENT START IGNORED (no user gesture yet)');
    return;
  }


  // Respect the post-show lockout to avoid blink-hide
  const now = Date.now();
  if (now < postShowLockoutUntilRef.current) {
    // logPills('MOVEMENT START IGNORED (post-show lockout)', { remainingMs: postShowLockoutUntilRef.current - now });
    return;
  }

  // Already moving? Nothing to do.
  if (isMapMoving) return;

  setIsMapMoving(true);
  mapInteractionStartTime.current = now;

  // Clear timers
  if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
  if (showTimeoutRef.current) { clearTimeout(showTimeoutRef.current); showTimeoutRef.current = null; }
  if (hideCapTimeoutRef.current) { clearTimeout(hideCapTimeoutRef.current); hideCapTimeoutRef.current = null; }

  // Kick off the hard cap: force-show if we stay “moving” too long (e.g., long zoom-out tail)
  hideCapTimeoutRef.current = setTimeout(() => {
    if (isMapMoving) {
      // logPills('MAX_HIDDEN cap reached — forcing show');
      handleMapMovementEnd(); // will call showPills after debounce
    }
  }, MAX_HIDDEN_MS);

  // Hide now (unless panel open)
  if (!activeFilterPanel) {
    hidePills('movement_start');
  } else {
    // logPills('NOT HIDING (panel open)', { activeFilterPanel });
  }
}, [activeFilterPanel, hidePills, hasInitiallyPositioned, isMapMoving]);




/**
 * Movement END:
 *  • Ends the analytics “movement session”.
 *  • Clears the hard cap timer.
 *  • Re-shows pills after a short idle delay (300ms) for a snappy feel.
 *  • Starts POST_SHOW_LOCKOUT_MS so tiny follow-up ticks can’t instantly hide.
 */
const handleMapMovementEnd = useCallback(() => {

  console.log('[DEBUG] 🛑 handleMapMovementEnd called');
  setIsMapMoving(false);

  // analytics session
  if (mapInteractionStartTime.current) {
    const movementDuration = Date.now() - mapInteractionStartTime.current;
    analytics.trackMapInteraction('map_movement_session', {
      duration_ms: movementDuration,
      zoom_change: Math.abs(zoomLevel - lastZoomLevel.current),
      is_guest: isGuest
    });
    mapInteractionStartTime.current = null;
  }

  // Clear timers
  if (showTimeoutRef.current) { clearTimeout(showTimeoutRef.current); }
  if (hideCapTimeoutRef.current) { clearTimeout(hideCapTimeoutRef.current); hideCapTimeoutRef.current = null; }

  // Check if viewport changed during movement and fetch if needed
  const cameraState = currentCameraStateRef.current;
  console.log('[DEBUG] 📷 Camera state:', cameraState ? 'EXISTS' : 'NULL');

  if (cameraState) {
    const { width, height } = Dimensions.get('window');
    const center: GeoCoordinate = {
      latitude: cameraState.center[1],
      longitude: cameraState.center[0]
    };
    const zoom = cameraState.zoom;

    const bbox = getViewportBoundingBox(center, zoom, width, height, 1.0);
    const roundedBbox = roundBoundingBoxForCache(bbox, 3);

    const bboxChanged = !lastViewportBboxRef.current ||
      JSON.stringify(roundedBbox) !== JSON.stringify(lastViewportBboxRef.current);

    console.log('[DEBUG] 📦 Bbox changed:', bboxChanged, {
      old: lastViewportBboxRef.current,
      new: roundedBbox
    });

    if (bboxChanged) {
      console.log('[Viewport] Movement ended - bbox changed, fetching:', roundedBbox);
      lastViewportBboxRef.current = roundedBbox;
      fetchViewportEvents(roundedBbox);
    }
  } else {
    console.log('[DEBUG] ⚠️ No camera state available for viewport check');
  }

  // Re-show after a short idle delay (keeps UX snappy)
  showTimeoutRef.current = setTimeout(() => {
    showPills('movement_end');
    // After showing, set a brief lockout so a tiny tick can't immediately hide again
    postShowLockoutUntilRef.current = Date.now() + POST_SHOW_LOCKOUT_MS;
  }, 300);
}, [showPills, analytics, zoomLevel, isGuest, fetchViewportEvents]);


  // Add this right before the return statement in the component
  //console.log("RENDERING MAP - callout conditions:", {
  //  hasSelectedVenues: selectedVenues && selectedVenues.length > 0,
  //  selectedVenuesCount: selectedVenues ? selectedVenues.length : 0,
  //  selectedVenueNames: selectedVenues ? selectedVenues.map(v => v.venue) : []
  //});

  // Handle map camera changes (both zoom and movement) with debouncing for movement detection
/**
 * CAMERA CHANGED:
 *  • Computes deltas (zoom/center/heading/pitch).
 *  • Uses zoom-aware center threshold: metersPerPixel * CENTER_PX_THRESHOLD,
 *    floored by MIN_CENTER_METERS_TO_HIDE (so tiny drifts at low zoom don’t count).
 *  • “Meaningful” ticks start/extend movement; non-meaningful ticks do not reset
 *    the movement-end debounce (prevents long zoom tails from keeping pills hidden).
 *  • Also re-enables auto-hide after tutorial/reload on the first true user gesture
 *    (detected via e.properties.gesture / isUserInteraction).
 */
React.useEffect(() => {
  if (!location) return;
  if (__ml_userStartAppliedRef.current) return;
  const hotspotStartupPhase = getAndroidHotspotStartupPhase();
  if (isAndroidHotspotStartupCameraActive()) {
    __ml_userStartAppliedRef.current = true;
    logAndroidStartupTiming('applied_user_start_skipped_for_hotspot', {
      hotspotStartupPhase,
    });
    traceMapEvent('applied_user_start_skipped_for_hotspot', {
      hotspotStartupPhase,
    });
    return;
  }

  __ml_userStartAppliedRef.current = true;

  try {
    const dest: [number, number] = [location.coords.longitude, location.coords.latitude];
    cameraRef.current?.setCamera({
      centerCoordinate: dest,
      zoomLevel: START_ZOOM,
      animationDuration: 0,
    });
    if (DEBUG_MAP_LOAD) {
      console.log(`[MapLoad][${__ml_sessionIdRef.current}] applied_user_start`);
    }
  } catch (e) {
    if (DEBUG_MAP_LOAD) console.log('[MapLoad] setCamera(user) error', e);
  }
}, [location]);

useEffect(() => {
  // Snap the camera immediately on mount (no animation), so we never show the globe
  try {
    cameraRef.current?.setCamera({
      centerCoordinate: computeStartCenter(),
      zoomLevel: START_ZOOM,
      animationDuration: 0,
    });
    if (typeof setZoomLevel === 'function') {
      setZoomLevel(START_ZOOM);
    }
__ml_initialSnapDoneRef.current = true;
if (DEBUG_MAP_LOAD) {
  console.log(`[MapLoad][${__ml_sessionIdRef.current}] applied_initial_snap`);
}

  } catch (e) {
    if (DEBUG_MAP_LOAD) console.log('[MapLoad] setCamera(initial) error', e);
  }
  // run once
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  if (!DEBUG_MAP_LOAD) return;
  if (__ml_firstClustersReadyRef.current) return;
  if (clusters && clusters.length > 0) {
    __ml_firstClustersReadyRef.current = true;
    const t = Date.now();
    const delta = t - __ml_t0Ref.current;
    console.log(`[MapLoad][${__ml_sessionIdRef.current}] T5c clusters_ready +${delta}ms (clusters=${clusters.length})`);
  }
}, [clusters?.length]);

const handleCameraChange = useCallback((e: any) => {
  
//  console.log('[DEBUG] handleCameraChange fired, tick count:', __ml_cameraTickCountRef.current);
  
  if (DEBUG_MAP_LOAD) { __ml_cameraTickCountRef.current += 1; }

  // Ignore camera churn until the map has drawn once AND we've applied our initial snap.
  if (!__ml_styleReadyRef.current || !__ml_initialSnapDoneRef.current) {
    console.log('[DEBUG] Early return - styleReady:', __ml_styleReadyRef.current, 'initialSnap:', __ml_initialSnapDoneRef.current);
    return;
  }

  const now = Date.now();

const props: any = (e && (e.properties ?? e)) ?? {};
// Some builds emit zoom/zoomLevel; tolerate both
const zoom: number | undefined =
  typeof props.zoom === 'number' ? props.zoom
  : (typeof props.zoomLevel === 'number' ? props.zoomLevel : undefined);
const heading: number | undefined = props.bearing ?? props.heading;
const pitch: number | undefined = props.pitch ?? props.tilt;

// NEW: first real user gesture gate (works on both platforms)
const isGesture = !!(props.gesture ?? props.isUserInteraction);
if (isGesture && !userGestureSeenRef.current) {
  userGestureSeenRef.current = true;
  setIgnoreProgrammaticTrace(false, 'first_user_gesture');
  autoHideEnabledRef.current = true;
  traceMapEvent('first_user_gesture_detected', {
    zoom: typeof zoom === 'number' ? zoom : 'unknown',
  });
  // logPills('USER GESTURE DETECTED — auto-hide enabled & programmatic off');
}

  const isProgrammaticCameraMove = ignoreProgrammaticCameraRef.current && !isGesture;

  // Center from props or geometry
  const centerArr: [number, number] | undefined =
    (Array.isArray(props.center) && props.center.length === 2 ? props.center as [number, number] : undefined) ||
    (Array.isArray(e?.geometry?.coordinates) && e.geometry.coordinates.length === 2 ? e.geometry.coordinates as [number, number] : undefined);

  // Deltas
  const zoomDelta = typeof zoom === 'number' ? Math.abs(zoom - lastZoomLevel.current) : 0;
  const headingDelta = angularDelta(heading, previousHeadingRef.current ?? heading);
  const pitchDelta = angularDelta(pitch, previousPitchRef.current ?? pitch);

  let centerMovedMeters = 0;
  if (centerArr && previousCenterRef.current) {
    centerMovedMeters = haversineMeters(
      previousCenterRef.current[0], previousCenterRef.current[1],
      centerArr[0], centerArr[1]
    );
  }

  // Compute dynamic center threshold based on zoom (≈ pixels → meters)
  const latForScale = centerArr ? centerArr[1] : 0; // default 0 if unknown
  const mPerPx = (typeof zoom === 'number') ? metersPerPixel(latForScale, zoom) : 0;
  const dynamicCenterMetersThreshold = Math.max(
    MIN_CENTER_METERS_TO_HIDE,
    mPerPx * CENTER_PX_THRESHOLD
  );

  // Decide if this tick is "meaningful" movement
  // Prefer zoom for zoom gestures; only count center wiggles if they exceed the zoom-aware threshold
  const isZoomMeaningful = zoomDelta >= MIN_ZOOM_DELTA_TO_HIDE;
  const isCenterMeaningful = centerMovedMeters >= dynamicCenterMetersThreshold;
  const isHeadingMeaningful = headingDelta >= MIN_HEADING_DELTA_TO_HIDE;
  const isPitchMeaningful = pitchDelta >= MIN_PITCH_DELTA_TO_HIDE;

  const meaningfulChange = isZoomMeaningful || isCenterMeaningful || isHeadingMeaningful || isPitchMeaningful;

  // Update "previous" refs after computing deltas
  // Update "previous" refs after computing deltas
  if (centerArr) previousCenterRef.current = centerArr;
  if (typeof heading === 'number') previousHeadingRef.current = heading;
  if (typeof pitch === 'number') previousPitchRef.current = pitch;

  // Store current camera state for viewport fetching on movement end
  if (centerArr && typeof zoom === 'number') {
    currentCameraStateRef.current = { center: centerArr, zoom };
  }

/* ─────────────────────────────────────────────────────────────────────────────
Clustering refresh: keep zoom → store → recluster in sync
- Recompute clusters when the visible zoom changes enough to matter.
──────────────────────────────────────────────────────────────────────────── */
    if (typeof zoom === 'number' && Math.abs(zoom - lastZoomLevel.current) >= 0.06) {
      lastZoomLevel.current = zoom;

      // Don't trigger cluster regeneration during programmatic camera moves
      if (!isProgrammaticCameraMove) {
        try {
          setZoomLevel(zoom); // triggers generateClusters(zoom) in the store
        } catch (e) {
          if (DEBUG_MAP_LOAD) console.log('[MapLoad] setZoomLevel error', e);
        }
      } else {
        // During programmatic moves, just update the zoom ref without reclustering
        logPills('ZOOM CHANGED during programmatic move — skipping recluster', { zoom });
      }
    }

  /* ─────────────────────────────────────────────────────────────────────────────
  Viewport-based event filtering: fetch events within current map view
  - Calculates viewport bounding box with 20% margin
  - Debounces fetch requests (500ms) to prevent excessive API calls
  - Only triggers after user has interacted with map
  ──────────────────────────────────────────────────────────────────────────── */
    // Programmatic camera animations (hotspot, tutorial, recenter, cluster tap) should not
    // run viewport filtering/fetch work on every animation frame. That JS-thread work can
    // delay the hotspot's 1100ms follow-up timer by many seconds on slower Android devices.
    if (isProgrammaticCameraMove) {
      lastCameraChangeRef.current = now;
      return;
    }

  const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
  const pixelRatio = PixelRatio.get();

  // Use actual map dimensions if available, otherwise fall back to window dimensions
  const width = mapDimensions?.width ?? windowWidth;
  const height = mapDimensions?.height ?? windowHeight;

  if (DEBUG_CAMERA_TICKS) {
    console.log('[OnScreen] Camera tick:', {
      centerArr: centerArr?.[0],
      zoom,
      hasCenter: !!centerArr,
      hasZoom: typeof zoom === 'number',
      windowWidth,
      windowHeight,
      mapWidth: width,
      mapHeight: height,
      usingActualMapDimensions: !!mapDimensions,
      pixelRatio
    });
  }

  if (centerArr && typeof zoom === 'number') {
    const center: GeoCoordinate = {
      latitude: centerArr[1],
      longitude: centerArr[0]
    };

    // Calculate viewport bounding box (no buffer - exact viewport)
    const bbox = getViewportBoundingBox(center, zoom, width, height, 1.0);
    const roundedBbox = roundBoundingBoxForCache(bbox, 3);  // ~110m resolution; avoids fetch churn from tiny camera drift

    // Filter viewportEvents to only those visible on actual screen
    const currentViewportEvents = useMapStore.getState().viewportEvents || [];
    const onScreenEvents = currentViewportEvents.filter(event => {
      const lat = event.latitude;
      const lng = event.longitude;
      if (!lat || !lng) return false;

      const inBounds = lat >= bbox.south &&
                       lat <= bbox.north &&
                       lng >= bbox.west &&
                       lng <= bbox.east;

      return inBounds;
    });

    // Debug logging for onScreen filtering with sample events
    const sampleFiltered = currentViewportEvents.slice(0, 3).map(event => {
      const latCheck = event.latitude >= bbox.south && event.latitude <= bbox.north;
      const lngCheck = event.longitude >= bbox.west && event.longitude <= bbox.east;
      return {
        id: event.id,
        lat: event.latitude?.toFixed(4),
        lng: event.longitude?.toFixed(4),
        latOk: latCheck,
        lngOk: lngCheck,
        latCalc: `${event.latitude?.toFixed(4)} >= ${bbox.south.toFixed(4)} && <= ${bbox.north.toFixed(4)}`,
        lngCalc: `${event.longitude?.toFixed(4)} >= ${bbox.west.toFixed(4)} && <= ${bbox.east.toFixed(4)}`,
        inBounds: onScreenEvents.includes(event)
      };
    });

    if (DEBUG_CAMERA_TICKS) {
      console.log('[OnScreen] Filtering events:', {
        viewportEventsCount: currentViewportEvents.length,
        onScreenEventsCount: onScreenEvents.length,
        filteredOut: currentViewportEvents.length - onScreenEvents.length,
        bbox: {
          south: bbox.south.toFixed(4),
          north: bbox.north.toFixed(4),
          west: bbox.west.toFixed(4),
          east: bbox.east.toFixed(4)
        },
        sampleEvents: sampleFiltered
      });
    }

    // Update store with on-screen events on every camera change
    useMapStore.getState().setOnScreenEvents(onScreenEvents);

    // Check if viewport changed significantly
    const bboxChanged = !lastViewportBboxRef.current ||
      JSON.stringify(roundedBbox) !== JSON.stringify(lastViewportBboxRef.current);

    // Debug viewport change detection
    if (DEBUG_CAMERA_TICKS && bboxChanged) {
      console.log('[Viewport] Bbox changed:', {
        old: lastViewportBboxRef.current,
        new: roundedBbox,
        userGestureSeen: userGestureSeenRef.current
      });
    }

    // Fallback: if bbox changed after initial load and we don't have explicit gesture detection,
    // assume it's a user gesture (works around platform-specific gesture detection issues)
    const shouldFetch = bboxChanged && (userGestureSeenRef.current || lastViewportBboxRef.current !== null);

    if (shouldFetch) {
      // Hybrid approach: Throttle during active movement + Debounce for final accuracy
      const now = Date.now();
      const timeSinceLastFetch = now - lastViewportFetchTimeRef.current;
      const THROTTLE_INTERVAL = 300; // Max 3 fetches per second during active movement
      const DEBOUNCE_DELAY = 50; // Final fetch 50ms after movement stops

      // Clear any pending debounced fetch
      if (viewportFetchTimeoutRef.current) {
        clearTimeout(viewportFetchTimeoutRef.current);
      }

      // THROTTLE: If enough time has passed since last fetch, fetch immediately
      if (timeSinceLastFetch >= THROTTLE_INTERVAL) {
        if (DEBUG_CAMERA_TICKS) {
          console.log('[Viewport] THROTTLED fetch (immediate):', { roundedBbox, timeSinceLastFetch });
        }
        lastViewportBboxRef.current = roundedBbox;
        lastViewportFetchTimeRef.current = now;
        fetchViewportEvents(roundedBbox);
      } else {
        // DEBOUNCE: Schedule a fetch after movement stops for final accuracy
        viewportFetchTimeoutRef.current = setTimeout(() => {
          if (DEBUG_CAMERA_TICKS) {
            console.log('[Viewport] DEBOUNCED fetch (after stop):', roundedBbox);
          }
          lastViewportBboxRef.current = roundedBbox;
          lastViewportFetchTimeRef.current = Date.now();
          fetchViewportEvents(roundedBbox);
        }, DEBOUNCE_DELAY);
      }
    }
  }

  // Movement timing
  const timeSinceLastChange = now - lastCameraChangeRef.current;
  lastCameraChangeRef.current = now;

  lastCameraChangeRef.current = now;

  // FIRST USER GESTURE gate remains (if you have it elsewhere): props.gesture / props.isUserInteraction handling

  // Start movement only if there's meaningful change (and gates allow)
  if (!isMapMoving && autoHideEnabledRef.current && !ignoreProgrammaticCameraRef.current && meaningfulChange) {
    handleMapMovementStart();
  }

  // Movement end debounce:
  // Only reset the debounce when the tick itself is meaningful.
  // Tiny, non-meaningful drifts (especially at low zoom) won't extend the hidden period.
  if (meaningfulChange) {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isMapMoving) {
        handleMapMovementEnd();
      }
    }, 250);

    // Fallback: always ensure pills come back after prolonged movement
    if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
    showTimeoutRef.current = setTimeout(() => {
      if (isMapMoving) {
        handleMapMovementEnd();
      }
    }, 1000);
  }
}, [
  isMapMoving,
  handleMapMovementStart,
  handleMapMovementEnd,
  autoHideEnabledRef,
  ignoreProgrammaticCameraRef,
  fetchViewportEvents,
  setZoomLevel
]);


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

  const notifyHotspotCameraReady = useCallback((source: string) => {
    const hotspotCameraReadyCallback = (global as any).mapHotspotCameraReadyCallback;
    if (typeof hotspotCameraReadyCallback !== 'function' || !cameraRef.current) {
      return;
    }

    if (Platform.OS === 'android') {
      console.warn('[GathRHotspotTiming]', 'map_camera_ready_callback_invoked', JSON.stringify({
        source,
      }));
    }
    hotspotCameraReadyCallback();
  }, []);

  // Render cluster markers on the map with improved stability
  const renderClusterMarkers = () => {
    // Skip expensive cluster rendering when Map tab is not visible
    // This prevents 30+ TreeMarker re-renders during tab switches
    if (!isFocused) {
      return null;
    }

  // DEBUG T5 (first render call)
  if (DEBUG_MAP_LOAD && !__ml_firstMarkersLoggedRef.current) {
    __ml_firstMarkersLoggedRef.current = true;
    const t5 = Date.now();
    const delta = t5 - __ml_t0Ref.current;
    console.log(`[MapLoad][${__ml_sessionIdRef.current}] T5 first_render +${delta}ms (clusters=${clusters.length}) cameraTicks=${__ml_cameraTickCountRef.current}`);
  }
    // Get the current threshold index and determine if it changed
    const thresholdIndex = getThresholdIndexForZoom(zoomLevel);
    const thresholdChanged = thresholdIndex !== currentThresholdIndex.current;
    
    // Check if filter criteria changed by comparing with previous
    const filterChanged = JSON.stringify(filterCriteria) !== JSON.stringify(previousFilterCriteria.current);
    
    //console.log(`Rendering ${clusters.length} clusters with zoom level ${zoomLevel.toFixed(2)}`);
    
    // If this is the first render, threshold changed, OR filter changed, recalculate visible clusters
    const clusterCountChanged = clusters.length !== previousClusterCount.current;

// Smart cache invalidation: recalculate when cluster IDs change
const currentClusterIds = new Set(clusters.map(c => c.id));
const cachedClusterIds = new Set(Array.from(visibleClusterIds.current));
const clusterIdsChanged = currentClusterIds.size !== cachedClusterIds.size || 
  !Array.from(currentClusterIds).every(id => cachedClusterIds.has(id));

  if (visibleClusterIds.current.size === 0 || thresholdChanged || filterChanged      
  || clusterIdsChanged) {
    // Update cluster count tracking
    previousClusterCount.current = clusters.length;
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

// DEBUG T5b (first time we actually HAVE clusters)
if (typeof DEBUG_MAP_LOAD !== 'undefined' && DEBUG_MAP_LOAD && !__ml_firstClustersLoggedRef.current && clusters.length > 0) {
  __ml_firstClustersLoggedRef.current = true;
  const t5b = Date.now();
  const delta = t5b - __ml_t0Ref.current;
  console.log(`[MapLoad][${__ml_sessionIdRef.current}] T5b first_clusters +${delta}ms (clusters=${clusters.length})`);
}

      
      // Store their IDs for future reference
      visibleClusterIds.current = new Set(
        visibleClusters.map(cluster => cluster.id)
      );
      
      // Enhanced debug logging
const reason = visibleClusterIds.current.size === 0 ? 'FIRST_RENDER' : 
              thresholdChanged ? 'THRESHOLD_CHANGE' : 
              filterChanged ? 'FILTER_CHANGE' : 
              clusterCountChanged ? 'CLUSTER_COUNT_CHANGE' : 'UNKNOWN';
      
     if (DEBUG_CAMERA_TICKS) {
       console.log(`VISIBILITY RECALCULATED (${reason}): ${visibleClusters.length}/${clusters.length} clusters visible`);
     }
     // Debug individual cluster visibility
if (DEBUG_CAMERA_TICKS && reason === 'CLUSTER_COUNT_CHANGE') {
  console.log('=== CLUSTER COUNT CHANGE DEBUG ===');
  console.log('All clusters:', clusters.map(c => ({ id: c.id.substring(0, 20), venues: c.venues.length, type: c.clusterType })));
  console.log('Visible clusters:', visibleClusters.map(c => ({ id: c.id.substring(0, 20), venues: c.venues.length, type: c.clusterType })));
  console.log('Filtered out clusters:', clusters.filter(c => !visibleClusterIds.current.has(c.id)).map(c => ({ id: c.id.substring(0, 20), venues: c.venues.length, type: c.clusterType })));
  console.log('================================');
}
      
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
    
    // Render only clusters that we've determined should be visible. On Android
    // startup, cap MarkerViews to the highest-priority clusters so the hotspot
    // path is not competing with every custom marker at once.
    const visibleClustersForRender = clusters.filter(cluster => visibleClusterIds.current.has(cluster.id));
    const shouldUseStartupClusterSubset = STAGE_CLUSTER_MARKERS_ON_STARTUP && !fullClusterMarkersEnabled;
    const baseClustersForRender = !shouldUseStartupClusterSubset
      ? visibleClustersForRender
      : pickStartupClusters(visibleClustersForRender, STARTUP_CLUSTER_MARKER_LIMIT);
    const shouldAppendHotspotPreviewCluster =
      Platform.OS === 'android' &&
      shouldUseStartupClusterSubset &&
      startupHotspotPreviewCluster &&
      !baseClustersForRender.some(cluster => cluster.id === startupHotspotPreviewCluster.id);
    const clustersForRender = shouldAppendHotspotPreviewCluster
      ? [...baseClustersForRender, startupHotspotPreviewCluster]
      : baseClustersForRender;

    if (shouldAppendHotspotPreviewCluster && !startupHotspotPreviewMarkerLoggedRef.current) {
      startupHotspotPreviewMarkerLoggedRef.current = true;
      logAndroidStartupTiming('hotspot_preview_marker_rendered', {
        clusterId: startupHotspotPreviewCluster.id,
        baseRenderedCount: baseClustersForRender.length,
      });
    }

    if (
      DEBUG_MAP_LOAD &&
      shouldUseStartupClusterSubset &&
      !startupMarkerSubsetLoggedRef.current &&
      visibleClustersForRender.length > clustersForRender.length
    ) {
      startupMarkerSubsetLoggedRef.current = true;
      const delta = Date.now() - __ml_t0Ref.current;
      console.log(`[MapLoad][${__ml_sessionIdRef.current}] startup_marker_subset_rendered +${delta}ms (visible=${visibleClustersForRender.length}, rendered=${clustersForRender.length})`);
    }

    return clustersForRender
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
              disabled={!clustersReadyForInteraction || processingClusterId !== null || hasRenderedCallout}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <TreeMarker
                cluster={cluster}
                isSelected={isSelected}
                isProcessing={processingClusterId === cluster.id}
                isReady={clustersReadyForInteraction}
                detailsEnabled={richClusterMarkersEnabled}
              />
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

  const renderCalloutPresentation = (content: React.ReactNode) => {
    console.log('[CalloutProbe] renderCalloutPresentation', {
      platform: Platform.OS,
      hasRenderedCallout,
      hasPresentedCallout,
      renderedVenueCount: renderedCalloutVenues.length,
      renderedClusterId: renderedCalloutClusterId ?? 'none',
      presentedVenueCount: presentedCalloutVenueCount,
      presentedClusterId: presentedCalloutClusterId ?? 'none',
    });
    if (Platform.OS !== 'ios') {
      return content;
    }

    return (
      <Modal
        transparent={true}
        visible={true}
        animationType="none"
        onRequestClose={() => closeCallout('modal-request-close')}
        presentationStyle="overFullScreen"
        statusBarTranslucent={true}
        hardwareAccelerated={true}
      >
        <View style={styles.calloutModalContent}>
          {content}
        </View>
      </Modal>
    );
  };

  // Render the map
  return (
    <View style={styles.container}>
      {isHeaderSearchActive && (
        <Pressable
          onPress={() => { setHeaderSearchActive(false); Keyboard.dismiss(); }}
          style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}
        />
      )}
      {/* Add Filter Bar at the top */}
      {/* Filter pills overlay (floating) anchored under safe-area */}
      {shouldRenderAncillaryOverlays && (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: TOP_OFFSET, // baseline + per-platform nudge
            zIndex: 5,
            transform: [{ translateY: pillsAnimation }],
            opacity: pillsOpacity,
          }}
        >
          <View
            testID="filter-pills"
            pointerEvents="auto"
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height || 0;
              if (h && Math.abs(h - pillsHeight) > 1) setPillsHeight(h);
            }}
          >
            <FilterPills />
          </View>
        </Animated.View>
      )}



      {ANDROID_MAPBOX_STARTUP_ISOLATION_DEBUG ? (
        <View style={[styles.map, styles.androidMapIsolationCard]}>
          <Text style={styles.androidMapIsolationTitle}>Android Map Isolation Mode</Text>
          <Text style={styles.androidMapIsolationBody}>
            Mapbox rendering is temporarily disabled in the dev build to isolate the startup crash.
          </Text>
        </View>
      ) : (
        <MapboxGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={MapboxGL.StyleURL.Street}
        scaleBarEnabled={true}
        scaleBarPosition={{
          bottom: 12,
          left: Math.round((Dimensions.get('window').width / 2) - 50)
        }}
onLayout={(event) => {
  const { width, height, x, y } = event.nativeEvent.layout;
  setMapDimensions({ width, height });

  // Use measureInWindow to get absolute screen coordinates
  // mapRef.current is the MapboxGL.MapView which doesn't have measureInWindow
  // So we measure via the native view handle
  const nativeHandle = (mapRef.current as any)?._nativeRef;
  if (nativeHandle?.measureInWindow) {
    nativeHandle.measureInWindow((absX: number, absY: number, absWidth: number, absHeight: number) => {
      (global as any).mapViewLayout = {
        width: absWidth,
        height: absHeight,
        x: absX,
        y: absY,
        absoluteX: absX,
        absoluteY: absY,
      };
      console.log('[MapView] onLayout (absolute):', { width: absWidth, height: absHeight, absX, absY, windowWidth: Dimensions.get('window').width, windowHeight: Dimensions.get('window').height });
    });
  } else {
    // Fallback to relative layout
    (global as any).mapViewLayout = { width, height, x, y };
    console.log('[MapView] onLayout (relative):', { width, height, x, y, windowWidth: Dimensions.get('window').width, windowHeight: Dimensions.get('window').height });
  }
}}
onMapIdle={() => {
  notifyHotspotCameraReady('map_idle');
  if (DEBUG_MAP_LOAD) {
    const t1b = Date.now();
    const delta = t1b - __ml_t0Ref.current;
    console.log(`[MapLoad][${__ml_sessionIdRef.current}] T1b map_idle +${delta}ms`);
  }
  const hotspotCameraIdleCallback = (global as any).mapHotspotCameraIdleCallback;
  if (typeof hotspotCameraIdleCallback === 'function') {
    if (Platform.OS === 'android') {
      console.warn('[GathRHotspotTiming]', 'map_idle_callback_invoked', JSON.stringify({}));
    }
    hotspotCameraIdleCallback();
  }
}}

onDidFinishRenderingFrameFully={() => {
  notifyHotspotCameraReady('rendering_frame_fully');
  if (DEBUG_MAP_LOAD && !__ml_firstFrameLoggedRef.current) {
    __ml_firstFrameLoggedRef.current = true;
    const t1bf = Date.now();
    const delta = t1bf - __ml_t0Ref.current;
    console.log(`[MapLoad][${__ml_sessionIdRef.current}] T1b(frame) map_fully_rendered +${delta}ms`);
  }
}}


onDidFinishLoadingMap={() => {
  notifyHotspotCameraReady('map_loaded');

  // Mark style ready on a supported callback (don’t depend on unsupported events)
  if (!__ml_styleReadyRef.current) __ml_styleReadyRef.current = true;

  // DEBUG T1
  if (DEBUG_MAP_LOAD) {
    const t1 = Date.now();
    const delta = t1 - __ml_t0Ref.current;
    console.log(`[MapLoad][${__ml_sessionIdRef.current}] T1 map_loaded +${delta}ms (styleReady=${__ml_styleReadyRef.current})`);
  }
  analytics.trackMapInteraction('map_loaded', {
    is_guest: isGuest,
    has_location_permission: locationPermissionGranted
  });
  traceMapEvent('map_loaded', {
    isGuest,
    hasLocationPermission: locationPermissionGranted,
  });

  const hotspotStartupPhase = getAndroidHotspotStartupPhase();
  const hotspotOwnsStartupCamera = isAndroidHotspotStartupCameraActive();

  // Instantly set camera to the best-known start center (no fly animation),
  // unless the daily hotspot has already taken control of startup camera motion.
  if (!hotspotOwnsStartupCamera) {
    try {
      const startCenter = computeStartCenter();
      cameraRef.current?.setCamera({
        centerCoordinate: startCenter,
        zoomLevel: START_ZOOM,
        animationDuration: 0,
      });
      if (typeof setZoomLevel === 'function') {
        setZoomLevel(START_ZOOM);
      }
    } catch (e) {
      if (DEBUG_MAP_LOAD) console.log('[MapLoad] setCamera error', e);
    }
  } else {
    logAndroidStartupTiming('map_loaded_start_camera_snap_skipped_for_hotspot', {
      hotspotStartupPhase,
    });
    traceMapEvent('map_loaded_start_camera_snap_skipped_for_hotspot', {
      hotspotStartupPhase,
    });
  }

  // Force pills visible NOW (inline animation; avoids order issues)
  Animated.parallel([
    Animated.timing(pillsAnimation, { toValue: 0, duration: 180, useNativeDriver: true }),
    Animated.timing(pillsOpacity,  { toValue: 1, duration: 160, useNativeDriver: true }),
  ]).start();

  // Do NOT allow hides until the first real user gesture. If the hotspot owns
  // startup camera motion, its own lock controls this period.
  if (!hotspotOwnsStartupCamera) {
    userGestureSeenRef.current = false;
    autoHideEnabledRef.current = false;
    setIgnoreProgrammaticTrace(true, 'map_loaded_initial_lock');
  }
}}




        onMapLoadingError={() => {
          console.log('Map failed to load');
          // 🔥 ANALYTICS: Track map load errors
          analytics.trackError('map_load_error', 'Map failed to load', { screen: 'map' });
        }}
     
          onCameraChanged={handleCameraChange}
//onRegionDidChange={handleCameraChange} // removed — we use onMapIdle for idle logging


        onPress={handleMapPress}
      >
<MapboxGL.Camera
  ref={cameraRef}
  defaultSettings={{
    centerCoordinate: computeStartCenter(),
    zoomLevel: START_ZOOM,
  }}
  followUserLocation={false}
/>
       
        {/* Render the user location marker if we have location and permission */}
        {location && locationPermissionGranted && (
          <UserLocationMarker location={location} />
        )}
        
        {/* Render event markers */}
        {!isLoading && !ANDROID_CLUSTER_MARKERVIEW_ISOLATION_DEBUG && renderClusterMarkers()}
      </MapboxGL.MapView>
      )}

      {MAP_TRACE_UI_ENABLED && (
        <Pressable
          style={styles.mapTraceTrigger}
          delayLongPress={700}
          onLongPress={() => {
            traceMapEvent('trace_panel_opened', {
              source: 'logo_long_press',
            });
            setIsTracePanelVisible(true);
          }}
        />
      )}

      {ANDROID_CLUSTER_MARKERVIEW_ISOLATION_DEBUG && (
        <View pointerEvents="none" style={styles.androidMarkerIsolationBadge}>
          <Text style={styles.androidMarkerIsolationBadgeText}>Android dev: cluster markers disabled</Text>
        </View>
      )}

            {/* GathR logo above Mapbox logo */}
      <View style={styles.mapLogoContainer} pointerEvents="none">
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.mapLogo}
          resizeMode="contain"
        />
      </View>

      {shouldRenderAncillaryOverlays && (
        <>
          <MapLegend topOffset={30} rightOffset={10} />

          {/* Hot Flame Pill - shows "What's hot" filter in top-right */}
          <HotFlamePill
            top={134}
            right={10}
            isActive={hotInterestCarouselActive}
            onPress={handleHotFlamePress}
          />

          <View pointerEvents="box-none" style={styles.interestPillsContainer}>
            <InterestFilterPills onPillInteraction={() => setHotInterestCarouselActive(false)} />
          </View>

          {/* Interests Carousel - appears when interest pill is selected */}
          <InterestsCarousel
            hotModeActive={hotInterestCarouselActive}
            onDismissHotMode={() => setHotInterestCarouselActive(false)}
          />
        </>
      )}

      <View style={styles.mapLogoContainer} pointerEvents="none">
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.mapLogo}
          resizeMode="contain"
        />
      </View>
      
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

      {/* Transparent overlay to block touches while clusters are not ready */}
      {!isLoading && !clustersReadyForInteraction && (
        <View
          style={styles.clustersNotReadyOverlay}
          pointerEvents="box-only"
          onStartShouldSetResponder={() => true}
          onResponderRelease={() => {
            console.log('[map] Touch blocked: clusters not ready yet');
            traceMapEvent('clusters_not_ready_overlay_tap_blocked', {
              clusterCount: clusters.length,
            });
          }}
        >
          <View style={styles.clustersLoadingMessage}>
            <Text style={styles.clustersLoadingText}>Loading Data...</Text>
          </View>
        </View>
      )}

      {hasPresentedCallout && renderCalloutPresentation(
        <>
          {/* Background overlay that SWALLOWS touches (prevents MapView onPress behind it) */
          /* ─────────────────────────────────────────────────────────────────────────────
Event Callout: Android touch-capture overlay  — WHY this exists & how it works
Rationale
- On Android, touches/gestures can leak through non-interactive views and hit
  MapboxGL.MapView underneath. iOS usually swallows them.
- When the callout was open, background taps/scrolls reached MapView.onPress
  (handleMapPress → selectVenue(null)), closing the callout unexpectedly while
  switching venues/tabs or scrolling.

What this block does
- Renders a full-screen overlay above the map **only while a callout is open**.
- Uses RN responder callbacks (onStartShouldSetResponder / onMoveShouldSetResponder)
  to **capture all touches**, so MapView never receives them.
- Treats an intentional tap on the overlay as “close callout” via selectVenue(null).

Key details to keep stable
- Keep `pointerEvents="auto"` and a higher `zIndex`/`elevation` so the overlay
  actually wins the touch hit test on Android.
- Ensure any explicit UI (e.g., the recenter/map icon) that should **still close**
  the callout sits ABOVE this overlay (rendered later or with a higher zIndex/elevation).
- Optional: short-circuit MapView.onPress while a callout is open (belt-and-suspenders),
  since this overlay now owns the “tap outside to close” behavior.

If you change this later
- Removing the responder handlers or switching to `pointerEvents="none"` will
  reintroduce Android background-tap leaks and accidental callout closes.
- If you don’t want “tap outside to close,” delete onResponderRelease but keep
  the overlay to swallow touches.

Related context
- Map gestures (scroll/zoom/rotate/pitch) are already disabled while a callout
  is open; this overlay is the additional guard for **taps**.
Owner: Map UX stability on Android • Last validated: 2025-09-04
──────────────────────────────────────────────────────────────────────────── */
}
<View
  style={[StyleSheet.absoluteFillObject, { zIndex: 4 }]}
  pointerEvents="auto"
  // Always capture touches so MapView doesn't receive them on Android
  onStartShouldSetResponder={() => true}
  onMoveShouldSetResponder={() => true}
  onResponderRelease={() => {
    // Tapping outside the sheet intentionally closes it with animation
    console.log('OVERLAY TAP - dismissing callout with animation');
    traceMapEvent('callout_overlay_tap_closed', {
      selectedClusterId: presentedCalloutClusterId ?? 'none',
      selectedVenueCount: presentedCalloutVenueCount,
    });
    // Use global closeCallout to trigger animated close
    if ((global as any).closeCallout) {
      (global as any).closeCallout();
    } else {
      // Fallback if callout hasn't exposed the function yet
      closeCallout('overlay-fallback-close');
    }
  }}
>
<Animated.View
  style={[
    StyleSheet.absoluteFillObject,
    {
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
    }
  ]}
/>
</View>

          
          {/* Callout container - box-none allows taps to pass through to overlay below */}
          <View style={styles.calloutAnimatedContainer} pointerEvents="box-none">
            <ActiveCalloutComponent 
              key={presentedCalloutPresentationKey}
              venues={presentedCalloutVenues}
              cluster={presentedCalloutCluster}
              onClose={() => closeCallout('callout-onClose-prop')}
              onLayoutReady={() => {
                traceMapEvent('callout_child_layout_ready', {
                  renderedClusterId: presentedCalloutClusterId ?? 'none',
                  renderedVenueCount: presentedCalloutVenueCount,
                  renderedCalloutPresentationKey: presentedCalloutPresentationKey,
                });
                setCalloutLayoutReadyKey((currentKey) =>
                  currentKey === presentedCalloutPresentationKey ? currentKey : presentedCalloutPresentationKey
                );
              }}
              onEventSelected={handleEventSelected}
            />
          </View>
        </>
      )}
      
      {/* Preview-debug gate: keep hotspot fully unmounted so its timers/camera flow cannot affect callout presentation. */}
      {!HOTSPOT_HARD_DISABLED_FOR_PREVIEW_DEBUG && clustersReadyForInteraction && (
        <HotspotHighlight ignoreProgrammaticCameraRef={ignoreProgrammaticCameraRef} />
      )}

      {!IOS_CALLOUT_NATIVE_AD_ISOLATION_DEBUG && <CompactCalloutAdWarmup />}

      {/* Guest limitation registration prompt - only for guests */}
      {isGuest && <RegistrationPrompt />}

      {/* Deep link lightbox - renders when globalSelectedImageData is set from deep link */}
      <DeepLinkLightbox />

      {MAP_TRACE_UI_ENABLED && (
        <MapTracePanel
          visible={isTracePanelVisible}
          onClose={() => setIsTracePanelVisible(false)}
        />
      )}
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
  androidMapIsolationCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F5F3E8',
  },
  androidMapIsolationTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  androidMapIsolationBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
    textAlign: 'center',
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
  // Overlay to block touches while clusters are initializing (prevents queued taps)
  clustersNotReadyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 100,
    elevation: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Loading message shown on the overlay
  clustersLoadingMessage: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  clustersLoadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
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
  flexDirection: 'row', // horizontal alignment
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
    backgroundColor: '#F5F3E8',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 0,
    marginTop: -1,
    marginHorizontal: 2,
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
    marginHorizontal: 4,
    ...(Platform.OS === 'android' ? { marginTop: 0 } : null),
  },
countText: {
  fontSize: 11,
  fontWeight: 'bold',
  color: '#333333',
  marginLeft: 2,
  ...(Platform.OS === 'android'
    ? { includeFontPadding: false, textAlignVertical: 'center', lineHeight: 12 }
    : null),
},

  // New content indicator - red dot (matches filter pill badge style)
  newContentDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 5,
  },
  // Firestore source indicator - subtle badge in top-left
  firestoreIndicator: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E3F2FD', // Light blue
    borderWidth: 1,
    borderColor: '#2196F3', // Blue border
    zIndex: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  firestoreIndicatorText: {
    fontSize: 6,
    fontWeight: 'bold',
    color: '#1565C0', // Dark blue text
    textAlign: 'center',
  },
  // Processing ring indicator - shown when cluster is being tapped/processed
  processingRing: {
    position: 'absolute',
    zIndex: 10,
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
  // Category Carousel styles
  categoryCarousel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3E8', // Light beige/tan - matches typical map background color
    paddingHorizontal: 4, // Tighter padding
    paddingVertical: 0,
    borderRadius: 12,
    marginBottom: 2,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.4, // Stronger shadow for depth
    shadowRadius: 4,
    elevation: 5,
    zIndex: 5,
  },
  interestGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    borderRadius: 12,
    zIndex: -1,
  },
  categoryIcon: {
    marginRight: 3,
  },
  categoryCount: {
    fontWeight: '600',
    lineHeight: 14,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  calloutAnimatedContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 15,
  },
  calloutModalContent: {
    flex: 1,
  },
  // Re-center button styles
  recenterButton: {
    position: 'absolute',
    bottom: 80,
    right: 10,
    backgroundColor: 'white',
    width: 36,
    height: 36,
    borderRadius: 18,
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
  },
  interestPillsContainer: {
    position: 'absolute',
    right: 10,
    top: 182, // Legend button ends at ~170 (80+54+36), add 12px spacing
    bottom: 128, // Recenter button starts at ~116 from bottom (80 + 36), add 12px spacing
    justifyContent: 'center',
    alignItems: 'flex-end',
    zIndex: 11,
  },
  androidMarkerIsolationBadge: {
    position: 'absolute',
    top: 84,
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 12,
  },
  androidMarkerIsolationBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapLogoContainer: {
    position: 'absolute',
    left: 10,
    bottom: 34, // sits just above the Mapbox logo area
    zIndex: 6,
  },
  mapTraceTrigger: {
    position: 'absolute',
    left: 2,
    bottom: 24,
    width: 40,
    height: 40,
    zIndex: 8,
  },
  mapLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
});

// Explicitly mark the default export for Expo Router
const MapPage = MapScreen;
export default MapPage;
