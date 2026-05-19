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
import { View, Text, StyleSheet, Animated, Dimensions, PixelRatio, TouchableOpacity, Easing, Keyboard, Pressable, Image, Modal, InteractionManager, GestureResponderEvent } from 'react-native';
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
import { useInterestCarouselUiStore } from '../../store/interestCarouselUiStore';
import type { Event, Venue, Cluster, TimeStatus, InterestLevel } from '../../types/events';
import { FilterCriteria, TimeFilterType } from '../../types/filter';
import type { InterestCarouselFilter } from '../../types/store';

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
import {
  cacheStartupLocation,
  DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_METERS,
  getPreloadedStartupLocationSnapshot,
  preloadStartupLocation,
  STARTUP_LOCATION_CACHE_MAX_AGE_MS,
} from '../../utils/startupLocationCache';
import { initializeMapboxAccessToken } from '../../utils/mapboxAccessToken';
import {
  markTabFocus,
  markTabRootLayout,
  markTabScreenRenderCommit,
  markTabScreenRenderStart,
  markTabTracePhase,
} from '../../utils/tabSwitchTrace';

// Initialize Mapbox token
initializeMapboxAccessToken(MapboxGL);

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HOTSPOT_HARD_DISABLED_FOR_PREVIEW_DEBUG = false;
const STATIC_CALLOUT_ISOLATION_DEBUG = false;
const IOS_CALLOUT_NATIVE_AD_ISOLATION_DEBUG = Platform.OS === 'ios';
const ANDROID_MAPBOX_STARTUP_ISOLATION_DEBUG = false;
const ANDROID_CLUSTER_MARKERVIEW_ISOLATION_DEBUG = false;
const DEBUG_CALLOUT_PROBE = false;
const DEBUG_ANDROID_RETAP_LATENCY_PROBE = false;
const USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS = false;
const DEBUG_TREE_MARKER_EVENTS = false;
const ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE = 144;
const ANDROID_CLUSTER_TOUCH_OVERLAY_DURATION_MS = 4500;
const ANDROID_CLUSTER_TOUCH_OVERLAY_LIMIT = 80;
const STAGE_CLUSTER_MARKERS_ON_STARTUP = Platform.OS === 'android';
const STARTUP_CLUSTER_MARKER_LIMIT = 12;
const FULL_CLUSTER_MARKER_DELAY_MS = 1000;
const RICH_CLUSTER_MARKER_DELAY_MS = Platform.OS === 'ios' ? 0 : 2000;
const ANDROID_RICH_CLUSTER_MARKER_MIN_ZOOM = 13;
const ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_SETTLE_MS = 0;
const ANDROID_FULL_CLUSTER_MARKER_HOTSPOT_BACKUP_MS = 4000;
const MAP_BLUR_CLEANUP_DELAY_MS = Platform.OS === 'android' ? 1000 : 0;
const ANDROID_MAP_TAB_OVERLAY_RESTORE_DELAY_MS = 350;
const ANDROID_CALLOUT_PREP_CACHE_LIMIT = 24;
const ANDROID_CALLOUT_PREP_PREWARM_LIMIT = 8;
const ANDROID_CALLOUT_PREP_PREWARM_STEP_MS = 45;
const ANDROID_CALLOUT_DEFERRED_TEARDOWN_MS = 900;
const ANDROID_CONTROLS_RELEASE_AFTER_CLOSE_MS = 150;

const logCalloutProbe = (...args: unknown[]): void => {
  if (DEBUG_CALLOUT_PROBE) {
    console.log(...args);
  }
};

const getAndroidHotspotStartupPhase = (): string | null => {
  if (Platform.OS !== 'android') {
    return null;
  }

  return ((global as any).mapHotspotStartupPhase as string | undefined) ?? null;
};

const isAndroidHotspotStartupCameraActive = (): boolean => {
  const phase = getAndroidHotspotStartupPhase();
  return phase === 'camera_animating' || phase === 'overlay_ready';
};

const shouldShowClusterMarkerDetails = (
  zoom: number,
  richMarkersReady: boolean,
  androidZoomAllowsDetails: boolean
): boolean => {
  if (Platform.OS !== 'android') {
    return richMarkersReady;
  }

  return richMarkersReady && (androidZoomAllowsDetails || zoom >= ANDROID_RICH_CLUSTER_MARKER_MIN_ZOOM);
};

const getCoordinatePairFromPosition = (position: unknown): [number, number] | null => {
  if (!Array.isArray(position) || position.length < 2) {
    return null;
  }

  const longitude = Number(position[0]);
  const latitude = Number(position[1]);

  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
};

const getBoundingBoxFromPositions = (positions: unknown): BoundingBox | null => {
  if (!Array.isArray(positions) || positions.length < 2) {
    return null;
  }

  const coordinates = positions
    .map(getCoordinatePairFromPosition)
    .filter((position): position is [number, number] => position !== null)
    .map(([longitude, latitude]) => ({ longitude, latitude }));

  if (coordinates.length < 2) {
    return null;
  }

  return {
    west: Math.min(...coordinates.map((coordinate) => coordinate.longitude)),
    south: Math.min(...coordinates.map((coordinate) => coordinate.latitude)),
    east: Math.max(...coordinates.map((coordinate) => coordinate.longitude)),
    north: Math.max(...coordinates.map((coordinate) => coordinate.latitude)),
  };
};

const getNativeVisibleBoundingBox = (props: any): BoundingBox | null => {
  const bounds = props?.bounds;
  const boundsBbox = bounds?.ne && bounds?.sw
    ? getBoundingBoxFromPositions([bounds.ne, bounds.sw])
    : null;

  return boundsBbox ?? getBoundingBoxFromPositions(props?.visibleBounds);
};

const getEffectiveZoomFromVisibleBounds = (
  reportedZoom: number,
  visibleBbox: BoundingBox | null,
  mapWidthPixels: number
): number => {
  if (!visibleBbox || !Number.isFinite(mapWidthPixels) || mapWidthPixels <= 0) {
    return reportedZoom;
  }

  const longitudeSpan = visibleBbox.east - visibleBbox.west;
  if (!Number.isFinite(longitudeSpan) || longitudeSpan <= 0) {
    return reportedZoom;
  }

  const derivedZoom = Math.log2((mapWidthPixels * 360) / (longitudeSpan * 512));
  return Number.isFinite(derivedZoom)
    ? Math.max(reportedZoom, derivedZoom)
    : reportedZoom;
};

const isAndroidHotspotStartupFlowActive = (): boolean => {
  const phase = getAndroidHotspotStartupPhase();
  return phase === 'running' || phase === 'camera_animating';
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

type ClusterCalloutPrepContext = {
  userLocation: Location.LocationObject | null;
  userInterests: string[];
  savedEvents: string[];
  favoriteVenues: string[];
};

type PreparedClusterCallout = {
  sortedVenues: Venue[];
  coordinates: [number, number];
};

const getStableListSignature = (values: string[]): string =>
  values.length === 0 ? '' : [...values].sort().join(',');

const getClusterContentSignature = (cluster: Cluster): string =>
  cluster.venues
    .map((venue) => `${venue.locationKey}:${venue.events.map((event) => event.id).join(',')}`)
    .join('|');

const getClusterCalloutPrepCacheKey = (
  cluster: Cluster,
  context: ClusterCalloutPrepContext
): string => {
  const locationSignature = context.userLocation
    ? `${context.userLocation.coords.latitude.toFixed(3)},${context.userLocation.coords.longitude.toFixed(3)}`
    : 'none';

  return [
    cluster.id,
    cluster.clusterType,
    cluster.eventCount,
    cluster.specialCount,
    cluster.venues.length,
    locationSignature,
    getStableListSignature(context.userInterests),
    getStableListSignature(context.savedEvents),
    getStableListSignature(context.favoriteVenues),
    getClusterContentSignature(cluster),
  ].join('::');
};

const prepareClusterCallout = (
  cluster: Cluster,
  context: ClusterCalloutPrepContext
): PreparedClusterCallout => {
  const savedEventIds = new Set(context.savedEvents);
  const userInterestIds = new Set(context.userInterests);
  const favoriteVenueIds = new Set(context.favoriteVenues);
  const userLocation = context.userLocation;

  const venuesWithScores: Venue[] = cluster.venues.map((venue) => {
    const isFavoriteVenue = favoriteVenueIds.has(venue.locationKey);
    const favoriteVenueScore = isFavoriteVenue ? 500 : 0;

    const scoredEvents = venue.events
      .map((event): Event => {
        const isSaved = savedEventIds.has(event.id.toString());
        const savedScore = isSaved ? 1000 : 0;
        const matchesInterest = userInterestIds.has(event.category);
        const interestScore = matchesInterest ? 100 : 0;

        const timeScore = isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)
          ? 10
          : isEventHappeningToday(event)
          ? 5
          : 1;

        const engagementScore = event.engagementScore || 0;
        let proximityScore = 0;
        if (userLocation) {
          const distance = calculateDistance(
            userLocation.coords.latitude,
            userLocation.coords.longitude,
            event.latitude,
            event.longitude
          );
          proximityScore = Math.max(0, 1 - (distance / 10000));
        }

        return {
          ...event,
          relevanceScore:
            savedScore + favoriteVenueScore + interestScore + timeScore + engagementScore + proximityScore,
        };
      })
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    return {
      ...venue,
      events: scoredEvents,
      relevanceScore: scoredEvents.length > 0 ? scoredEvents[0].relevanceScore || 0 : 0,
    };
  });

  const sortedVenues = venuesWithScores.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  const coordinates: [number, number] =
    cluster.clusterType === 'multi' && cluster.venues.length > 0
      ? [
          cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) / cluster.venues.length,
          cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) / cluster.venues.length,
        ]
      : [
          cluster.venues[0]?.longitude ?? 0,
          cluster.venues[0]?.latitude ?? 0,
        ];

  return {
    sortedVenues,
    coordinates,
  };
};

const trimClusterCalloutPrepCache = (cache: Map<string, PreparedClusterCallout>): void => {
  while (cache.size > ANDROID_CALLOUT_PREP_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (!firstKey) {
      return;
    }
    cache.delete(firstKey);
  }
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

type AndroidClusterMarkerFeatureProperties = {
  broadcastPulseOpacity1: number;
  broadcastPulseOpacity2: number;
  broadcastPulseOpacity3: number;
  broadcastPulseRadius1: number;
  broadcastPulseRadius2: number;
  broadcastPulseRadius3: number;
  categoryCountLabel: string;
  categoryIconImage: string;
  categoryTextColor: string;
  clusterId: string;
  eventLabel: string;
  hasCategory: boolean;
  hasEvents: boolean;
  hasFirestoreEvents: boolean;
  hasNewContent: boolean;
  hasSpecials: boolean;
  isBroadcasting: boolean;
  isProcessing: boolean;
  label: string;
  markerCategoryRadius: number;
  markerColor: string;
  markerLabelRadius: number;
  markerOpacity: number;
  markerOuterRingRadius: number;
  markerRadius: number;
  markerStrokeColor: string;
  markerStrokeWidth: number;
  markerStatusDotRadius: number;
  markerTextSize: number;
  markerTrunkTextSize: number;
  specialLabel: string;
  textColor: string;
  venueTextHaloColor: string;
  venueTextHaloWidth: number;
  hasVenueIconOutline: boolean;
  venueIconImage: string;
  venueIconOutlineSize: number;
  venueIconSize: number;
};

type AndroidClusterMarkerFeature = {
  type: 'Feature';
  id: string;
  properties: AndroidClusterMarkerFeatureProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
};

type AndroidClusterMarkerShape = {
  type: 'FeatureCollection';
  features: AndroidClusterMarkerFeature[];
};

const ANDROID_CLUSTER_CATEGORY_CYCLE_MS = 2500;
const ANDROID_CLUSTER_MARKER_PULSE_MS = 250;
const ANDROID_CLUSTER_MARKER_PULSE_STEPS = 12;
const ANDROID_CLUSTER_DARK_TEXT_COLORS = new Set(['#FBBC05']);
const ANDROID_CLUSTER_CATEGORY_PILL_SIZE = 0.6;
const ANDROID_CLUSTER_CATEGORY_GLYPH_SIZE = 0.19;
const ANDROID_CLUSTER_CATEGORY_TEXT_SIZE = 9.6;
const ANDROID_CLUSTER_COUNT_STRIP_SIZE = 0.58;
const ANDROID_CLUSTER_COUNT_GLYPH_SIZE = 0.18;
const ANDROID_CLUSTER_COUNT_TEXT_SIZE = 9.6;
const ANDROID_CLUSTER_MARKER_CATEGORY_PILL_ID = 'gathr-marker-category-pill';
const ANDROID_CLUSTER_CATEGORY_ICON_IDS = {
  bar: 'gathr-category-bar',
  church: 'gathr-category-church',
  comedy: 'gathr-category-comedy',
  default: 'gathr-category-default',
  drink: 'gathr-category-drink',
  family: 'gathr-category-family',
  food: 'gathr-category-food',
  music: 'gathr-category-music',
  nightlife: 'gathr-category-nightlife',
  sports: 'gathr-category-sports',
  theater: 'gathr-category-theater',
  trivia: 'gathr-category-trivia',
  workshop: 'gathr-category-workshop',
} as const;
const ANDROID_CLUSTER_MARKER_COUNT_STRIP_ID = 'gathr-marker-count-strip';
const ANDROID_CLUSTER_MARKER_EVENT_ICON_ID = 'gathr-marker-event-count';
const ANDROID_CLUSTER_MARKER_SPECIAL_ICON_ID = 'gathr-marker-special-count';
const ANDROID_CLUSTER_MARKER_VENUE_DARK_ICON_ID = 'gathr-marker-venue-dark';
const ANDROID_CLUSTER_MARKER_VENUE_LIGHT_ICON_ID = 'gathr-marker-venue-light';
const ANDROID_CLUSTER_MARKER_IMAGES = {
  [ANDROID_CLUSTER_MARKER_CATEGORY_PILL_ID]: require('../../assets/map-markers/marker-category-pill.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.bar]: require('../../assets/map-markers/category-bar.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.church]: require('../../assets/map-markers/category-church.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.comedy]: require('../../assets/map-markers/category-comedy.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.default]: require('../../assets/map-markers/category-default.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.drink]: require('../../assets/map-markers/category-drink.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.family]: require('../../assets/map-markers/category-family.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.food]: require('../../assets/map-markers/category-food.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.music]: require('../../assets/map-markers/category-music.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.nightlife]: require('../../assets/map-markers/category-nightlife.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.sports]: require('../../assets/map-markers/category-sports.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.theater]: require('../../assets/map-markers/category-theater.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.trivia]: require('../../assets/map-markers/category-trivia.png'),
  [ANDROID_CLUSTER_CATEGORY_ICON_IDS.workshop]: require('../../assets/map-markers/category-workshop.png'),
  [ANDROID_CLUSTER_MARKER_COUNT_STRIP_ID]: require('../../assets/map-markers/marker-count-strip.png'),
  [ANDROID_CLUSTER_MARKER_EVENT_ICON_ID]: require('../../assets/map-markers/marker-calendar.png'),
  [ANDROID_CLUSTER_MARKER_SPECIAL_ICON_ID]: require('../../assets/map-markers/marker-special.png'),
  [ANDROID_CLUSTER_MARKER_VENUE_DARK_ICON_ID]: require('../../assets/map-markers/marker-venue-dark.png'),
  [ANDROID_CLUSTER_MARKER_VENUE_LIGHT_ICON_ID]: require('../../assets/map-markers/marker-venue-light.png'),
};

const getAndroidClusterCategoryIconImage = (category: string): string => {
  const categoryLower = category.toLowerCase();

  if (categoryLower.includes('live music') || categoryLower.includes('music')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.music;
  if (categoryLower.includes('comedy')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.comedy;
  if (categoryLower.includes('sport')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.sports;
  if (categoryLower.includes('trivia')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.trivia;
  if (categoryLower.includes('workshop') || categoryLower.includes('class')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.workshop;
  if (categoryLower.includes('religious') || categoryLower.includes('church')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.church;
  if (categoryLower.includes('family')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.family;
  if (categoryLower.includes('gathering') || categoryLower.includes('parties') || categoryLower.includes('party')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.nightlife;
  if (categoryLower.includes('cinema') || categoryLower.includes('movie') || categoryLower.includes('film')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.theater;
  if (categoryLower.includes('happy hour')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.bar;
  if (categoryLower.includes('food') || categoryLower.includes('wing') || categoryLower.includes('restaurant')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.food;
  if (categoryLower.includes('drink')) return ANDROID_CLUSTER_CATEGORY_ICON_IDS.drink;

  return ANDROID_CLUSTER_CATEGORY_ICON_IDS.default;
};

const getUniqueVenueCount = (venues: Venue[]): number => {
  const keys = new Set<string>();

  venues.forEach((venue, index) => {
    keys.add(venue.locationKey || `${venue.venue}-${venue.latitude}-${venue.longitude}-${index}`);
  });

  return keys.size;
};

const getAndroidClusterCategoryItems = (cluster: Cluster, userInterests: string[]): CategoryItem[] => {
  const categoryMap = new Map<string, CategoryItem>();

  cluster.venues.forEach(venue => {
    venue.events.forEach(event => {
      const iconImage = getAndroidClusterCategoryIconImage(event.category);
      const currentItem = categoryMap.get(iconImage);
      const isUserInterest = userInterests.includes(event.category);

      if (currentItem) {
        currentItem.count += 1;
        currentItem.isUserInterest = currentItem.isUserInterest || isUserInterest;
        if (isUserInterest) {
          currentItem.category = event.category;
        }
      } else {
        categoryMap.set(iconImage, {
          category: event.category,
          count: 1,
          iconImage,
          isUserInterest,
        });
      }
    });
  });

  const items: CategoryItem[] = Array.from(categoryMap.values());

  items.sort((a, b) => {
    if (a.isUserInterest && !b.isUserInterest) return -1;
    if (!a.isUserInterest && b.isUserInterest) return 1;
    return b.count - a.count;
  });

  return items;
};

const getClusterCoordinate = (cluster: Cluster): [number, number] => {
  if (cluster.clusterType !== 'multi') {
    const venue = cluster.venues[0];
    return [venue.longitude, venue.latitude];
  }

  const totals = cluster.venues.reduce(
    (acc, venue) => ({
      longitude: acc.longitude + venue.longitude,
      latitude: acc.latitude + venue.latitude,
    }),
    { longitude: 0, latitude: 0 }
  );

  return [
    totals.longitude / cluster.venues.length,
    totals.latitude / cluster.venues.length,
  ];
};

type ActiveInterestCarouselFilter = Extract<InterestCarouselFilter, { status: 'active' }>;

const normalizeInterestCategory = (value: string): string => value.trim().toLowerCase();

const eventMatchesInterestCarouselFilter = (
  event: Event,
  filter: ActiveInterestCarouselFilter
): boolean =>
  event.type === filter.type &&
  normalizeInterestCategory(event.category) === normalizeInterestCategory(filter.category);

const clusterMatchesInterestCarouselFilter = (
  cluster: Cluster,
  filter: ActiveInterestCarouselFilter
): boolean =>
  cluster.venues.some((venue) =>
    venue.events.some((event) => eventMatchesInterestCarouselFilter(event, filter))
  );

type AndroidClusterHitTarget = {
  cluster: Cluster;
  clusterId: string;
  x: number;
  y: number;
};

const getClusterMapCoordinate = (cluster: Cluster): [number, number] | null => {
  const venues = Array.isArray(cluster.venues) ? cluster.venues : [];
  if (venues.length === 0) {
    return null;
  }

  if (cluster.clusterType !== 'multi') {
    const venue = venues[0];
    if (!Number.isFinite(venue.longitude) || !Number.isFinite(venue.latitude)) {
      return null;
    }
    return [venue.longitude, venue.latitude];
  }

  const longitude =
    venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) / venues.length;
  const latitude =
    venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) / venues.length;

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return [longitude, latitude];
};

const getClusterRenderCoordinates = (cluster: Cluster): [number, number] => {
  if (cluster.clusterType === 'multi') {
    return [
      cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.longitude, 0) /
        cluster.venues.length,
      cluster.venues.reduce((sum: number, venue: Venue) => sum + venue.latitude, 0) /
        cluster.venues.length,
    ];
  }

  return [cluster.venues[0].longitude, cluster.venues[0].latitude];
};

const clampLatitudeForMercator = (latitude: number): number =>
  Math.max(-85.05112878, Math.min(85.05112878, latitude));

const getMercatorLatitude = (latitude: number): number => {
  const radians = (clampLatitudeForMercator(latitude) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

const getLongitudeSpan = (west: number, east: number): number => {
  const span = east >= west ? east - west : east + 360 - west;
  return span > 0 ? span : 0;
};

const getLongitudeOffsetWithinBounds = (longitude: number, west: number, east: number): number => {
  let adjustedLongitude = longitude;
  if (east < west && adjustedLongitude < west) {
    adjustedLongitude += 360;
  }
  return adjustedLongitude - west;
};

const projectCoordinateToViewportPoint = (
  coordinate: [number, number],
  visibleBbox: BoundingBox,
  mapDimensions: { width: number; height: number }
): { x: number; y: number } | null => {
  const [longitude, latitude] = coordinate;
  const longitudeSpan = getLongitudeSpan(visibleBbox.west, visibleBbox.east);
  if (
    !Number.isFinite(longitudeSpan) ||
    longitudeSpan <= 0 ||
    !Number.isFinite(mapDimensions.width) ||
    !Number.isFinite(mapDimensions.height) ||
    mapDimensions.width <= 0 ||
    mapDimensions.height <= 0
  ) {
    return null;
  }

  const longitudeOffset = getLongitudeOffsetWithinBounds(
    longitude,
    visibleBbox.west,
    visibleBbox.east
  );
  const northMercator = getMercatorLatitude(visibleBbox.north);
  const southMercator = getMercatorLatitude(visibleBbox.south);
  const latitudeMercator = getMercatorLatitude(latitude);
  const latitudeSpan = northMercator - southMercator;

  if (!Number.isFinite(latitudeSpan) || latitudeSpan <= 0) {
    return null;
  }

  const x = (longitudeOffset / longitudeSpan) * mapDimensions.width;
  const y = ((northMercator - latitudeMercator) / latitudeSpan) * mapDimensions.height;
  const offscreenMargin = ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < -offscreenMargin ||
    x > mapDimensions.width + offscreenMargin ||
    y < -offscreenMargin ||
    y > mapDimensions.height + offscreenMargin
  ) {
    return null;
  }

  return { x, y };
};

const buildAndroidClusterMarkerShape = (
  clustersForRender: Cluster[],
  options: {
    categoryCycleTick: number;
    clustersReadyForInteraction: boolean;
    detailsEnabled: boolean;
    pulseStep: number;
    processingClusterId: string | null;
    selectedClusterId: string | null;
    userInterests: string[];
  }
): AndroidClusterMarkerShape => ({
  type: 'FeatureCollection',
  features: clustersForRender
    .filter(cluster => cluster.venues.length > 0)
    .map((cluster): AndroidClusterMarkerFeature => {
      const color = getTimeStatusColor(cluster.timeStatus);
      const isSelected = cluster.id === options.selectedClusterId;
      const isProcessing = cluster.id === options.processingClusterId;
      const detailsEnabled = options.detailsEnabled || isSelected;
      const isBroadcasting = detailsEnabled && !!cluster.isBroadcasting;
      const scaleFactor = Platform.OS === 'android' ? 1 : isSelected ? 1.2 : 1;
      const size = getInterestLevelSize(cluster.interestLevel) * scaleFactor;
      const markerRadius = Math.max(size * 0.8, 10);
      const getPulseRing = (offset: number) => {
        const phase = ((options.pulseStep + offset) % ANDROID_CLUSTER_MARKER_PULSE_STEPS) / (ANDROID_CLUSTER_MARKER_PULSE_STEPS - 1);

        return {
          opacity: phase < 0.1 ? 0 : 0.28 * (1 - phase),
          radius: markerRadius + 4 + phase * 22,
        };
      };
      const pulseRing1 = getPulseRing(0);
      const pulseRing2 = getPulseRing(4);
      const pulseRing3 = getPulseRing(8);
      const pulseBreath = Math.sin(
        (options.pulseStep % ANDROID_CLUSTER_MARKER_PULSE_STEPS) /
          (ANDROID_CLUSTER_MARKER_PULSE_STEPS - 1) *
          Math.PI
      );
      const usesDarkText = ANDROID_CLUSTER_DARK_TEXT_COLORS.has(color);
      const hasFirestoreEvents = detailsEnabled && cluster.venues.some(venue =>
        venue.events.some(event => event.source === 'firestore')
      );
      const categoryItems = detailsEnabled
        ? getAndroidClusterCategoryItems(cluster, options.userInterests)
        : [];
      const categoryItem = categoryItems.length > 0
        ? categoryItems[options.categoryCycleTick % categoryItems.length]
        : null;
      const venueCount = getUniqueVenueCount(cluster.venues);
      const venueLabel = String(venueCount);
      const venueTextSize = Math.min(
        Math.max(size * 0.55, venueLabel.length > 1 ? 9.2 : 9.8),
        venueLabel.length > 1 ? 10.6 : 11.2
      );

      return {
        type: 'Feature',
        id: cluster.id,
        properties: {
          broadcastPulseOpacity1: pulseRing1.opacity,
          broadcastPulseOpacity2: pulseRing2.opacity,
          broadcastPulseOpacity3: pulseRing3.opacity,
          broadcastPulseRadius1: pulseRing1.radius,
          broadcastPulseRadius2: pulseRing2.radius,
          broadcastPulseRadius3: pulseRing3.radius,
          categoryCountLabel: categoryItem ? String(categoryItem.count) : '',
          categoryIconImage: categoryItem
            ? categoryItem.iconImage
            : ANDROID_CLUSTER_CATEGORY_ICON_IDS.default,
          categoryTextColor: categoryItem?.isUserInterest ? '#4A90E2' : '#333333',
          clusterId: cluster.id,
          eventLabel: detailsEnabled && cluster.eventCount > 0 ? String(cluster.eventCount) : '',
          hasCategory: detailsEnabled && categoryItem != null,
          hasEvents: detailsEnabled && cluster.eventCount > 0,
          hasFirestoreEvents,
          hasNewContent: detailsEnabled && !!cluster.hasNewContent,
          hasSpecials: detailsEnabled && cluster.specialCount > 0,
          isBroadcasting,
          isProcessing,
          label: venueLabel,
          markerCategoryRadius: 9.5,
          markerColor: color,
          markerOpacity: !options.clustersReadyForInteraction ? 0.4 : isProcessing ? 0.65 : 1,
          markerLabelRadius: 12,
          markerOuterRingRadius: markerRadius + 7,
          markerRadius: markerRadius + (isBroadcasting ? pulseBreath * 0.55 : 0),
          markerStrokeColor: isSelected ? '#202124' : '#FFFFFF',
          markerStrokeWidth: isSelected ? 3 : 2,
          markerStatusDotRadius: Math.max(markerRadius * 0.24, 3.5),
          markerTextSize: venueTextSize,
          markerTrunkTextSize: Math.max(size * 0.9, 13),
          specialLabel: detailsEnabled && cluster.specialCount > 0 ? String(cluster.specialCount) : '',
          textColor: usesDarkText ? '#000000' : '#FFFFFF',
          venueTextHaloColor: usesDarkText ? '#FFFFFF' : '#0B3D1A',
          venueTextHaloWidth: usesDarkText ? 0.65 : 0.9,
          hasVenueIconOutline: !usesDarkText,
          venueIconImage: usesDarkText
            ? ANDROID_CLUSTER_MARKER_VENUE_DARK_ICON_ID
            : ANDROID_CLUSTER_MARKER_VENUE_LIGHT_ICON_ID,
          venueIconOutlineSize: Math.min(Math.max(size / 70, 0.2), 0.28),
          venueIconSize: Math.min(Math.max(size / 78, 0.18), 0.25),
        },
        geometry: {
          type: 'Point',
          coordinates: getClusterCoordinate(cluster),
        },
      };
    }),
});

type MapTabAnimationStopper = () => void;

const MAP_TAB_ANIMATION_STOPPERS_KEY = '__gathrMapTabAnimationStoppers';
const PAUSE_MAP_TAB_ANIMATIONS_KEY = 'pauseMapTabAnimationsForHandoff';

const getMapTabAnimationStoppers = (): Set<MapTabAnimationStopper> => {
  const globalAny = global as any;
  if (!globalAny[MAP_TAB_ANIMATION_STOPPERS_KEY]) {
    globalAny[MAP_TAB_ANIMATION_STOPPERS_KEY] = new Set<MapTabAnimationStopper>();
  }

  return globalAny[MAP_TAB_ANIMATION_STOPPERS_KEY] as Set<MapTabAnimationStopper>;
};

const stopMapTabAnimationsForHandoff = () => {
  getMapTabAnimationStoppers().forEach((stopAnimation) => {
    try {
      stopAnimation();
    } catch {
      // Best-effort handoff optimization; stale animation refs should not block navigation.
    }
  });
};

const useMapTabAnimationStopper = (stopAnimation: MapTabAnimationStopper) => {
  useEffect(() => {
    const stoppers = getMapTabAnimationStoppers();
    stoppers.add(stopAnimation);
    return () => {
      stoppers.delete(stopAnimation);
    };
  }, [stopAnimation]);
};

// Broadcasting effect component for "now" events
interface BroadcastingEffectProps {
  size: number;
  color: string;
  isActive?: boolean;
}

/**
 * Broadcasting effect component for "now" events with pulsing animation
 */
const BroadcastingEffect: React.FC<BroadcastingEffectProps> = ({ size, color, isActive = true }) => {
  // Create animation values for each ring
  const [animations] = useState([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0)
  ]);

  const stopAnimations = useCallback(() => {
    animations.forEach(anim => {
      anim.stopAnimation();
      anim.setValue(0);
    });
  }, [animations]);

  useMapTabAnimationStopper(stopAnimations);
  
  useEffect(() => {
    if (!isActive) {
      stopAnimations();
      return;
    }

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
    const runningAnimation = Animated.parallel(animationSequences);
    runningAnimation.start();
    
    // Clean up animations on unmount
    return () => {
      runningAnimation.stop();
      stopAnimations();
    };
  }, [animations, isActive, stopAnimations]);
  
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
  isActive?: boolean;
}

interface CategoryItem {
  category: string;
  count: number;
  iconImage: string;
  isUserInterest: boolean;
}

const CategoryCarousel: React.FC<CategoryCarouselProps> = ({ cluster, size, isActive = true }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isActiveRef = useRef(isActive);

  const stopFadeAnimation = useCallback(() => {
    fadeAnim.stopAnimation();
    fadeAnim.setValue(1);
  }, [fadeAnim]);

  const stopPulseAnimation = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  const stopCarouselAnimations = useCallback(() => {
    stopFadeAnimation();
    stopPulseAnimation();
  }, [stopFadeAnimation, stopPulseAnimation]);

  useMapTabAnimationStopper(stopCarouselAnimations);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Get user interests
  const userInterests = getUserInterestsSync();

  // Extract displayed marker categories with counts.
  const categoryItems = useMemo(() => {
    return getAndroidClusterCategoryItems(cluster, userInterests);
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
    if (!isActive || categoryItems.length <= 1) {
      stopFadeAnimation();
      return;
    }

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !isActiveRef.current) {
          return;
        }

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

    return () => {
      clearInterval(interval);
      stopFadeAnimation();
    };
  }, [categoryItems.length, fadeAnim, isActive, stopFadeAnimation]);

  // Pulse animation for user interests
  useEffect(() => {
    if (!isActive || categoryItems.length === 0) {
      stopPulseAnimation();
      return;
    }

    const currentItem = categoryItems[currentIndex];
    if (currentItem?.isUserInterest) {
      // Start pulsing
      const pulseAnimation = Animated.loop(
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
      );
      pulseAnimation.start();
      return () => {
        pulseAnimation.stop();
        stopPulseAnimation();
      };
    } else {
      // Reset pulse
      stopPulseAnimation();
    }
  }, [currentIndex, categoryItems, pulseAnim, isActive, stopPulseAnimation]);

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
 * Native user-location puck. Keeping this off MarkerView lets it appear without
 * waiting for the slower Android annotation path used by event cluster markers.
 */
const UserLocationMarker: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;

  return (
    <MapboxGL.LocationPuck
      visible={visible}
      puckBearingEnabled={false}
      pulsing={{ isEnabled: true, color: '#4285F4', radius: 'accuracy' }}
      scale={1}
    />
  );
};

const StartupUserLocationOverlayMarker: React.FC = () => (
  <View pointerEvents="none" style={styles.startupUserLocationOverlay}>
    <View style={styles.startupUserLocationPulse} />
    <View style={styles.startupUserLocationDot} />
  </View>
);

// Animated "New Content" Indicator Dot for map markers
interface IndicatorDotProps {
  hasNewContent: boolean;
  isActive?: boolean;
  style: any;
}

const IndicatorDot: React.FC<IndicatorDotProps> = ({ hasNewContent, isActive = true, style }) => {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.9)).current;
  const fadeOpacity = useRef(new Animated.Value(hasNewContent ? 1 : 0)).current;

  const stopIndicatorAnimations = useCallback(() => {
    pulseScale.stopAnimation();
    pulseOpacity.stopAnimation();
    fadeOpacity.stopAnimation();
    pulseScale.setValue(1);
    pulseOpacity.setValue(0.9);
    fadeOpacity.setValue(hasNewContent ? 1 : 0);
  }, [fadeOpacity, hasNewContent, pulseOpacity, pulseScale]);

  useMapTabAnimationStopper(stopIndicatorAnimations);

  // Breathing pulse animation
  useEffect(() => {
    if (hasNewContent && !isActive) {
      stopIndicatorAnimations();
      return;
    }

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
        stopIndicatorAnimations();
      };
    } else {
      // Fade out smoothly when cleared
      Animated.timing(fadeOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [fadeOpacity, hasNewContent, isActive, pulseOpacity, pulseScale, stopIndicatorAnimations]);

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
  isActive?: boolean;
}

const TreeMarker: React.FC<TreeMarkerProps> = React.memo(({ cluster, isSelected, isProcessing = false, isReady = true, detailsEnabled = true, isActive = true }) => {
  // Determine color based on time status
  const color = getTimeStatusColor(cluster.timeStatus);

  // Determine size based on interest level
  const size = getInterestLevelSize(cluster.interestLevel);

  // Scale up if selected
  const scaleFactor = Platform.OS === 'android' ? 1 : isSelected ? 1.2 : 1;
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
      {detailsEnabled && <CategoryCarousel cluster={cluster} size={adjustedSize} isActive={isActive} />}

      {/* Broadcasting effect for 'now' events */}
      {detailsEnabled && cluster.isBroadcasting && (
        <BroadcastingEffect size={adjustedSize} color={color} isActive={isActive} />
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
            isActive={isActive}
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
      {detailsEnabled && (
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
      )}

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
    prevProps.detailsEnabled === nextProps.detailsEnabled &&
    prevProps.isActive === nextProps.isActive
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

const IosCalloutTutorialOverlayHost = () => {
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const interval = setInterval(() => {
      forceRender((value) => (value + 1) % 1000000);
    }, 150);

    return () => clearInterval(interval);
  }, []);

  if (Platform.OS !== 'ios') {
    return null;
  }

  const renderOverlay = (global as any).tutorialOverlayForCalloutModal;
  return typeof renderOverlay === 'function' ? renderOverlay() : null;
};

 // Main Map Screen component
function MapScreen() {
   markTabScreenRenderStart('map');
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
  useEffect(() => {
    markTabScreenRenderCommit('map');
  });

  // Auth state for guest checking  
  const { user } = useAuth(); // Adjust import path as needed
  const isGuest = !user;

  // Guest limitation hook - only for guests
  const { trackInteraction } = useGuestInteraction();

  // Focus state - skip expensive renders when Map tab is not visible
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);
  useEffect(() => {
    if (isFocused) {
      markTabFocus('map');
    }
  }, [isFocused]);
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const globalAny = global as any;
    globalAny[PAUSE_MAP_TAB_ANIMATIONS_KEY] = stopMapTabAnimationsForHandoff;
    return () => {
      if (globalAny[PAUSE_MAP_TAB_ANIMATIONS_KEY] === stopMapTabAnimationsForHandoff) {
        delete globalAny[PAUSE_MAP_TAB_ANIMATIONS_KEY];
      }
    };
  }, []);
  const handleRootLayout = useCallback(() => {
    markTabRootLayout('map');
  }, []);

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
  const selectCallout = useMapStore((state) => state.selectCallout);
  const setZoomLevel = useMapStore((state) => state.setZoomLevel);
  const generateClusters = useMapStore((state) => state.generateClusters);
  const getClustersForZoom = useMapStore((state) => state.getClustersForZoom);
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
  const setTypeFiltersBatch = useMapStore((state) => state.setTypeFiltersBatch);
  const interestCarouselFilter = useInterestCarouselUiStore((state) => state.interestCarouselFilter);
  const setInterestCarouselFilter = useInterestCarouselUiStore((state) => state.setInterestCarouselFilter);

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
      zoomLevel,
      getClustersForZoom
    };
    return () => {
      delete (global as any).mapStore;
    };
  }, [clusters, selectedVenues, filterCriteria, zoomLevel, getClustersForZoom]);

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
  const [cachedStartupLocation, setCachedStartupLocation] = useState<GeoCoordinate | null>(() => {
    const cached = getPreloadedStartupLocationSnapshot();
    return cached ? { latitude: cached.latitude, longitude: cached.longitude } : null;
  });
  const [startupLocationResolved, setStartupLocationResolved] = useState<boolean>(() =>
    Boolean(getPreloadedStartupLocationSnapshot())
  );
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean>(false);
  const [hasInitiallyPositioned, setHasInitiallyPositioned] = useState<boolean>(false);
  const [processingClusterId, setProcessingClusterId] = useState<string | null>(null);
  const [clustersReady, setClustersReady] = useState<boolean>(false);
  const [fullClusterMarkersEnabled, setFullClusterMarkersEnabled] = useState<boolean>(false);
  const [richClusterMarkersEnabled, setRichClusterMarkersEnabled] = useState<boolean>(false);
  const [androidRichMarkerZoomAllowed, setAndroidRichMarkerZoomAllowed] = useState<boolean>(
    Platform.OS !== 'android' || START_ZOOM >= ANDROID_RICH_CLUSTER_MARKER_MIN_ZOOM
  );
  const [androidCategoryCycleTick, setAndroidCategoryCycleTick] = useState(0);
  const [androidMarkerPulseStep, setAndroidMarkerPulseStep] = useState(0);
  const [androidMarkerTouchEpoch, setAndroidMarkerTouchEpoch] = useState(0);
  const [androidRetapOverlayActive, setAndroidRetapOverlayActive] = useState(false);
  const [androidClusterHitTargets, setAndroidClusterHitTargets] = useState<AndroidClusterHitTarget[]>([]);
  const [androidAncillaryOverlaysReleasedForClose, setAndroidAncillaryOverlaysReleasedForClose] = useState(false);
  const [isTracePanelVisible, setIsTracePanelVisible] = useState(false);
  const [renderedCalloutVenues, setRenderedCalloutVenues] = useState<Venue[]>([]);
  const [renderedCalloutCluster, setRenderedCalloutCluster] = useState<Cluster | null>(null);
  const [calloutLayoutReadyKey, setCalloutLayoutReadyKey] = useState<string | null>(null);
  const [isCalloutClosingVisually, setIsCalloutClosingVisually] = useState(false);
  const [mapFirstFrameRendered, setMapFirstFrameRendered] = useState<boolean>(false);
  const [mapTabOverlaysReady, setMapTabOverlaysReady] = useState<boolean>(Platform.OS !== 'android');
  const cameraRef = useRef<MapboxGL.Camera>(null);
  const calloutAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const calloutContainerRef = useRef<View>(null);
  const filterPillsOverlayRef = useRef<any>(null);
  const filterPillsContentRef = useRef<View>(null);
  const ancillaryOverlayContainerRef = useRef<View>(null);
  const androidRetapOverlayRef = useRef<View>(null);
  const mapRef = useRef<MapboxGL.MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const calloutAnimationRequestRef = useRef(0);
  const calloutOpenTouchGuardUntilRef = useRef(0);
  const isCalloutClosingVisuallyRef = useRef(false);
  const androidRetapOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidRetapOverlayActiveRef = useRef(false);
  const androidRetapOverlayPressHandledRef = useRef(false);
  const androidClusterHitTargetsRef = useRef<AndroidClusterHitTarget[]>([]);
  const androidCalloutTeardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidControlsReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidControlsReleaseSequenceRef = useRef(0);
  const androidCalloutTeardownSequenceRef = useRef(0);
  const androidRetapLatencyProbeRef = useRef({
    active: false,
    closeReason: 'none',
    closeStartedAt: 0,
    attemptCount: 0,
  });
  const latestLocationRef = useRef<Location.LocationObject | null>(null);
  const latestClusterCountRef = useRef(0);
  const isMapLoadingRef = useRef(false);
  const clustersReadyForInteractionRef = useRef(false);
  const logAndroidRetapLatencyProbe = useCallback((
    phase: string,
    extra: Record<string, unknown> = {}
  ): void => {
    if (!DEBUG_ANDROID_RETAP_LATENCY_PROBE) {
      return;
    }

    const now = Date.now();
    const probe = androidRetapLatencyProbeRef.current;
    console.log('[RetapLatencyProbe]', phase, {
      sinceCloseMs: probe.closeStartedAt > 0 ? now - probe.closeStartedAt : null,
      active: probe.active,
      closeReason: probe.closeReason,
      attemptCount: probe.attemptCount,
      overlayActive: androidRetapOverlayActiveRef.current,
      overlayPressHandled: androidRetapOverlayPressHandledRef.current,
      targetCount: androidClusterHitTargetsRef.current.length,
      teardownPending: androidCalloutTeardownTimerRef.current !== null,
      closingVisual: isCalloutClosingVisuallyRef.current,
      ...extra,
    });
  }, []);
  const fullClusterMarkersEnabledRef = useRef(false);
  const cachedStartupCenterAppliedRef = useRef(false);
  const startupCameraCenterRef = useRef<[number, number] | null>(null);
  const startupCameraSourceRef = useRef<string | null>(null);
  const initialViewportWaitingLoggedRef = useRef(false);
  const fullClusterMarkersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const richClusterMarkersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidCalloutCameraMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapFirstFrameRenderedRef = useRef(false);
  const calloutPrepCacheRef = useRef<Map<string, PreparedClusterCallout>>(new Map());

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
  const isCalloutBlockingMapInteraction = hasRenderedCallout && !isCalloutClosingVisually;
  const clustersReadyForInteraction = !isLoading && clusters.length > 0;
  const shouldRenderStartupUserLocationMarker =
    !mapFirstFrameRendered &&
    Boolean(location || cachedStartupLocation) &&
    (locationPermissionGranted || Boolean(cachedStartupLocation));
  const shouldRenderBlockingLoadingOverlay =
    isLoading && Platform.OS !== 'android';
  clustersReadyForInteractionRef.current = clustersReadyForInteraction;
  fullClusterMarkersEnabledRef.current = fullClusterMarkersEnabled;
  const richClusterMarkerDetailsEnabled = shouldShowClusterMarkerDetails(
    zoomLevel,
    richClusterMarkersEnabled,
    androidRichMarkerZoomAllowed
  );
  const shouldMountAncillaryOverlays =
    isFocused &&
    mapTabOverlaysReady;
  const shouldRenderAncillaryOverlays =
    shouldMountAncillaryOverlays &&
    (
      (Platform.OS === 'android' && androidAncillaryOverlaysReleasedForClose) ||
      (!isCalloutOpen && (!hasPresentedCallout || isCalloutClosingVisually))
    );
  const [pauseClusterMarkerAnimations, setPauseClusterMarkerAnimations] = useState(false);
  const clusterMarkerAnimationResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (hasPresentedCallout) {
      if (clusterMarkerAnimationResumeTimerRef.current) {
        clearTimeout(clusterMarkerAnimationResumeTimerRef.current);
        clusterMarkerAnimationResumeTimerRef.current = null;
      }
      setPauseClusterMarkerAnimations(true);
      return;
    }

    if (!pauseClusterMarkerAnimations) {
      return;
    }

    if (clusterMarkerAnimationResumeTimerRef.current) {
      clearTimeout(clusterMarkerAnimationResumeTimerRef.current);
    }

    clusterMarkerAnimationResumeTimerRef.current = setTimeout(() => {
      clusterMarkerAnimationResumeTimerRef.current = null;
      setPauseClusterMarkerAnimations(false);
    }, 1400);

    return () => {
      if (clusterMarkerAnimationResumeTimerRef.current) {
        clearTimeout(clusterMarkerAnimationResumeTimerRef.current);
        clusterMarkerAnimationResumeTimerRef.current = null;
      }
    };
  }, [hasPresentedCallout, pauseClusterMarkerAnimations]);

  const clusterMarkerAnimationsActive =
    isFocused && !(Platform.OS === 'android' && pauseClusterMarkerAnimations);

  const getPreparedClusterCallout = useCallback((
    cluster: Cluster,
    source: 'tap' | 'prewarm'
  ): PreparedClusterCallout => {
    const context: ClusterCalloutPrepContext = {
      userLocation: latestLocationRef.current ?? location,
      userInterests: getUserInterestsSync(),
      savedEvents: getSavedEventsSync(),
      favoriteVenues: getFavoriteVenuesSync(),
    };
    const cacheKey = getClusterCalloutPrepCacheKey(cluster, context);
    const cached = calloutPrepCacheRef.current.get(cacheKey);

    if (cached) {
      calloutPrepCacheRef.current.delete(cacheKey);
      calloutPrepCacheRef.current.set(cacheKey, cached);
      traceMapEvent('callout_prep_cache_hit', {
        clusterId: cluster.id,
        source,
        venueCount: cached.sortedVenues.length,
      });
      return cached;
    }

    const startedAt = Date.now();
    const prepared = prepareClusterCallout(cluster, context);
    calloutPrepCacheRef.current.set(cacheKey, prepared);
    trimClusterCalloutPrepCache(calloutPrepCacheRef.current);
    traceMapEvent('callout_prep_cache_miss', {
      clusterId: cluster.id,
      source,
      venueCount: prepared.sortedVenues.length,
      prepMs: Date.now() - startedAt,
    });
    return prepared;
  }, [location]);

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !isFocused ||
      !clustersReadyForInteraction ||
      isCalloutOpen ||
      hasRenderedCallout ||
      clusters.length === 0
    ) {
      return undefined;
    }

    let cancelled = false;
    let stepTimer: ReturnType<typeof setTimeout> | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) {
        return;
      }

      const candidates = clusters
        .filter((cluster) => visibleClusterIds.current.has(cluster.id))
        .sort((a, b) => getStartupClusterScore(b) - getStartupClusterScore(a))
        .slice(0, ANDROID_CALLOUT_PREP_PREWARM_LIMIT);

      let index = 0;
      const warmNext = () => {
        if (cancelled || index >= candidates.length) {
          return;
        }

        getPreparedClusterCallout(candidates[index], 'prewarm');
        index += 1;
        stepTimer = setTimeout(warmNext, ANDROID_CALLOUT_PREP_PREWARM_STEP_MS);
      };

      stepTimer = setTimeout(warmNext, ANDROID_CALLOUT_PREP_PREWARM_STEP_MS);
    });

    return () => {
      cancelled = true;
      task.cancel();
      if (stepTimer) {
        clearTimeout(stepTimer);
      }
    };
  }, [
    clusters,
    clustersReadyForInteraction,
    filterCriteria,
    fullClusterMarkersEnabled,
    getPreparedClusterCallout,
    hasRenderedCallout,
    isCalloutOpen,
    isFocused,
    zoomLevel,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setMapTabOverlaysReady(true);
      return undefined;
    }

    if (!isFocused) {
      setMapTabOverlaysReady(false);
      return undefined;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      markTabTracePhase('map', 'map_overlays_restore_scheduled', {
        delayMs: ANDROID_MAP_TAB_OVERLAY_RESTORE_DELAY_MS,
        trigger: 'focus_request_animation_frame',
      });
      timer = setTimeout(() => {
        timer = null;
        setMapTabOverlaysReady(true);
        markTabTracePhase('map', 'map_overlays_ready', {
          delayMs: ANDROID_MAP_TAB_OVERLAY_RESTORE_DELAY_MS,
          trigger: 'focus_timer',
        });
      }, ANDROID_MAP_TAB_OVERLAY_RESTORE_DELAY_MS);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isFocused]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    (global as any).mapFirstFrameRendered = false;
    return () => {
      delete (global as any).mapFirstFrameRendered;
    };
  }, []);

  // Close filter panel and callouts only when the map tab actually loses focus.
  // A useFocusEffect cleanup tied to selectedVenues was firing during selection
  // changes and immediately tearing down a freshly opened callout on Android.
  useEffect(() => {
    if (isFocused) {
      return;
    }

    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    const runCleanup = () => {
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
    };

    const cleanupTask = InteractionManager.runAfterInteractions(() => {
      cleanupTimer = setTimeout(runCleanup, MAP_BLUR_CLEANUP_DELAY_MS);
    });

    return () => {
      cleanupTask.cancel?.();
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
      }
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

  const handleInterestPillInteraction = useCallback(() => {
    setHotInterestCarouselActive(false);
  }, []);

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
    logCalloutProbe('[CalloutProbe] store selection changed', {
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
    const liveInterestCarouselFilter = useInterestCarouselUiStore.getState().interestCarouselFilter;

    const hasActiveCategoryFilter =
      !!liveFilterCriteria.eventFilters.category ||
      !!liveFilterCriteria.specialFilters.category;
    const hasOptimisticInterestFilter = liveInterestCarouselFilter?.status === 'active';
    const hotModeWasActive = hotInterestCarouselActiveRef.current;

    if (!hotModeWasActive && !hasActiveCategoryFilter && !hasOptimisticInterestFilter) {
      return false;
    }

    if (hotModeWasActive) {
      setHotInterestCarouselActive(false);
    }
    if (hasOptimisticInterestFilter) {
      setInterestCarouselFilter({ status: 'cleared' });
    }

    const updates: Parameters<typeof setTypeFiltersBatch>[0] = [];

    // Only clear category filters that were set by interest pills
    if (liveFilterCriteria.eventFilters.categoryFilterSource === 'interest-pills') {
      updates.push({ type: 'event', typeFilters: { category: undefined } });
    }
    if (liveFilterCriteria.specialFilters.categoryFilterSource === 'interest-pills') {
      updates.push({ type: 'special', typeFilters: { category: undefined } });
    }

    if (updates.length > 0) {
      setTypeFiltersBatch(updates);
    }

    return true;
  }, [setInterestCarouselFilter, setTypeFiltersBatch]);

  // Handle hot flame pill press
  const handleHotFlamePress = useCallback(() => {
    if (!hotInterestCarouselActive) {
      // Hot mode is a separate interest carousel mode; clear category pill filters when activating it.
      setInterestCarouselFilter({ status: 'cleared' });
      setTypeFiltersBatch([
        { type: 'event', typeFilters: { category: undefined } },
        { type: 'special', typeFilters: { category: undefined } },
      ]);
    }

    setHotInterestCarouselActive((prev) => !prev);
  }, [hotInterestCarouselActive, setInterestCarouselFilter, setTypeFiltersBatch]);

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
  const [mapScreenOffset, setMapScreenOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
  const ignoreProgrammaticCameraReasonRef = useRef<string | null>(null);
  const setIgnoreProgrammaticTrace = useCallback((value: boolean, reason: string) => {
    ignoreProgrammaticCameraRef.current = value;
    ignoreProgrammaticCameraReasonRef.current = value ? reason : null;
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
  const startupGpsViewportRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startupViewportRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startupViewportRecoveryAttemptedRef = useRef(false);
  const lastViewportFetchTimeRef = useRef<number>(0);  // Track last fetch timestamp for throttling
  const currentCameraStateRef = useRef<{
    center: [number, number];
    zoom: number;
    visibleBbox: BoundingBox | null;
  } | null>(null);
  const cameraReconcileRequestIdRef = useRef<number>(0);
  const startupFallbackViewportUsedRef = useRef(false);


  // Add a ref to track current zoom threshold and visible clusters for stability
const currentThresholdIndex = useRef<number>(getThresholdIndexForZoom(zoomLevel));
const visibleClusterIds = useRef<Set<string>>(new Set());
const previousFilterCriteria = useRef<FilterCriteria>(filterCriteria);
const previousClusterCount = useRef<number>(0);
const startupMarkerSubsetLoggedRef = useRef<boolean>(false);
const startupHotspotPreviewMarkerLoggedRef = useRef<boolean>(false);
const startupInvalidCameraTickLoggedRef = useRef<boolean>(false);

  // 🔥 ANALYTICS: Add refs for tracking performance and behavior
const mapInteractionStartTime = useRef<number | null>(null);
const lastZoomLevel = useRef<number>(zoomLevel);
const sessionClusterInteractions = useRef<number>(0);
const clusterOpenStartRef = useRef<number | null>(null);
const lastOpenedClusterIdRef = useRef<string | number | null>(null);


  // Create a memoized initial center coordinate
  // This will only update when location changes, not on every render
  const initialCenterCoordinate = useMemo(() => {
    if (location) {
      return [location.coords.longitude, location.coords.latitude];
    }

    if (cachedStartupLocation) {
      return [cachedStartupLocation.longitude, cachedStartupLocation.latitude];
    }

    return [-63.1276, 46.2336]; // Default to PEI coordinates
  }, [cachedStartupLocation, location]);

  const applyAndroidStartupCameraCenter = (
    center: [number, number],
    source: string,
    options: { logMapLoadLabel?: string; allowAfterFirstFrame?: boolean } = {}
  ): boolean => {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!cameraRef.current) {
      return false;
    }

    const hotspotStartupPhase = getAndroidHotspotStartupPhase();
    if (isAndroidHotspotStartupCameraActive()) {
      logAndroidStartupTiming('startup_camera_center_skipped_for_hotspot', {
        source,
        hotspotStartupPhase,
      });
      traceMapEvent('startup_camera_center_skipped_for_hotspot', {
        source,
        hotspotStartupPhase,
      });
      return true;
    }

    const previousCenter = startupCameraCenterRef.current;
    if (previousCenter) {
      const distanceMeters = haversineMeters(
        previousCenter[0],
        previousCenter[1],
        center[0],
        center[1]
      );

      if (distanceMeters <= 80) {
        useMapStore.setState({ zoomLevel: START_ZOOM });
        lastZoomLevel.current = START_ZOOM;
        logAndroidStartupTiming('startup_camera_center_skipped_duplicate', {
          source,
          previousSource: startupCameraSourceRef.current,
          distanceMeters: Math.round(distanceMeters),
        });
        return true;
      }

      if (mapFirstFrameRenderedRef.current && !options.allowAfterFirstFrame) {
        logAndroidStartupTiming('startup_camera_center_skipped_after_first_frame', {
          source,
          previousSource: startupCameraSourceRef.current,
          distanceMeters: Math.round(distanceMeters),
        });
        return true;
      }
    }

    if (mapFirstFrameRenderedRef.current && !previousCenter && !options.allowAfterFirstFrame) {
      logAndroidStartupTiming('startup_camera_center_skipped_late_without_prior_center', {
        source,
      });
      return true;
    }

    try {
      cameraRef.current.setCamera({
        centerCoordinate: center,
        zoomLevel: START_ZOOM,
        animationDuration: 0,
      });
      startupCameraCenterRef.current = center;
      startupCameraSourceRef.current = source;
      if (typeof setZoomLevel === 'function') {
        setZoomLevel(START_ZOOM);
      }
      logAndroidStartupTiming('startup_camera_center_applied', {
        source,
        latitude: center[1],
        longitude: center[0],
      });
      if (options.logMapLoadLabel && DEBUG_MAP_LOAD) {
        console.log(`[MapLoad][${__ml_sessionIdRef.current}] ${options.logMapLoadLabel}`);
      }
      return true;
    } catch (e) {
      if (DEBUG_MAP_LOAD) {
        console.log('[MapLoad] startup camera setCamera error', e);
      }
      return false;
    }
  };

  useEffect(() => {
    let cancelled = false;

    preloadStartupLocation()
      .then((cached) => {
        if (cancelled || !cached) {
          return;
        }

        setCachedStartupLocation({
          latitude: cached.latitude,
          longitude: cached.longitude,
        });
        logAndroidStartupTiming('cached_startup_location_loaded', {
          ageMs: Date.now() - cached.timestamp,
          accuracy: cached.accuracy ?? null,
          source: cached.source ?? 'storage',
        });
        setStartupLocationResolved(true);
      })
      .catch(() => {
        // Missing/corrupt location cache should fall back silently.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cachedStartupLocation || location || cachedStartupCenterAppliedRef.current) {
      return;
    }

    const applyCachedStartupCenter = () => {
      if (!cameraRef.current || cachedStartupCenterAppliedRef.current) {
        return false;
      }

      if (Platform.OS === 'android') {
        const applied = applyAndroidStartupCameraCenter(
          [cachedStartupLocation.longitude, cachedStartupLocation.latitude],
          'cached_startup_location'
        );
        if (applied) {
          cachedStartupCenterAppliedRef.current = true;
        }
        return applied;
      }

      cameraRef.current.setCamera({
        centerCoordinate: [cachedStartupLocation.longitude, cachedStartupLocation.latitude],
        zoomLevel: START_ZOOM,
        animationDuration: 0,
      });
      cachedStartupCenterAppliedRef.current = true;
      if (typeof setZoomLevel === 'function') {
        setZoomLevel(START_ZOOM);
      }
      logAndroidStartupTiming('cached_startup_center_applied', {
        latitude: cachedStartupLocation.latitude,
        longitude: cachedStartupLocation.longitude,
      });
      return true;
    };

    if (applyCachedStartupCenter()) {
      return;
    }

    const retryTimer = setTimeout(applyCachedStartupCenter, 250);
    return () => clearTimeout(retryTimer);
  }, [cachedStartupLocation, location, setZoomLevel]);

  const requestStartupViewportFetch = (
    center: GeoCoordinate,
    source: 'fallback_center' | 'cached_startup_location' | 'gps_location'
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
    startupViewportRecoveryAttemptedRef.current = false;
    fetchViewportEvents(roundedBbox);

    if (startupViewportRecoveryTimerRef.current) {
      clearTimeout(startupViewportRecoveryTimerRef.current);
    }
    startupViewportRecoveryTimerRef.current = setTimeout(() => {
      startupViewportRecoveryTimerRef.current = null;

      const state = useMapStore.getState();
      if (
        startupViewportRecoveryAttemptedRef.current ||
        state.events.length > 0 ||
        state.viewportEvents.length > 0
      ) {
        return;
      }

      startupViewportRecoveryAttemptedRef.current = true;
      logAndroidStartupTiming('startup_viewport_recovery_fetch_requested', {
        bbox: roundedBbox,
        allEvents: state.allEvents.length,
        source,
      });
      fetchViewportEvents(roundedBbox);
    }, 1200);
  };

  const requestStartupGpsViewportFetch = (center: GeoCoordinate, attempt = 0) => {
    if (Platform.OS === 'android' && isAndroidHotspotStartupFlowActive()) {
      if (startupGpsViewportRetryTimerRef.current) {
        logAndroidStartupTiming('gps_viewport_fetch_defer_already_pending', {
          attempt,
        });
        return;
      }

      logAndroidStartupTiming('gps_viewport_fetch_deferred_for_hotspot', {
        attempt,
      });

      startupGpsViewportRetryTimerRef.current = setTimeout(() => {
        startupGpsViewportRetryTimerRef.current = null;
        requestStartupGpsViewportFetch(center, attempt + 1);
      }, 700);
      return;
    }

    requestStartupViewportFetch(center, 'gps_location');
  };

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    lastViewportBboxRef.current = null;
    startupFallbackViewportUsedRef.current = false;
    startupViewportRecoveryAttemptedRef.current = false;
  }, []);
  
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
          setStartupLocationResolved(true);
          return;
        }

        const lastKnownLocation = await Location.getLastKnownPositionAsync({
          maxAge: STARTUP_LOCATION_CACHE_MAX_AGE_MS,
          requiredAccuracy: DEVICE_LAST_KNOWN_REQUIRED_ACCURACY_METERS,
        });

        if (lastKnownLocation) {
          if (latestLocationRef.current) {
            logAndroidStartupTiming('permission_last_known_location_skipped_after_live_location', {
              accuracy: lastKnownLocation.coords.accuracy ?? null,
            });
            return;
          }

          latestLocationRef.current = lastKnownLocation;
          setLocation(lastKnownLocation);
          cacheStartupLocation(lastKnownLocation);
          setUserLocation(lastKnownLocation);
          setStartupLocationResolved(true);
          logAndroidStartupTiming('permission_last_known_location_applied', {
            accuracy: lastKnownLocation.coords.accuracy ?? null,
          });
        }
      } catch (error) {
        console.error('Error requesting location permission:', error);
        logAndroidStartupTiming('location_permission_request_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        setStartupLocationResolved(true);
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
        
        latestLocationRef.current = initialLocation;
        setLocation(initialLocation);
        cacheStartupLocation(initialLocation);
        setStartupLocationResolved(true);
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
            latestLocationRef.current = newLocation;
            setLocation(newLocation);
            cacheStartupLocation(newLocation);
            
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
        setStartupLocationResolved(true);
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
  }, [cacheStartupLocation, locationPermissionGranted, setUserLocation]); // 🔥 STABLE: Only essential dependencies
  
  // Effect to handle first-time positioning to user location
  useEffect(() => {
    // Only do this once when we first get a location
    if (location && !hasInitiallyPositioned && cameraRef.current) {
      const dest: [number, number] = [location.coords.longitude, location.coords.latitude];
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

      if (Platform.OS === 'android') {
        const applied = applyAndroidStartupCameraCenter(dest, 'initial_location', {
          logMapLoadLabel: 'applied_user_start',
        });
        if (applied) {
          __ml_userStartAppliedRef.current = true;
          setHasInitiallyPositioned(true);
        }

        autoHideEnabledRef.current = false;
        logPills('AUTO-HIDE ARMED pending (600ms)');
        setTimeout(() => {
          autoHideEnabledRef.current = true;
          logPills('AUTO-HIDE ARMED = true');
        }, 600);
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
      centerCoordinate: dest,

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

  // Initial viewport load from the same startup center used by the camera.
  // Prefer live/last-known location once permission resolves; fallback is deliberate.
  useEffect(() => {
    if (lastViewportBboxRef.current) return;

    if (!location && !cachedStartupLocation && !startupLocationResolved) {
      if (!initialViewportWaitingLoggedRef.current) {
        initialViewportWaitingLoggedRef.current = true;
        logAndroidStartupTiming('initial_viewport_waiting_for_startup_location');
      }
      return;
    }

    const source = location
      ? 'gps_location'
      : cachedStartupLocation
        ? 'cached_startup_location'
        : 'fallback_center';

    requestStartupViewportFetch(
      location
        ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }
        : {
            latitude: initialCenterCoordinate[1],
            longitude: initialCenterCoordinate[0],
          },
      source
    );
  }, [cachedStartupLocation, initialCenterCoordinate, location, startupLocationResolved]);

  // Initial viewport refinement when location is acquired
  useEffect(() => {
    if (location && (!lastViewportBboxRef.current || startupFallbackViewportUsedRef.current)) {
      requestStartupGpsViewportFetch({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
    }
  }, [location, fetchViewportEvents]);

  useEffect(() => {
    if (events.length === 0 && viewportEvents.length === 0) {
      return;
    }

    if (startupViewportRecoveryTimerRef.current) {
      clearTimeout(startupViewportRecoveryTimerRef.current);
      startupViewportRecoveryTimerRef.current = null;
    }
  }, [events.length, viewportEvents.length]);

// (Test code removed - validation complete)

// Prefer preloaded events; derive clusters immediately. Fallback only if no events.
  useEffect(() => {
    const t0 = Date.now();
    const eventsLen = Array.isArray(events) ? events.length : 0;
    const cachedClusters = Array.isArray(clusters) ? clusters.length : 0;
    console.log('[MapScreen] Mount: events =', eventsLen, 'cached clusters =', cachedClusters, 'isLoading =', isLoading);

    if (eventsLen > 0) {
      if (Platform.OS === 'android') {
        console.log('[MapScreen] Android startup waiting for fresh viewport partition before reclustering preloaded events');
        return;
      }

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

  const cancelPendingAndroidCalloutCameraMove = useCallback((source: string) => {
    if (androidCalloutCameraMoveTimerRef.current) {
      clearTimeout(androidCalloutCameraMoveTimerRef.current);
      androidCalloutCameraMoveTimerRef.current = null;
      traceMapEvent('android_callout_camera_move_cancelled', {
        source,
      });
    }
  }, []);

  const cancelPendingAndroidCalloutTeardown = useCallback((source: string) => {
    if (androidCalloutTeardownTimerRef.current) {
      clearTimeout(androidCalloutTeardownTimerRef.current);
      androidCalloutTeardownTimerRef.current = null;
      traceMapEvent('android_callout_deferred_teardown_cancelled', {
        source,
      });
    }
    androidCalloutTeardownSequenceRef.current += 1;
  }, []);

  const setAndroidRetapOverlayPointerEvents = useCallback((pointerEvents: 'auto' | 'box-none') => {
    (androidRetapOverlayRef.current as any)?.setNativeProps?.({ pointerEvents });
  }, []);

  const hideAndroidCalloutContainerForRetap = useCallback(() => {
    (calloutContainerRef.current as any)?.setNativeProps?.({
      pointerEvents: 'none',
      style: {
        opacity: 0,
        transform: [{ translateY: SCREEN_HEIGHT }],
        zIndex: -1,
        elevation: 0,
      },
    });
  }, []);

  const restoreAndroidCalloutContainerForInteraction = useCallback(() => {
    (calloutContainerRef.current as any)?.setNativeProps?.({
      pointerEvents: 'box-none',
      style: {
        opacity: 1,
        transform: [{ translateY: 0 }],
        zIndex: 15,
        elevation: 15,
      },
    });
  }, []);

  const setAndroidAncillaryOverlaysNativeVisibility = useCallback((visible: boolean) => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (visible) {
      pillsAnimation.stopAnimation(() => {
        pillsAnimation.setValue(0);
      });
      pillsOpacity.stopAnimation(() => {
        pillsOpacity.setValue(1);
      });
    }

    filterPillsOverlayRef.current?.setNativeProps?.({
      pointerEvents: visible ? 'box-none' : 'none',
      style: {
        opacity: visible ? 1 : 0,
        zIndex: 12,
        elevation: 12,
      },
    });
    filterPillsContentRef.current?.setNativeProps?.({
      pointerEvents: visible ? 'auto' : 'none',
    });
    ancillaryOverlayContainerRef.current?.setNativeProps?.({
      pointerEvents: visible ? 'box-none' : 'none',
      style: {
        opacity: visible ? 1 : 0,
        zIndex: 12,
        elevation: 12,
      },
    });
  }, [pillsAnimation, pillsOpacity]);

  const setAndroidClusterHitTargetsImmediate = useCallback((targets: AndroidClusterHitTarget[]) => {
    androidClusterHitTargetsRef.current = targets;
    setAndroidClusterHitTargets(targets);
  }, []);

  useEffect(() => {
    if (selectedVenues && selectedVenues.length > 0) {
      if (Platform.OS === 'android') {
        androidControlsReleaseSequenceRef.current += 1;
        if (androidControlsReleaseTimerRef.current) {
          clearTimeout(androidControlsReleaseTimerRef.current);
          androidControlsReleaseTimerRef.current = null;
        }
        setAndroidAncillaryOverlaysNativeVisibility(false);
        setAndroidAncillaryOverlaysReleasedForClose(false);
      }
      cancelPendingAndroidCalloutTeardown('selected-venues-promoted');
      isCalloutClosingVisuallyRef.current = false;
      setIsCalloutClosingVisually(false);
      restoreAndroidCalloutContainerForInteraction();
      setAndroidRetapOverlayPointerEvents('box-none');
      calloutOpenTouchGuardUntilRef.current = Date.now() + 900;
      logCalloutProbe('[CalloutProbe] arming map press guard', {
        until: calloutOpenTouchGuardUntilRef.current,
        selectedVenueCount: selectedVenues.length,
        selectedClusterId: selectedCluster?.id ?? 'none',
      });
      logCalloutProbe('[CalloutProbe] promoting selected venues to rendered callout', {
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
    cancelPendingAndroidCalloutCameraMove('selected-venues-empty');
    if (!hasRenderedCallout) {
      isCalloutClosingVisuallyRef.current = false;
      setIsCalloutClosingVisually(false);
    }
    logCalloutProbe('[CalloutProbe] selected venues empty', {
      selectedClusterId: selectedCluster?.id ?? 'none',
    });
  }, [
    cancelPendingAndroidCalloutCameraMove,
    cancelPendingAndroidCalloutTeardown,
    hasRenderedCallout,
    restoreAndroidCalloutContainerForInteraction,
    selectedCluster,
    selectedVenues,
    setAndroidAncillaryOverlaysNativeVisibility,
    setAndroidRetapOverlayPointerEvents,
  ]);

  useEffect(() => {
    logCalloutProbe('[CalloutProbe] rendered callout state changed', {
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

  const getAndroidProjectedClusterHitTargets = useCallback((): {
    projected: AndroidClusterHitTarget[];
    sourceCount: number;
  } => {
    const cameraState = currentCameraStateRef.current;
    const fallbackBbox = cameraState && mapDimensions
      ? getViewportBoundingBox(
          {
            latitude: cameraState.center[1],
            longitude: cameraState.center[0],
          },
          cameraState.zoom,
          mapDimensions.width,
          mapDimensions.height,
          1.0
        )
      : null;
    const visibleBbox = cameraState?.visibleBbox ?? fallbackBbox;

    if (
      Platform.OS !== 'android' ||
      !isFocused ||
      isLoading ||
      !clustersReadyForInteraction ||
      !mapDimensions ||
      !visibleBbox
    ) {
      logAndroidRetapLatencyProbe('retap_projection_skipped', {
        reason: Platform.OS !== 'android'
          ? 'not_android'
          : !isFocused
            ? 'not_focused'
            : isLoading
              ? 'loading'
              : !clustersReadyForInteraction
                ? 'clusters_not_ready'
                : !mapDimensions
                  ? 'missing_map_dimensions'
                  : 'missing_visible_bbox',
        hasCameraState: Boolean(cameraState),
        hasMapDimensions: Boolean(mapDimensions),
        clusterCount: clusters.length,
      });
      return { projected: [], sourceCount: 0 };
    }

    const sourceClusters = clusters.filter((cluster) =>
      visibleClusterIds.current.has(cluster.id) ||
      shouldClusterBeVisible(cluster, filterCriteria)
    );
    const projected = sourceClusters
      .map((cluster): AndroidClusterHitTarget | null => {
        const coordinate = getClusterMapCoordinate(cluster);
        if (!coordinate) {
          return null;
        }

        const point = projectCoordinateToViewportPoint(coordinate, visibleBbox, mapDimensions);
        if (!point) {
          return null;
        }

        return {
          cluster,
          clusterId: cluster.id,
          x: point.x + mapScreenOffset.x,
          y: point.y + mapScreenOffset.y,
        };
      })
      .filter((target): target is AndroidClusterHitTarget => target !== null)
      .slice(0, ANDROID_CLUSTER_TOUCH_OVERLAY_LIMIT);

    return { projected, sourceCount: sourceClusters.length };
  }, [
    clusters,
    clustersReadyForInteraction,
    filterCriteria,
    isFocused,
    isLoading,
    logAndroidRetapLatencyProbe,
    mapDimensions,
    mapScreenOffset.x,
    mapScreenOffset.y,
    shouldClusterBeVisible,
  ]);

  const logAndroidRetapOverlayTargets = useCallback((
    reason: string,
    sourceCount: number,
    projected: AndroidClusterHitTarget[]
  ) => {
    if (!MAP_TRACE_UI_ENABLED) {
      return;
    }

    console.log('[map] Android retap overlay targets projected', {
      reason,
      sourceCount,
      targetCount: projected.length,
      projection: 'js_visible_bbox',
      sampleTargets: projected.slice(0, 3).map((target) => ({
        id: target.clusterId.slice(0, 36),
        x: Math.round(target.x),
        y: Math.round(target.y),
        events: target.cluster.eventCount,
        specials: target.cluster.specialCount,
      })),
    });
  }, []);

  const refreshAndroidRetapTargetsFromNativeCamera = useCallback(async (reason: string): Promise<void> => {
    if (Platform.OS !== 'android' || !mapRef.current || !mapDimensions) {
      logAndroidRetapLatencyProbe('retap_native_projection_skipped', {
        reason,
        hasMapRef: Boolean(mapRef.current),
        hasMapDimensions: Boolean(mapDimensions),
      });
      return;
    }

    try {
      const [nativeVisibleBounds, nativeZoom, nativeCenter] = await Promise.all([
        mapRef.current.getVisibleBounds(),
        mapRef.current.getZoom(),
        mapRef.current.getCenter(),
      ]);
      const visibleBbox = getBoundingBoxFromPositions(nativeVisibleBounds);
      const center = getCoordinatePairFromPosition(nativeCenter);

      if (!visibleBbox || !center || typeof nativeZoom !== 'number') {
        logAndroidRetapLatencyProbe('retap_native_projection_invalid_camera', {
          reason,
          hasVisibleBbox: Boolean(visibleBbox),
          hasCenter: Boolean(center),
          nativeZoom,
        });
        return;
      }

      currentCameraStateRef.current = {
        center,
        zoom: nativeZoom,
        visibleBbox,
      };

      const { projected, sourceCount } = getAndroidProjectedClusterHitTargets();
      logAndroidRetapLatencyProbe('retap_native_projection_result', {
        reason,
        targetCount: projected.length,
        sourceCount,
        sampleTargets: projected.slice(0, 4).map((target) => ({
          id: target.clusterId.slice(0, 36),
          x: Math.round(target.x),
          y: Math.round(target.y),
          events: target.cluster.eventCount,
          specials: target.cluster.specialCount,
        })),
      });

      if (
        projected.length > 0 &&
        androidRetapOverlayActiveRef.current &&
        !androidRetapOverlayPressHandledRef.current
      ) {
        setAndroidClusterHitTargetsImmediate(projected);
        logAndroidRetapOverlayTargets('native-camera-refresh', sourceCount, projected);
      }
    } catch (error) {
      logAndroidRetapLatencyProbe('retap_native_projection_failed', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [
    getAndroidProjectedClusterHitTargets,
    logAndroidRetapLatencyProbe,
    logAndroidRetapOverlayTargets,
    mapDimensions,
    setAndroidClusterHitTargetsImmediate,
  ]);

  const isAndroidRetapEventNearTarget = useCallback((event: GestureResponderEvent): boolean => {
    if (
      Platform.OS !== 'android' ||
      !androidRetapOverlayActiveRef.current ||
      androidRetapOverlayPressHandledRef.current
    ) {
      return false;
    }

    const pageX = Number(event.nativeEvent.pageX);
    const pageY = Number(event.nativeEvent.pageY);
    const locationX = Number(event.nativeEvent.locationX);
    const locationY = Number(event.nativeEvent.locationY);
    const touchX = Number.isFinite(pageX) ? pageX : locationX;
    const touchY = Number.isFinite(pageY) ? pageY : locationY;

    if (!Number.isFinite(touchX) || !Number.isFinite(touchY)) {
      return false;
    }

    const maxDistance = ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE / 2;
    const maxDistanceSquared = maxDistance * maxDistance;
    const hitTargets =
      androidClusterHitTargetsRef.current.length > 0
        ? androidClusterHitTargetsRef.current
        : androidClusterHitTargets;

    return hitTargets.some((target) => {
      const dx = touchX - target.x;
      const dy = touchY - target.y;
      return dx * dx + dy * dy <= maxDistanceSquared;
    });
  }, [androidClusterHitTargets]);

  const deactivateAndroidRetapOverlay = useCallback(() => {
    logAndroidRetapLatencyProbe('retap_overlay_deactivated');
    androidRetapLatencyProbeRef.current.active = false;
    if (androidRetapOverlayTimerRef.current) {
      clearTimeout(androidRetapOverlayTimerRef.current);
      androidRetapOverlayTimerRef.current = null;
    }
    setAndroidRetapOverlayPointerEvents('box-none');
    setAndroidRetapOverlayActive(false);
    setAndroidClusterHitTargetsImmediate([]);
    androidRetapOverlayActiveRef.current = false;
    androidRetapOverlayPressHandledRef.current = true;
  }, [logAndroidRetapLatencyProbe, setAndroidClusterHitTargetsImmediate, setAndroidRetapOverlayPointerEvents]);

  const activateAndroidRetapOverlay = useCallback(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    if (androidRetapOverlayTimerRef.current) {
      clearTimeout(androidRetapOverlayTimerRef.current);
    }

    const { projected, sourceCount } = getAndroidProjectedClusterHitTargets();

    console.log('[map] Android retap overlay activated', {
      targetCount: projected.length,
      sourceCount,
    });
    logAndroidRetapLatencyProbe('retap_overlay_activated', {
      targetCount: projected.length,
      sourceCount,
      durationMs: ANDROID_CLUSTER_TOUCH_OVERLAY_DURATION_MS,
      sampleTargets: projected.slice(0, 4).map((target) => ({
        id: target.clusterId.slice(0, 36),
        x: Math.round(target.x),
        y: Math.round(target.y),
        events: target.cluster.eventCount,
        specials: target.cluster.specialCount,
      })),
    });
    setAndroidClusterHitTargetsImmediate(projected);
    setAndroidRetapOverlayPointerEvents('auto');
    if (projected.length > 0) {
      logAndroidRetapOverlayTargets('activate', sourceCount, projected);
    } else {
      void refreshAndroidRetapTargetsFromNativeCamera('activate-empty-targets');
    }
    androidRetapOverlayActiveRef.current = true;
    androidRetapOverlayPressHandledRef.current = false;
    setAndroidRetapOverlayActive(true);
    androidRetapOverlayTimerRef.current = setTimeout(() => {
      androidRetapOverlayTimerRef.current = null;
      console.log('[map] Android retap overlay expired');
      logAndroidRetapLatencyProbe('retap_overlay_expired');
      androidRetapLatencyProbeRef.current.active = false;
      setAndroidRetapOverlayPointerEvents('box-none');
      setAndroidRetapOverlayActive(false);
      setAndroidClusterHitTargetsImmediate([]);
      androidRetapOverlayActiveRef.current = false;
      androidRetapOverlayPressHandledRef.current = true;
    }, ANDROID_CLUSTER_TOUCH_OVERLAY_DURATION_MS);
  }, [
    getAndroidProjectedClusterHitTargets,
    logAndroidRetapOverlayTargets,
    logAndroidRetapLatencyProbe,
    refreshAndroidRetapTargetsFromNativeCamera,
    setAndroidClusterHitTargetsImmediate,
    setAndroidRetapOverlayPointerEvents,
  ]);

  useEffect(() => () => {
    if (androidRetapOverlayTimerRef.current) {
      clearTimeout(androidRetapOverlayTimerRef.current);
      androidRetapOverlayTimerRef.current = null;
    }
    if (androidCalloutTeardownTimerRef.current) {
      clearTimeout(androidCalloutTeardownTimerRef.current);
      androidCalloutTeardownTimerRef.current = null;
    }
    if (androidControlsReleaseTimerRef.current) {
      clearTimeout(androidControlsReleaseTimerRef.current);
      androidControlsReleaseTimerRef.current = null;
    }
    androidControlsReleaseSequenceRef.current += 1;
  }, []);

  const handleCalloutCloseStart = useCallback(() => {
    if (Platform.OS === 'android') {
      const probe = androidRetapLatencyProbeRef.current;
      if (!probe.active) {
        probe.active = true;
        probe.closeReason = 'close-start';
        probe.closeStartedAt = Date.now();
        probe.attemptCount = 0;
      }
      logAndroidRetapLatencyProbe('close_start');
      isCalloutClosingVisuallyRef.current = true;
      hideAndroidCalloutContainerForRetap();
      setAndroidRetapOverlayPointerEvents('auto');
    }
  }, [hideAndroidCalloutContainerForRetap, logAndroidRetapLatencyProbe, setAndroidRetapOverlayPointerEvents]);

  const trackClusterClosedOnce = useCallback(() => {
    if (clusterOpenStartRef.current == null) {
      return;
    }

    const dur = Date.now() - clusterOpenStartRef.current;
    amplitudeTrack('cluster_closed', {
      cluster_active_for_ms: dur,
      cluster_active_for_seconds: Math.round(dur / 1000),
      cluster_id: lastOpenedClusterIdRef.current ?? 'unknown',
      session_interactions: sessionClusterInteractions.current,
    });
    clusterOpenStartRef.current = null;
    lastOpenedClusterIdRef.current = null;
  }, []);

  const clearRenderedCalloutPresentation = useCallback(() => {
    calloutAnimation.setValue(SCREEN_HEIGHT);
    setRenderedCalloutVenues([]);
    setRenderedCalloutCluster(null);
    setCalloutLayoutReadyKey(null);
  }, [calloutAnimation]);

  const scheduleAndroidDeferredCalloutTeardown = useCallback((reason: string) => {
    if (Platform.OS !== 'android') {
      clearRenderedCalloutPresentation();
      return;
    }

    isCalloutClosingVisuallyRef.current = true;
    const probe = androidRetapLatencyProbeRef.current;
    if (!probe.active) {
      probe.active = true;
      probe.closeStartedAt = Date.now();
      probe.attemptCount = 0;
    }
    probe.closeReason = reason;
    logAndroidRetapLatencyProbe('deferred_teardown_requested', { reason });
    hideAndroidCalloutContainerForRetap();
    setAndroidRetapOverlayPointerEvents('auto');
    calloutAnimation.setValue(SCREEN_HEIGHT);

    if (androidCalloutTeardownTimerRef.current) {
      traceMapEvent('android_callout_deferred_teardown_already_pending', {
        reason,
      });
      logAndroidRetapLatencyProbe('deferred_teardown_already_pending', { reason });
      return;
    }

    if (androidControlsReleaseTimerRef.current) {
      clearTimeout(androidControlsReleaseTimerRef.current);
    }
    const controlsReleaseSequence = ++androidControlsReleaseSequenceRef.current;
    setAndroidAncillaryOverlaysNativeVisibility(true);
    androidControlsReleaseTimerRef.current = setTimeout(() => {
      if (androidControlsReleaseSequenceRef.current !== controlsReleaseSequence) {
        return;
      }
      androidControlsReleaseTimerRef.current = null;
      traceMapEvent('android_ancillary_overlays_released_after_close', {
        reason,
        delayMs: ANDROID_CONTROLS_RELEASE_AFTER_CLOSE_MS,
      });
      console.log('[map] Android ancillary overlays released after close', {
        reason,
        delayMs: ANDROID_CONTROLS_RELEASE_AFTER_CLOSE_MS,
      });
      logAndroidRetapLatencyProbe('ancillary_overlays_released', {
        reason,
        delayMs: ANDROID_CONTROLS_RELEASE_AFTER_CLOSE_MS,
      });
      setAndroidAncillaryOverlaysReleasedForClose(true);
    }, ANDROID_CONTROLS_RELEASE_AFTER_CLOSE_MS);

    const sequence = ++androidCalloutTeardownSequenceRef.current;
    traceMapEvent('android_callout_deferred_teardown_scheduled', {
      reason,
      delayMs: ANDROID_CALLOUT_DEFERRED_TEARDOWN_MS,
    });
    console.log('[map] Android deferred callout teardown scheduled', {
      reason,
      delayMs: ANDROID_CALLOUT_DEFERRED_TEARDOWN_MS,
    });
    logAndroidRetapLatencyProbe('deferred_teardown_scheduled', {
      reason,
      delayMs: ANDROID_CALLOUT_DEFERRED_TEARDOWN_MS,
    });

    androidCalloutTeardownTimerRef.current = setTimeout(() => {
      if (androidCalloutTeardownSequenceRef.current !== sequence) {
        return;
      }

      androidCalloutTeardownTimerRef.current = null;
      traceMapEvent('android_callout_deferred_teardown_running', {
        reason,
      });
      console.log('[map] Android deferred callout teardown running', {
        reason,
      });
      logAndroidRetapLatencyProbe('deferred_teardown_running', {
        reason,
        retainedTargets: androidClusterHitTargetsRef.current.length,
      });
      selectVenue(null);
      clearRenderedCalloutPresentation();
      isCalloutClosingVisuallyRef.current = false;
      setIsCalloutClosingVisually(false);
      setAndroidRetapOverlayPointerEvents('box-none');
      logAndroidRetapLatencyProbe('deferred_teardown_finished_targets_retained', {
        reason,
        retainedTargets: androidClusterHitTargetsRef.current.length,
      });
    }, ANDROID_CALLOUT_DEFERRED_TEARDOWN_MS);
  }, [
    calloutAnimation,
    clearRenderedCalloutPresentation,
    hideAndroidCalloutContainerForRetap,
    logAndroidRetapLatencyProbe,
    selectVenue,
    setAndroidAncillaryOverlaysNativeVisibility,
    setAndroidRetapOverlayPointerEvents,
  ]);

  const flushAndroidClosingCalloutForRetap = useCallback((clusterId: string): boolean => {
    if (
      Platform.OS !== 'android' ||
      (!isCalloutClosingVisuallyRef.current && !androidCalloutTeardownTimerRef.current)
    ) {
      return false;
    }

    logAndroidRetapLatencyProbe('closing_callout_flush_for_retap', { clusterId });
    cancelPendingAndroidCalloutTeardown('retap-open-new-callout');
    if (androidControlsReleaseTimerRef.current) {
      clearTimeout(androidControlsReleaseTimerRef.current);
      androidControlsReleaseTimerRef.current = null;
    }
    androidControlsReleaseSequenceRef.current += 1;
    setAndroidAncillaryOverlaysNativeVisibility(false);
    setAndroidAncillaryOverlaysReleasedForClose(false);
    hideAndroidCalloutContainerForRetap();
    calloutAnimation.setValue(SCREEN_HEIGHT);
    clearRenderedCalloutPresentation();
    traceMapEvent('android_callout_teardown_flushed_for_retap', {
      clusterId,
    });
    console.log('[map] Android closing callout flushed for retap', {
      clusterId,
    });

    return true;
  }, [
    calloutAnimation,
    cancelPendingAndroidCalloutTeardown,
    clearRenderedCalloutPresentation,
    hideAndroidCalloutContainerForRetap,
    logAndroidRetapLatencyProbe,
    setAndroidAncillaryOverlaysNativeVisibility,
  ]);

  const closeCallout = useCallback((reason: string) => {
    logCalloutProbe('[CalloutProbe] closeCallout', {
      reason,
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      renderedVenueCount: renderedCalloutVenues.length,
      renderedClusterId: renderedCalloutClusterId ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      guardRemainingMs: Math.max(0, calloutOpenTouchGuardUntilRef.current - Date.now()),
    });
    cancelPendingAndroidCalloutCameraMove(reason);
    handleCalloutCloseStart();
      if (Platform.OS === 'android') {
      trackClusterClosedOnce();
      activateAndroidRetapOverlay();
      scheduleAndroidDeferredCalloutTeardown(reason);
      return;
    }
    selectVenue(null);
  }, [
    activateAndroidRetapOverlay,
    cancelPendingAndroidCalloutCameraMove,
    handleCalloutCloseStart,
    isRenderedCalloutLayoutReady,
    renderedCalloutClusterId,
    renderedCalloutVenues.length,
    scheduleAndroidDeferredCalloutTeardown,
    selectedClusterId,
    selectedVenueCount,
    selectVenue,
    trackClusterClosedOnce,
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
      if (Platform.OS === 'android') {
        scheduleAndroidDeferredCalloutTeardown('callout-lifecycle-close');
        return;
      }
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
      setIsCalloutClosingVisually(false);

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
    scheduleAndroidDeferredCalloutTeardown,
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
      if (androidCalloutCameraMoveTimerRef.current) {
        clearTimeout(androidCalloutCameraMoveTimerRef.current);
        androidCalloutCameraMoveTimerRef.current = null;
      }
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
      !isFocusedRef.current ||
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
    markTabTracePhase('map', 'map_full_markers_ready', {
      clusterCount,
      source,
      startupLimit: STARTUP_CLUSTER_MARKER_LIMIT,
    });
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
    if (isFocused) {
      return;
    }

    if (fullClusterMarkersTimerRef.current) {
      clearTimeout(fullClusterMarkersTimerRef.current);
      fullClusterMarkersTimerRef.current = null;
    }
    if (richClusterMarkersTimerRef.current) {
      clearTimeout(richClusterMarkersTimerRef.current);
      richClusterMarkersTimerRef.current = null;
    }
  }, [isFocused]);

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
    if (!isFocused || isLoading || clusters.length === 0 || !clustersReadyForInteraction) {
      if (fullClusterMarkersTimerRef.current) {
        clearTimeout(fullClusterMarkersTimerRef.current);
        fullClusterMarkersTimerRef.current = null;
      }
      if (richClusterMarkersTimerRef.current) {
        clearTimeout(richClusterMarkersTimerRef.current);
        richClusterMarkersTimerRef.current = null;
      }
      if (!isFocused) {
        return;
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

      if (Platform.OS === 'android' && isAndroidHotspotStartupFlowActive()) {
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
  }, [clusters.length, clustersReadyForInteraction, enableFullClusterMarkers, fullClusterMarkersEnabled, isFocused, isLoading, richClusterMarkersEnabled]);

  // Restore animated/rich marker children after the full MarkerView set is back.
  useEffect(() => {
    if (!isFocused || isLoading || clusters.length === 0 || !clustersReadyForInteraction || !fullClusterMarkersEnabled) {
      if (richClusterMarkersTimerRef.current) {
        clearTimeout(richClusterMarkersTimerRef.current);
        richClusterMarkersTimerRef.current = null;
      }
      if (!isFocused) {
        return;
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
      if (!isFocusedRef.current) {
        return;
      }
      const clusterCount = latestClusterCountRef.current;
      setRichClusterMarkersEnabled(true);
      markTabTracePhase('map', 'map_rich_markers_ready', {
        clusterCount,
        delayMs: RICH_CLUSTER_MARKER_DELAY_MS,
      });
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

      const tabPrewarmCallback = (global as any).mapReadyForTabPrewarmCallback;
      if (typeof tabPrewarmCallback === 'function') {
        tabPrewarmCallback('rich_marker_details_enabled');
      }
    }, RICH_CLUSTER_MARKER_DELAY_MS);
  }, [clusters.length, clustersReadyForInteraction, fullClusterMarkersEnabled, isFocused, isLoading, richClusterMarkersEnabled]);

  useEffect(() => {
    if (!USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS || !isFocused || !richClusterMarkerDetailsEnabled || clusters.length === 0) {
      setAndroidCategoryCycleTick(0);
      return undefined;
    }

    if (pauseClusterMarkerAnimations) {
      return undefined;
    }

    const interval = setInterval(() => {
      setAndroidCategoryCycleTick((tick) => tick + 1);
    }, ANDROID_CLUSTER_CATEGORY_CYCLE_MS);

    return () => {
      clearInterval(interval);
    };
  }, [clusters.length, isFocused, pauseClusterMarkerAnimations, richClusterMarkerDetailsEnabled]);

  useEffect(() => {
    if (!USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS || !isFocused || !richClusterMarkerDetailsEnabled || clusters.length === 0) {
      setAndroidMarkerPulseStep(0);
      return undefined;
    }

    const hasBroadcastingCluster = clusters.some(cluster => cluster.isBroadcasting);
    if (!hasBroadcastingCluster) {
      setAndroidMarkerPulseStep(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setAndroidMarkerPulseStep((step) => (step + 1) % ANDROID_CLUSTER_MARKER_PULSE_STEPS);
    }, ANDROID_CLUSTER_MARKER_PULSE_MS);

    return () => {
      clearInterval(interval);
    };
  }, [clusters, isFocused, richClusterMarkerDetailsEnabled]);

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
    const androidCalloutTeardownWasInProgress =
      Platform.OS === 'android' &&
      (isCalloutClosingVisuallyRef.current || androidCalloutTeardownTimerRef.current !== null);

    traceMapEvent('marker_press_started', {
      clusterId: cluster.id,
      clusterType: cluster.clusterType,
      venueCount: cluster.venues?.length ?? 0,
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      activeProcessingClusterId: clusterProcessingRef.current ?? 'none',
      hasRenderedCallout,
      renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
    });
    logAndroidRetapLatencyProbe('marker_press_started', {
      clusterId: cluster.id,
      clusterType: cluster.clusterType,
      venueCount: cluster.venues?.length ?? 0,
      teardownWasInProgress: androidCalloutTeardownWasInProgress,
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      activeProcessingClusterId: clusterProcessingRef.current ?? 'none',
      hasRenderedCallout,
      renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
    });
    if (Platform.OS === 'android') {
      androidControlsReleaseSequenceRef.current += 1;
      if (androidControlsReleaseTimerRef.current) {
        clearTimeout(androidControlsReleaseTimerRef.current);
        androidControlsReleaseTimerRef.current = null;
      }
      setAndroidAncillaryOverlaysNativeVisibility(false);
      setAndroidAncillaryOverlaysReleasedForClose(false);
    }
    if (
      hasRenderedCallout &&
      !isCalloutClosingVisuallyRef.current &&
      !androidCalloutTeardownWasInProgress
    ) {
      traceMapEvent('marker_press_blocked_callout_rendered', {
        clusterId: cluster.id,
        renderedCalloutClusterId: renderedCalloutClusterId ?? 'none',
        renderedVenueCount: renderedCalloutVenueCount,
      });
      logAndroidRetapLatencyProbe('marker_press_blocked_callout_rendered', {
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
      logAndroidRetapLatencyProbe('marker_press_blocked_processing', {
        clusterId: cluster.id,
        processingClusterId: clusterProcessingRef.current,
      });
      return;
    }

    // 🛡️ HOTSPOT PREVENTION: Block clicks during programmatic camera animations
    if (
      ignoreProgrammaticCameraRef.current &&
      ignoreProgrammaticCameraReasonRef.current === 'map_loaded_initial_lock'
    ) {
      userGestureSeenRef.current = true;
      autoHideEnabledRef.current = true;
      setIgnoreProgrammaticTrace(false, 'marker_press_cleared_initial_lock');
    }

    if (ignoreProgrammaticCameraRef.current) {
      console.log('[map] Cluster tap blocked: camera animating', {
        reason: ignoreProgrammaticCameraReasonRef.current ?? 'unknown',
      });
      traceMapEvent('marker_press_blocked_programmatic', {
        clusterId: cluster.id,
        reason: ignoreProgrammaticCameraReasonRef.current ?? 'unknown',
      });
      logAndroidRetapLatencyProbe('marker_press_blocked_programmatic', {
        clusterId: cluster.id,
        reason: ignoreProgrammaticCameraReasonRef.current ?? 'unknown',
      });
      return;
    }

    // 📳 HAPTIC FEEDBACK: Provide immediate tactile confirmation of tap
    if (androidCalloutTeardownWasInProgress) {
      flushAndroidClosingCalloutForRetap(cluster.id);
    }
    if (Platform.OS === 'android' && androidRetapOverlayActiveRef.current) {
      logAndroidRetapLatencyProbe('retap_overlay_deactivated_for_marker_press', {
        clusterId: cluster.id,
      });
      deactivateAndroidRetapOverlay();
    }

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
    logAndroidRetapLatencyProbe('marker_processing_started', {
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
      const preparedCallout = getPreparedClusterCallout(cluster, 'tap');
      const sortedVenues = preparedCallout.sortedVenues;
      
      // Log the sorting results
      // LOG: Venue sorting results - shows how venues are prioritized by relevance scoring
      // console.log("Venues sorted by relevance:", sortedVenues.map((v: Venue, i: number) => {
      //   const topEvent = v.events[0];
      //   return `${i}: ${v.venue} (score: ${v.relevanceScore?.toFixed(2)}, top event: "${topEvent?.title}")`;
      // }));
      
      const calloutCluster = cluster.clusterType === 'multi' ? cluster : null;
      selectCallout(sortedVenues, calloutCluster);
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
      
      const moveCameraToCluster = () => {
        setIgnoreProgrammaticTrace(true, 'cluster_tap_camera_move');
        logPills('PROGRAMMATIC MOVE START (cluster tap) — suppress hides 800ms');
        setTimeout(() => {
          setIgnoreProgrammaticTrace(false, 'cluster_tap_camera_move_complete');
          logPills('PROGRAMMATIC MOVE END (cluster tap)');
        }, 800);

        cameraRef.current?.setCamera({
          centerCoordinate: preparedCallout.coordinates,
          zoomLevel: 14,
          animationDuration: 500,
        });
      };

      if (Platform.OS === 'android') {
        if (androidCalloutCameraMoveTimerRef.current) {
          clearTimeout(androidCalloutCameraMoveTimerRef.current);
          androidCalloutCameraMoveTimerRef.current = null;
        }
        traceMapEvent('android_callout_camera_move_skipped_freeze_map', {
          clusterId: cluster.id,
          venueCount: sortedVenues.length,
        });
      } else {
        moveCameraToCluster();
      }


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
      selectCallout(defaultVenues, cluster.clusterType === 'multi' ? cluster : null);
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
      logAndroidRetapLatencyProbe('marker_processing_completed', {
        clusterId: clusterProcessingRef.current ?? cluster.id,
      });
      clusterProcessingRef.current = null;
      setProcessingClusterId(null);
    }
  }, [
    getPreparedClusterCallout,
    isCalloutBlockingMapInteraction,
    isGuest,
    location,
    logAndroidRetapLatencyProbe,
    renderedCalloutClusterId,
    renderedCalloutVenueCount,
    selectCallout,
    setAndroidAncillaryOverlaysNativeVisibility,
    deactivateAndroidRetapOverlay,
    flushAndroidClosingCalloutForRetap,
    trackInteraction,
  ]); // REMOVED analytics, zoomLevel dependencies

  const handleAndroidRetapOverlayResponderRelease = useCallback((event: GestureResponderEvent): boolean => {
    if (
      Platform.OS !== 'android' ||
      !androidRetapOverlayActiveRef.current ||
      androidRetapOverlayPressHandledRef.current
    ) {
      return false;
    }

    const pageX = Number(event.nativeEvent.pageX);
    const pageY = Number(event.nativeEvent.pageY);
    const locationX = Number(event.nativeEvent.locationX);
    const locationY = Number(event.nativeEvent.locationY);
    const touchX = Number.isFinite(pageX) ? pageX : locationX;
    const touchY = Number.isFinite(pageY) ? pageY : locationY;

    if (!Number.isFinite(touchX) || !Number.isFinite(touchY)) {
      logAndroidRetapLatencyProbe('retap_responder_invalid_touch', {
        pageX,
        pageY,
        locationX,
        locationY,
      });
      return true;
    }

    const maxDistance = ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE / 2;
    const maxDistanceSquared = maxDistance * maxDistance;
    let matchedTarget: AndroidClusterHitTarget | null = null;
    let matchedDistanceSquared = Number.POSITIVE_INFINITY;

    const hitTargets =
      androidClusterHitTargetsRef.current.length > 0
        ? androidClusterHitTargetsRef.current
        : androidClusterHitTargets;
    androidRetapLatencyProbeRef.current.attemptCount += 1;
    logAndroidRetapLatencyProbe('retap_responder_release', {
      x: Math.round(touchX),
      y: Math.round(touchY),
      targetCount: hitTargets.length,
    });

    hitTargets.forEach((target) => {
      const dx = touchX - target.x;
      const dy = touchY - target.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= maxDistanceSquared && distanceSquared < matchedDistanceSquared) {
        matchedTarget = target;
        matchedDistanceSquared = distanceSquared;
      }
    });

    if (!matchedTarget) {
      console.log('[map] Android retap overlay miss', {
        x: Math.round(touchX),
        y: Math.round(touchY),
        targetCount: hitTargets.length,
      });
      logAndroidRetapLatencyProbe('retap_overlay_miss', {
        x: Math.round(touchX),
        y: Math.round(touchY),
        targetCount: hitTargets.length,
      });
      return true;
    }

    if (!clustersReadyForInteractionRef.current || clusterProcessingRef.current !== null) {
      console.log('[map] Android retap overlay blocked', {
        clusterId: matchedTarget.clusterId,
        clustersReadyForInteraction: clustersReadyForInteractionRef.current,
        processingClusterId: clusterProcessingRef.current,
      });
      logAndroidRetapLatencyProbe('retap_overlay_blocked', {
        clusterId: matchedTarget.clusterId,
        clustersReadyForInteraction: clustersReadyForInteractionRef.current,
        processingClusterId: clusterProcessingRef.current,
      });
      return true;
    }

    androidRetapOverlayPressHandledRef.current = true;
    logAndroidRetapLatencyProbe('retap_overlay_cluster_press', {
      clusterId: matchedTarget.clusterId,
      targetCount: hitTargets.length,
      source: 'callout_touch_capture_overlay',
    });
    traceMapEvent('android_retap_overlay_cluster_press', {
      clusterId: matchedTarget.clusterId,
      targetCount: hitTargets.length,
      source: 'callout_touch_capture_overlay',
    });
    console.log('[map] Android retap overlay cluster press', {
      clusterId: matchedTarget.clusterId,
      targetCount: hitTargets.length,
      source: 'callout_touch_capture_overlay',
    });
    deactivateAndroidRetapOverlay();
    void handleMarkerPress(matchedTarget.cluster);
    return true;
  }, [
    androidClusterHitTargets,
    deactivateAndroidRetapOverlay,
    handleMarkerPress,
    logAndroidRetapLatencyProbe,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const { projected, sourceCount } = getAndroidProjectedClusterHitTargets();

    setAndroidClusterHitTargetsImmediate(projected);

    if (androidRetapOverlayActive || hasPresentedCallout) {
      logAndroidRetapOverlayTargets('effect', sourceCount, projected);
    }

    return undefined;
  }, [
    androidMarkerTouchEpoch,
    androidRetapOverlayActive,
    fullClusterMarkersEnabled,
    getAndroidProjectedClusterHitTargets,
    hasPresentedCallout,
    logAndroidRetapOverlayTargets,
    richClusterMarkersEnabled,
    selectedClusterId,
    setAndroidClusterHitTargetsImmediate,
    zoomLevel,
  ]);

  // Handle map press to close callout
  const handleMapPress = () => {
    const guardRemainingMs = Math.max(0, calloutOpenTouchGuardUntilRef.current - Date.now());
    logCalloutProbe('[CalloutProbe] handleMapPress fired', {
      selectedVenueCount,
      selectedClusterId: selectedClusterId ?? 'none',
      ignoreProgrammatic: ignoreProgrammaticCameraRef.current,
      calloutLayoutReady: isRenderedCalloutLayoutReady,
      guardRemainingMs,
    });

    if (ignoreProgrammaticCameraRef.current) {
      logCalloutProbe('[CalloutProbe] handleMapPress ignored during programmatic camera move');
      return;
    }

    if (selectedVenues && selectedVenues.length > 0 && !isRenderedCalloutLayoutReady) {
      logCalloutProbe('[CalloutProbe] handleMapPress ignored while callout layout is pending');
      return;
    }

    if (guardRemainingMs > 0) {
      logCalloutProbe('[CalloutProbe] handleMapPress ignored by post-open guard', {
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

const isAndroidStartupCameraPayloadInvalid = useCallback(({
  zoom,
  visibleBbox,
  isGesture = false,
  userGestureSeen = userGestureSeenRef.current,
}: {
  zoom?: number;
  visibleBbox: BoundingBox | null;
  isGesture?: boolean;
  userGestureSeen?: boolean;
}): boolean => {
  if (Platform.OS !== 'android' || isGesture || userGestureSeen) {
    return false;
  }

  const zoomLooksLikeGlobe = typeof zoom === 'number' && zoom < START_ZOOM - 1;
  if (zoomLooksLikeGlobe) {
    return true;
  }

  if (!visibleBbox) {
    return false;
  }

  const spanLng = visibleBbox.east - visibleBbox.west;
  const spanLat = visibleBbox.north - visibleBbox.south;
  const bboxLooksTooBroad = spanLng > 0.9 || spanLat > 0.75;
  if (bboxLooksTooBroad) {
    return true;
  }

  const startCenter = startupCameraCenterRef.current ?? (initialCenterCoordinate as [number, number]);
  const bboxCenter: [number, number] = [
    (visibleBbox.east + visibleBbox.west) / 2,
    (visibleBbox.north + visibleBbox.south) / 2,
  ];

  return haversineMeters(startCenter[0], startCenter[1], bboxCenter[0], bboxCenter[1]) > 50000;
}, [initialCenterCoordinate]);



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


const reconcileCameraStateFromMapRef = useCallback(async (source: 'map_idle' = 'map_idle') => {
  if (Platform.OS !== 'android' || isAndroidHotspotStartupFlowActive()) {
    return;
  }

  const mapView = mapRef.current as any;
  if (
    !mapView ||
    typeof mapView.getCenter !== 'function' ||
    typeof mapView.getZoom !== 'function'
  ) {
    return;
  }

  const requestId = cameraReconcileRequestIdRef.current + 1;
  cameraReconcileRequestIdRef.current = requestId;

  try {
    const [nativeCenter, nativeZoom, nativeVisibleBounds] = await Promise.all([
      mapView.getCenter(),
      mapView.getZoom(),
      typeof mapView.getVisibleBounds === 'function'
        ? mapView.getVisibleBounds()
        : Promise.resolve(null),
    ]);

    if (cameraReconcileRequestIdRef.current !== requestId) {
      return;
    }

    const centerArr = getCoordinatePairFromPosition(nativeCenter);
    const reportedZoom = typeof nativeZoom === 'number' && Number.isFinite(nativeZoom)
      ? nativeZoom
      : undefined;

    if (!centerArr || typeof reportedZoom !== 'number') {
      return;
    }

    const nativeVisibleBbox = getBoundingBoxFromPositions(nativeVisibleBounds);
    const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
    const width = mapDimensions?.width ?? windowWidth;
    const height = mapDimensions?.height ?? windowHeight;
    const effectiveClusterZoom = getEffectiveZoomFromVisibleBounds(
      reportedZoom,
      nativeVisibleBbox,
      width * PixelRatio.get()
    );

    if (isAndroidStartupCameraPayloadInvalid({
      zoom: effectiveClusterZoom,
      visibleBbox: nativeVisibleBbox,
      userGestureSeen: userGestureSeenRef.current,
    })) {
      return;
    }

    const previousCameraState = currentCameraStateRef.current;
    const previousZoomDelta = previousCameraState
      ? Math.abs(effectiveClusterZoom - previousCameraState.zoom)
      : 0;
    const previousCenterDelta = previousCameraState
      ? haversineMeters(
          previousCameraState.center[0],
          previousCameraState.center[1],
          centerArr[0],
          centerArr[1]
        )
      : 0;
    const cameraMovedMeaningfully = previousZoomDelta >= 0.02 || previousCenterDelta >= 10;

    if (
      !userGestureSeenRef.current &&
      lastViewportBboxRef.current !== null &&
      cameraMovedMeaningfully
    ) {
      userGestureSeenRef.current = true;
      setIgnoreProgrammaticTrace(false, 'android_idle_inferred_user_gesture');
      autoHideEnabledRef.current = true;
      traceMapEvent('android_idle_inferred_user_gesture', {
        source,
        zoom: Number(effectiveClusterZoom.toFixed(2)),
      });
    }

    currentCameraStateRef.current = {
      center: centerArr,
      zoom: effectiveClusterZoom,
      visibleBbox: nativeVisibleBbox,
    };
    previousCenterRef.current = centerArr;
    lastZoomLevel.current = effectiveClusterZoom;

    setAndroidRichMarkerZoomAllowed((previous) => {
      const next = effectiveClusterZoom >= ANDROID_RICH_CLUSTER_MARKER_MIN_ZOOM;
      return previous === next ? previous : next;
    });

    const storeZoom = useMapStore.getState().zoomLevel;
    const finalZoomDelta = Math.abs(effectiveClusterZoom - storeZoom);
    const finalZoomBucketChanged = Math.floor(effectiveClusterZoom) !== Math.floor(storeZoom);
    if (finalZoomBucketChanged || finalZoomDelta >= 0.02) {
      setZoomLevel(effectiveClusterZoom);
    }

    const center: GeoCoordinate = {
      latitude: centerArr[1],
      longitude: centerArr[0],
    };
    const bbox = nativeVisibleBbox ?? getViewportBoundingBox(center, effectiveClusterZoom, width, height, 1.0);
    const roundedBbox = roundBoundingBoxForCache(bbox, 3);

    const currentViewportEvents = useMapStore.getState().viewportEvents || [];
    const onScreenEvents = currentViewportEvents.filter(event => {
      const lat = event.latitude;
      const lng = event.longitude;
      if (!lat || !lng) return false;

      return lat >= bbox.south &&
        lat <= bbox.north &&
        lng >= bbox.west &&
        lng <= bbox.east;
    });
    useMapStore.getState().setOnScreenEvents(onScreenEvents);

    const bboxChanged = !lastViewportBboxRef.current ||
      JSON.stringify(roundedBbox) !== JSON.stringify(lastViewportBboxRef.current);

    if (bboxChanged && (userGestureSeenRef.current || lastViewportBboxRef.current !== null)) {
      if (viewportFetchTimeoutRef.current) {
        clearTimeout(viewportFetchTimeoutRef.current);
        viewportFetchTimeoutRef.current = null;
      }
      lastViewportBboxRef.current = roundedBbox;
      lastViewportFetchTimeRef.current = Date.now();
      fetchViewportEvents(roundedBbox);
    }
  } catch {
    // Native camera reads are best-effort; camera-change events still handle normal updates.
  }
}, [
  fetchViewportEvents,
  isAndroidStartupCameraPayloadInvalid,
  mapDimensions?.height,
  mapDimensions?.width,
  setIgnoreProgrammaticTrace,
  setZoomLevel,
]);



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

    const storeZoom = useMapStore.getState().zoomLevel;
    const finalZoomDelta = Math.abs(zoom - storeZoom);
    const finalZoomBucketChanged = Math.floor(zoom) !== Math.floor(storeZoom);

    if (!ignoreProgrammaticCameraRef.current && (finalZoomBucketChanged || finalZoomDelta >= 0.02)) {
      lastZoomLevel.current = zoom;
      setZoomLevel(zoom);
    }

    const bbox = cameraState.visibleBbox ?? getViewportBoundingBox(center, zoom, width, height, 1.0);
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
}, [showPills, analytics, zoomLevel, isGuest, fetchViewportEvents, setZoomLevel]);


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
    if (Platform.OS === 'android') {
      applyAndroidStartupCameraCenter(dest, 'user_start', {
        logMapLoadLabel: 'applied_user_start',
      });
      return;
    }

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
    if (Platform.OS === 'android') {
      applyAndroidStartupCameraCenter(computeStartCenter(), 'initial_snap', {
        logMapLoadLabel: 'applied_initial_snap',
      });
      __ml_initialSnapDoneRef.current = true;
      return;
    }

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

  let isProgrammaticCameraMove = ignoreProgrammaticCameraRef.current && !isGesture;

  if (Platform.OS === 'android' && typeof zoom === 'number') {
    const nextZoomAllowsRichDetails = zoom >= ANDROID_RICH_CLUSTER_MARKER_MIN_ZOOM;
    setAndroidRichMarkerZoomAllowed((previous) =>
      previous === nextZoomAllowsRichDetails ? previous : nextZoomAllowsRichDetails
    );
  }

  // Center from props or geometry
  const centerArr: [number, number] | undefined =
    (Array.isArray(props.center) && props.center.length === 2 ? props.center as [number, number] : undefined) ||
    (Array.isArray(e?.geometry?.coordinates) && e.geometry.coordinates.length === 2 ? e.geometry.coordinates as [number, number] : undefined);
  const nativeVisibleBbox = getNativeVisibleBoundingBox(props);
  const { width: effectiveZoomWindowWidth } = Dimensions.get('window');
  const effectiveClusterZoom = typeof zoom === 'number'
    ? getEffectiveZoomFromVisibleBounds(
        zoom,
        Platform.OS === 'android' ? nativeVisibleBbox : null,
        (mapDimensions?.width ?? effectiveZoomWindowWidth) * PixelRatio.get()
      )
    : undefined;
  const isAndroidStartupViewportPayloadInvalid = isAndroidStartupCameraPayloadInvalid({
    zoom: effectiveClusterZoom,
    visibleBbox: nativeVisibleBbox,
    isGesture,
    userGestureSeen: userGestureSeenRef.current,
  });

  if (isAndroidStartupViewportPayloadInvalid && !startupInvalidCameraTickLoggedRef.current) {
    startupInvalidCameraTickLoggedRef.current = true;
    logAndroidStartupTiming('startup_camera_tick_ignored_for_viewport', {
      zoom: typeof zoom === 'number' ? zoom : null,
      visibleBbox: nativeVisibleBbox,
    });
  }

  if (Platform.OS === 'android' && centerArr && typeof zoom === 'number') {
    const globalAny = global as any;
    const settleTarget = globalAny.mapHotspotCameraSettleTarget;
    const settleCallback = globalAny.mapHotspotCameraSettledCallback;
    if (
      settleTarget &&
      typeof settleCallback === 'function' &&
      typeof settleTarget.longitude === 'number' &&
      typeof settleTarget.latitude === 'number' &&
      typeof settleTarget.zoom === 'number'
    ) {
      const elapsedMs = now - (Number(settleTarget.startedAt) || now);
      const minElapsedMs = Number(settleTarget.minElapsedMs) || 0;
      const maxDistanceMeters = Number(settleTarget.maxDistanceMeters) || 120;
      const maxZoomDelta = Number(settleTarget.maxZoomDelta) || 0.18;
      const distanceMeters = haversineMeters(
        centerArr[0],
        centerArr[1],
        settleTarget.longitude,
        settleTarget.latitude
      );
      const zoomDeltaToTarget = Math.abs(zoom - settleTarget.zoom);

      if (
        elapsedMs >= minElapsedMs &&
        distanceMeters <= maxDistanceMeters &&
        zoomDeltaToTarget <= maxZoomDelta
      ) {
        delete globalAny.mapHotspotCameraSettledCallback;
        delete globalAny.mapHotspotCameraSettleTarget;
        logAndroidStartupTiming('hotspot_camera_target_reached_from_camera_change', {
          elapsedMs,
          distanceMeters: Math.round(distanceMeters),
          zoomDelta: Number(zoomDeltaToTarget.toFixed(3)),
          maxDistanceMeters,
          maxZoomDelta,
        });
        settleCallback();
      }
    }
  }

  // Deltas
  const zoomDelta = typeof effectiveClusterZoom === 'number' ? Math.abs(effectiveClusterZoom - lastZoomLevel.current) : 0;
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
  const mPerPx = (typeof effectiveClusterZoom === 'number') ? metersPerPixel(latForScale, effectiveClusterZoom) : 0;
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

  if (
    Platform.OS === 'android' &&
    !isGesture &&
    !userGestureSeenRef.current &&
    !isAndroidStartupViewportPayloadInvalid &&
    !isAndroidHotspotStartupFlowActive() &&
    meaningfulChange &&
    lastViewportBboxRef.current !== null
  ) {
    userGestureSeenRef.current = true;
    setIgnoreProgrammaticTrace(false, 'android_camera_movement_inferred_user_gesture');
    autoHideEnabledRef.current = true;
    isProgrammaticCameraMove = false;
    traceMapEvent('android_camera_movement_inferred_user_gesture', {
      zoom: typeof zoom === 'number' ? zoom : 'unknown',
    });
  }

  // Update "previous" refs after computing deltas
  // Update "previous" refs after computing deltas
  if (centerArr) previousCenterRef.current = centerArr;
  if (typeof heading === 'number') previousHeadingRef.current = heading;
  if (typeof pitch === 'number') previousPitchRef.current = pitch;

  // Store current camera state for viewport fetching on movement end
  if (centerArr && typeof effectiveClusterZoom === 'number' && !isAndroidStartupViewportPayloadInvalid) {
    currentCameraStateRef.current = { center: centerArr, zoom: effectiveClusterZoom, visibleBbox: nativeVisibleBbox };
  }

/* ─────────────────────────────────────────────────────────────────────────────
Clustering refresh: keep zoom → store → recluster in sync
- Recompute clusters when the visible zoom changes enough to matter.
──────────────────────────────────────────────────────────────────────────── */
    if (
      typeof effectiveClusterZoom === 'number' &&
      !isAndroidStartupViewportPayloadInvalid &&
      Math.abs(effectiveClusterZoom - lastZoomLevel.current) >= 0.06
    ) {
      lastZoomLevel.current = effectiveClusterZoom;

      // Don't trigger cluster regeneration during programmatic camera moves
      const shouldSyncProgrammaticZoom =
        Platform.OS === 'android' &&
        nativeVisibleBbox != null &&
        !isAndroidHotspotStartupFlowActive();

      if (!isProgrammaticCameraMove || shouldSyncProgrammaticZoom) {
        try {
          setZoomLevel(effectiveClusterZoom); // triggers generateClusters(zoom) in the store
        } catch (e) {
          if (DEBUG_MAP_LOAD) console.log('[MapLoad] setZoomLevel error', e);
        }
      } else {
        // During programmatic moves, just update the zoom ref without reclustering
        logPills('ZOOM CHANGED during programmatic move — skipping recluster', { zoom: effectiveClusterZoom });
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

  if (centerArr && typeof effectiveClusterZoom === 'number') {
    if (isAndroidStartupViewportPayloadInvalid) {
      lastCameraChangeRef.current = now;
      return;
    }

    const center: GeoCoordinate = {
      latitude: centerArr[1],
      longitude: centerArr[0]
    };

    // Prefer Mapbox's native visible bounds; fall back to a zoom-derived bbox.
    const bbox = nativeVisibleBbox ?? getViewportBoundingBox(center, effectiveClusterZoom, width, height, 1.0);
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
  isAndroidStartupCameraPayloadInvalid,
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
      if (startupGpsViewportRetryTimerRef.current) {
        clearTimeout(startupGpsViewportRetryTimerRef.current);
      }
      if (startupViewportRecoveryTimerRef.current) {
        clearTimeout(startupViewportRecoveryTimerRef.current);
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

  // Keep MarkerViews mounted across tab switches; remounting all custom
  // clusters is the expensive part of returning to the Map tab on Android.
  const renderClusterMarkers = () => {
    const markerRenderStartedAt =
      __DEV__ && typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : null;
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
    const activeInterestMarkerFilter =
      interestCarouselFilter?.status === 'active' ? interestCarouselFilter : null;

    markTabTracePhase('map', 'map_markers_render_start', {
      clusterCount: clusters.length,
      visibleCount: visibleClustersForRender.length,
      renderedCount: clustersForRender.length,
      fullMarkers: fullClusterMarkersEnabled,
      richMarkers: richClusterMarkersEnabled,
      richDetails: richClusterMarkerDetailsEnabled,
    });
    markTabTracePhase('map', 'map_markers_render_complete', {
      clusterCount: clusters.length,
      visibleCount: visibleClustersForRender.length,
      renderedCount: clustersForRender.length,
      fullMarkers: fullClusterMarkersEnabled,
      richMarkers: richClusterMarkersEnabled,
      richDetails: richClusterMarkerDetailsEnabled,
      renderMs: markerRenderStartedAt == null
        ? null
        : Math.round((performance.now() - markerRenderStartedAt) * 10) / 10,
    });

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

    if (USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS) {
      const layerMarkerShape = buildAndroidClusterMarkerShape(clustersForRender, {
        categoryCycleTick: androidCategoryCycleTick,
        clustersReadyForInteraction,
        detailsEnabled: richClusterMarkerDetailsEnabled,
        pulseStep: androidMarkerPulseStep,
        processingClusterId,
        selectedClusterId,
        userInterests: getUserInterestsSync(),
      });

      return (
        <MapboxGL.ShapeSource
          key="android-cluster-layer-source"
          id="android-cluster-layer-source"
          shape={layerMarkerShape as any}
          hitbox={{ width: 44, height: 44 }}
          onPress={(event: any) => {
            if (
              !clustersReadyForInteraction ||
              processingClusterId !== null ||
              (hasRenderedCallout && !isCalloutClosingVisuallyRef.current)
            ) {
              return;
            }

            const feature = event?.features?.[0];
            const clusterId = feature?.properties?.clusterId;
            const cluster = clustersForRender.find((item) => item.id === clusterId);
            if (cluster) {
              void handleMarkerPress(cluster);
            }
          }}
        >
          <MapboxGL.CircleLayer
            id="android-cluster-layer-shadow"
            style={{
              circleColor: '#000000',
              circleOpacity: 0.18,
              circleRadius: ['get', 'markerRadius'] as any,
              circleTranslate: [0, 2],
              circleTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-broadcast-ring-1"
            filter={['==', ['get', 'isBroadcasting'], true] as any}
            style={{
              circleColor: 'rgba(255,255,255,0)',
              circleRadius: ['get', 'broadcastPulseRadius1'] as any,
              circleStrokeColor: ['get', 'markerColor'] as any,
              circleStrokeOpacity: ['get', 'broadcastPulseOpacity1'] as any,
              circleStrokeWidth: 2,
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-broadcast-ring-2"
            filter={['==', ['get', 'isBroadcasting'], true] as any}
            style={{
              circleColor: 'rgba(255,255,255,0)',
              circleRadius: ['get', 'broadcastPulseRadius2'] as any,
              circleStrokeColor: ['get', 'markerColor'] as any,
              circleStrokeOpacity: ['get', 'broadcastPulseOpacity2'] as any,
              circleStrokeWidth: 2,
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-broadcast-ring-3"
            filter={['==', ['get', 'isBroadcasting'], true] as any}
            style={{
              circleColor: 'rgba(255,255,255,0)',
              circleRadius: ['get', 'broadcastPulseRadius3'] as any,
              circleStrokeColor: ['get', 'markerColor'] as any,
              circleStrokeOpacity: ['get', 'broadcastPulseOpacity3'] as any,
              circleStrokeWidth: 2,
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-processing-ring"
            filter={['==', ['get', 'isProcessing'], true] as any}
            style={{
              circleColor: 'rgba(255,255,255,0)',
              circleRadius: ['get', 'markerOuterRingRadius'] as any,
              circleStrokeColor: ['get', 'markerColor'] as any,
              circleStrokeOpacity: 0.8,
              circleStrokeWidth: 2,
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-trunks"
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: ['get', 'markerColor'] as any,
              textField: 'I',
              textHaloColor: '#FFFFFF',
              textHaloWidth: 0.5,
              textIgnorePlacement: true,
              textSize: ['get', 'markerTrunkTextSize'] as any,
              textTranslate: [0, 10],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-tree-tops"
            style={{
              circleColor: ['get', 'markerColor'] as any,
              circleOpacity: ['get', 'markerOpacity'] as any,
              circleRadius: ['get', 'markerRadius'] as any,
              circleStrokeColor: ['get', 'markerStrokeColor'] as any,
              circleStrokeWidth: ['get', 'markerStrokeWidth'] as any,
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-category-pills"
            filter={['==', ['get', 'hasCategory'], true] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_CATEGORY_PILL_ID,
              iconSize: ANDROID_CLUSTER_CATEGORY_PILL_SIZE,
              iconTranslate: [0, -24],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-count-strips"
            filter={['any', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_COUNT_STRIP_ID,
              iconSize: ANDROID_CLUSTER_COUNT_STRIP_SIZE,
              iconTranslate: [0, 26],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-new-content-dots"
            filter={['==', ['get', 'hasNewContent'], true] as any}
            style={{
              circleColor: '#F44336',
              circleRadius: ['get', 'markerStatusDotRadius'] as any,
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: 1,
              circleTranslate: [9, -9],
              circleTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.CircleLayer
            id="android-cluster-layer-firestore-badges"
            filter={['==', ['get', 'hasFirestoreEvents'], true] as any}
            style={{
              circleColor: '#E3F2FD',
              circleRadius: ['get', 'markerStatusDotRadius'] as any,
              circleStrokeColor: '#1565C0',
              circleStrokeWidth: 1,
              circleTranslate: [-9, -9],
              circleTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-category-icons"
            filter={['==', ['get', 'hasCategory'], true] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ['get', 'categoryIconImage'] as any,
              iconSize: ANDROID_CLUSTER_CATEGORY_GLYPH_SIZE,
              iconTranslate: [-8, -24],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-category-counts"
            filter={['==', ['get', 'hasCategory'], true] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: ['get', 'categoryTextColor'] as any,
              textField: ['get', 'categoryCountLabel'] as any,
              textHaloColor: '#F5F3E8',
              textHaloWidth: 0.6,
              textIgnorePlacement: true,
              textSize: ANDROID_CLUSTER_CATEGORY_TEXT_SIZE,
              textTranslate: [8, -24],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-event-icons-both"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_EVENT_ICON_ID,
              iconSize: ANDROID_CLUSTER_COUNT_GLYPH_SIZE,
              iconTranslate: [-18, 26],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-event-icons-only"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], false]] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_EVENT_ICON_ID,
              iconSize: ANDROID_CLUSTER_COUNT_GLYPH_SIZE,
              iconTranslate: [-7, 26],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-event-labels-both"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: '#2196F3',
              textField: ['get', 'eventLabel'] as any,
              textHaloColor: '#F5F3E8',
              textHaloWidth: 1,
              textIgnorePlacement: true,
              textSize: ANDROID_CLUSTER_COUNT_TEXT_SIZE,
              textTranslate: [-6, 26],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-event-labels-only"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], false]] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: '#2196F3',
              textField: ['get', 'eventLabel'] as any,
              textHaloColor: '#F5F3E8',
              textHaloWidth: 1,
              textIgnorePlacement: true,
              textSize: ANDROID_CLUSTER_COUNT_TEXT_SIZE,
              textTranslate: [7, 26],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-special-icons-both"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_SPECIAL_ICON_ID,
              iconSize: ANDROID_CLUSTER_COUNT_GLYPH_SIZE,
              iconTranslate: [7, 26],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-special-icons-only"
            filter={['all', ['==', ['get', 'hasEvents'], false], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_SPECIAL_ICON_ID,
              iconSize: ANDROID_CLUSTER_COUNT_GLYPH_SIZE,
              iconTranslate: [-7, 26],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-special-labels-both"
            filter={['all', ['==', ['get', 'hasEvents'], true], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: '#34A853',
              textField: ['get', 'specialLabel'] as any,
              textHaloColor: '#F5F3E8',
              textHaloWidth: 1,
              textIgnorePlacement: true,
              textSize: ANDROID_CLUSTER_COUNT_TEXT_SIZE,
              textTranslate: [18, 26],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-special-labels-only"
            filter={['all', ['==', ['get', 'hasEvents'], false], ['==', ['get', 'hasSpecials'], true]] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: '#34A853',
              textField: ['get', 'specialLabel'] as any,
              textHaloColor: '#F5F3E8',
              textHaloWidth: 1,
              textIgnorePlacement: true,
              textSize: ANDROID_CLUSTER_COUNT_TEXT_SIZE,
              textTranslate: [7, 26],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-firestore-labels"
            filter={['==', ['get', 'hasFirestoreEvents'], true] as any}
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: '#1565C0',
              textField: 'F',
              textIgnorePlacement: true,
              textSize: 7,
              textTranslate: [-9, -9],
              textTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-venue-icon-outlines"
            filter={['==', ['get', 'hasVenueIconOutline'], true] as any}
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ANDROID_CLUSTER_MARKER_VENUE_DARK_ICON_ID,
              iconOpacity: 0.9,
              iconSize: ['get', 'venueIconOutlineSize'] as any,
              iconTranslate: [-4, 0],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-venue-icons"
            style={{
              iconAllowOverlap: true,
              iconAnchor: 'center',
              iconIgnorePlacement: true,
              iconImage: ['get', 'venueIconImage'] as any,
              iconSize: ['get', 'venueIconSize'] as any,
              iconTranslate: [-4, 0],
              iconTranslateAnchor: 'viewport',
            }}
          />
          <MapboxGL.SymbolLayer
            id="android-cluster-layer-venue-labels"
            style={{
              textAllowOverlap: true,
              textAnchor: 'center',
              textColor: ['get', 'textColor'] as any,
              textField: ['get', 'label'] as any,
              textIgnorePlacement: true,
              textHaloColor: ['get', 'venueTextHaloColor'] as any,
              textHaloWidth: ['get', 'venueTextHaloWidth'] as any,
              textSize: ['get', 'markerTextSize'] as any,
              textTranslate: [4, 0],
              textTranslateAnchor: 'viewport',
            }}
          />
        </MapboxGL.ShapeSource>
      );
    }

    return clustersForRender
      .map((cluster: Cluster, index: number) => {
        // Calculate the coordinates for the cluster
        const coordinates = getClusterRenderCoordinates(cluster);
      
        // Check if this cluster contains the selected venue
        const isSelected =
          selectedVenues && selectedVenues.length > 0
            ? cluster.venues.some((venue: Venue) =>
                selectedVenues.some(selectedVenue => selectedVenue.locationKey === venue.locationKey)
              )
            : false;

        // 🎯 TUTORIAL INTEGRATION: Add targeting for closest cluster
        const isClosestCluster = index === 0; // First cluster is prioritized
        const isDimmedByInterestFilter =
          !!activeInterestMarkerFilter &&
          !isSelected &&
          !clusterMatchesInterestCarouselFilter(cluster, activeInterestMarkerFilter);
        const markerKey =
          Platform.OS === 'android'
            ? `cluster-${cluster.id}-${androidMarkerTouchEpoch}`
            : `cluster-${cluster.id}`;

        return (
          <MapboxGL.MarkerView
            key={markerKey}
            id={markerKey}
            coordinate={coordinates}
            anchor={{ x: 0.5, y: 1.0 }}
            
          >
            <TouchableOpacity
              onPress={() => handleMarkerPress(cluster)}
              testID={isClosestCluster ? "closest-cluster" : undefined}
              disabled={!clustersReadyForInteraction || processingClusterId !== null}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={isDimmedByInterestFilter ? styles.interestFilteredMarkerDimmed : undefined}
            >
              <TreeMarker
                cluster={cluster}
                isSelected={isSelected}
                isProcessing={processingClusterId === cluster.id}
                isReady={clustersReadyForInteraction}
                detailsEnabled={richClusterMarkersEnabled}
                isActive={clusterMarkerAnimationsActive}
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
    logCalloutProbe('[CalloutProbe] renderCalloutPresentation', {
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
          <IosCalloutTutorialOverlayHost />
        </View>
      </Modal>
    );
  };

  const calloutOverlayBackgroundColor = Platform.OS === 'android' || isCalloutClosingVisually
    ? 'rgba(0, 0, 0, 0)'
    : 'rgba(0, 0, 0, 0.3)';

  // Render the map
  return (
    <View style={styles.container} onLayout={handleRootLayout}>
      {isHeaderSearchActive && (
        <Pressable
          onPress={() => { setHeaderSearchActive(false); Keyboard.dismiss(); }}
          style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}
        />
      )}
      {/* Add Filter Bar at the top */}
      {/* Filter pills overlay (floating) anchored under safe-area */}
      {shouldMountAncillaryOverlays && (
        <Animated.View
          ref={filterPillsOverlayRef}
          pointerEvents={shouldRenderAncillaryOverlays ? 'box-none' : 'none'}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: TOP_OFFSET, // baseline + per-platform nudge
            zIndex: 12,
            elevation: 12,
            transform: [{ translateY: pillsAnimation }],
            opacity: shouldRenderAncillaryOverlays ? pillsOpacity : 0,
          }}
        >
          <View
            ref={filterPillsContentRef}
            testID="filter-pills"
            pointerEvents={shouldRenderAncillaryOverlays ? 'auto' : 'none'}
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
        surfaceView={Platform.OS === 'android' ? false : undefined}
onLayout={(event) => {
  const { width, height, x, y } = event.nativeEvent.layout;
  setMapDimensions({ width, height });
  setMapScreenOffset({ x, y });

  // Use measureInWindow to get absolute screen coordinates
  // mapRef.current is the MapboxGL.MapView which doesn't have measureInWindow
  // So we measure via the native view handle
  const nativeHandle = (mapRef.current as any)?._nativeRef;
  if (nativeHandle?.measureInWindow) {
    nativeHandle.measureInWindow((absX: number, absY: number, absWidth: number, absHeight: number) => {
      setMapDimensions({ width: absWidth, height: absHeight });
      setMapScreenOffset({ x: absX, y: absY });
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
  void reconcileCameraStateFromMapRef('map_idle');
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

  const tutorialCameraIdleCallback = (global as any).mapTutorialCameraIdleCallback;
  if (typeof tutorialCameraIdleCallback === 'function') {
    tutorialCameraIdleCallback();
  }
}}

onDidFinishRenderingFrameFully={() => {
  markTabTracePhase('map', 'mapbox_frame_fully', {
    firstStartupFrameAlreadyRendered: mapFirstFrameRenderedRef.current,
    overlaysReady: mapTabOverlaysReady,
    fullMarkers: fullClusterMarkersEnabled,
    richMarkers: richClusterMarkersEnabled,
  });
  if (!mapFirstFrameRenderedRef.current) {
    mapFirstFrameRenderedRef.current = true;
    (global as any).mapFirstFrameRendered = true;
    setMapFirstFrameRendered(true);
  }
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
  markTabTracePhase('map', 'mapbox_loaded', {
    firstStartupFrameRendered: mapFirstFrameRenderedRef.current,
    overlaysReady: mapTabOverlaysReady,
    fullMarkers: fullClusterMarkersEnabled,
    richMarkers: richClusterMarkersEnabled,
  });

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
      if (Platform.OS === 'android') {
        applyAndroidStartupCameraCenter(startCenter, 'map_loaded');
      } else {
        cameraRef.current?.setCamera({
          centerCoordinate: startCenter,
          zoomLevel: START_ZOOM,
          animationDuration: 0,
        });
        if (typeof setZoomLevel === 'function') {
          setZoomLevel(START_ZOOM);
        }
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

        {USE_ANDROID_NATIVE_CLUSTER_MARKER_LAYERS && (
          <MapboxGL.Images images={ANDROID_CLUSTER_MARKER_IMAGES} />
        )}
       
        {/* Render native user location as soon as permission is available */}
        {locationPermissionGranted && (
          <UserLocationMarker visible={locationPermissionGranted} />
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

      {shouldMountAncillaryOverlays && (
        <View
          ref={ancillaryOverlayContainerRef}
          pointerEvents={shouldRenderAncillaryOverlays ? 'box-none' : 'none'}
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: shouldRenderAncillaryOverlays ? 1 : 0,
              zIndex: 12,
              elevation: 12,
            },
          ]}
        >
          <MapLegend topOffset={30} rightOffset={10} />

          {/* Hot Flame Pill - shows "What's hot" filter in top-right */}
          <HotFlamePill
            top={134}
            right={10}
            isActive={hotInterestCarouselActive}
            onPress={handleHotFlamePress}
          />

          <View pointerEvents="box-none" style={styles.interestPillsContainer}>
            <InterestFilterPills onPillInteraction={handleInterestPillInteraction} />
          </View>

          {/* Interests Carousel - appears when interest pill is selected */}
          <InterestsCarousel
            hotModeActive={hotInterestCarouselActive}
            onDismissHotMode={() => setHotInterestCarouselActive(false)}
          />
        </View>
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
      
      {shouldRenderBlockingLoadingOverlay && (
        <View style={styles.loadingOverlay}>
          <Text>Loading map data...</Text>
        </View>
      )}

      {shouldRenderStartupUserLocationMarker && (
        <StartupUserLocationOverlayMarker />
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
          <View
            style={[
              styles.clustersLoadingMessage,
              shouldRenderStartupUserLocationMarker && styles.clustersLoadingMessageWithStartupLocation,
            ]}
          >
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
  onStartShouldSetResponder={() =>
    !isCalloutClosingVisuallyRef.current || androidRetapOverlayActiveRef.current
  }
  onMoveShouldSetResponder={() =>
    !isCalloutClosingVisuallyRef.current || androidRetapOverlayActiveRef.current
  }
  onResponderRelease={(event) => {
    if (handleAndroidRetapOverlayResponderRelease(event)) {
      return;
    }
    if (isCalloutClosingVisuallyRef.current) {
      return;
    }
    // Tapping outside the sheet intentionally closes it with animation
    console.log('OVERLAY TAP - dismissing callout with animation');
    handleCalloutCloseStart();
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
      backgroundColor: calloutOverlayBackgroundColor,
    }
  ]}
/>
</View>

          
          {/* Callout container - box-none allows taps to pass through to overlay below */}
          <View
            ref={calloutContainerRef}
            style={styles.calloutAnimatedContainer}
            pointerEvents={isCalloutClosingVisually ? 'none' : 'box-none'}
          >
            <ActiveCalloutComponent 
              key={presentedCalloutPresentationKey}
              venues={presentedCalloutVenues}
              cluster={presentedCalloutCluster}
              onClose={() => closeCallout('callout-onClose-prop')}
              onCloseStart={handleCalloutCloseStart}
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

          {Platform.OS === 'android' &&
            (androidRetapOverlayActive || isCalloutClosingVisually) && (
          <View
            ref={androidRetapOverlayRef}
            pointerEvents={androidRetapOverlayActive || isCalloutClosingVisually ? 'auto' : 'box-none'}
            onStartShouldSetResponder={(event) =>
              isCalloutClosingVisuallyRef.current || isAndroidRetapEventNearTarget(event)
            }
            onMoveShouldSetResponder={() =>
              isCalloutClosingVisuallyRef.current
            }
            onResponderRelease={handleAndroidRetapOverlayResponderRelease}
            style={[StyleSheet.absoluteFillObject, { zIndex: 10, elevation: 10 }]}
          >
            {androidClusterHitTargets.map((target) => (
              <Pressable
                key={`android-retap-target-${target.clusterId}`}
                collapsable={false}
                disabled={!clustersReadyForInteraction || processingClusterId !== null}
                onPress={() => {
                  if (
                    (!androidRetapOverlayActiveRef.current && !isCalloutClosingVisuallyRef.current) ||
                    androidRetapOverlayPressHandledRef.current
                  ) {
                    return;
                  }
                  androidRetapOverlayPressHandledRef.current = true;
                  androidRetapLatencyProbeRef.current.attemptCount += 1;
                  logAndroidRetapLatencyProbe('retap_pressable_cluster_press', {
                    clusterId: target.clusterId,
                    targetCount: androidClusterHitTargets.length,
                    source: 'retained_cluster_pressable',
                  });
                  traceMapEvent('android_retap_overlay_cluster_press', {
                    clusterId: target.clusterId,
                    targetCount: androidClusterHitTargets.length,
                  });
                  console.log('[map] Android retap overlay cluster press', {
                    clusterId: target.clusterId,
                    targetCount: androidClusterHitTargets.length,
                  });
                  deactivateAndroidRetapOverlay();
                  void handleMarkerPress(target.cluster);
                }}
                style={{
                  position: 'absolute',
                  left: target.x - ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE / 2,
                  top: target.y - ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE / 2,
                  width: ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE,
                  height: ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE,
                  borderRadius: ANDROID_CLUSTER_TOUCH_OVERLAY_SIZE / 2,
                  backgroundColor: 'rgba(255,255,255,0.01)',
                }}
              />
            ))}
          </View>
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
  clustersLoadingMessageWithStartupLocation: {
    transform: [{ translateY: 48 }],
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
  interestFilteredMarkerDimmed: {
    opacity: 0.28,
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
  startupUserLocationOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 101,
    elevation: 101,
  },
  startupUserLocationPulse: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(66, 133, 244, 0.18)',
    borderWidth: 2,
    borderColor: 'rgba(66, 133, 244, 0.35)',
  },
  startupUserLocationDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4285F4',
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 6,
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

