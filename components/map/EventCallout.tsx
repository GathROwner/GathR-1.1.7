/**
 * Callout scrolling on Android — rationale & fixes
 *
 * PROBLEM:
 *   Inside an animated/gesture container over a Map, Android wasn’t letting the inner list scroll.
 *   iOS worked. On Android, map/parent gestures and transforms can steal/short-circuit ScrollView drags.
 *
 * FIXES:
 *   - Use GH ScrollView (from 'react-native-gesture-handler') + app wrapped in GestureHandlerRootView (see app/_layout.tsx).
 *   - Do NOT toggle list scroll in PanResponder (avoid stuck "no-scroll" if a gesture is canceled).
 *   - While callout is open, disable map gestures (see map.tsx) so the map can’t swallow vertical drags.
 *   - Props: nestedScrollEnabled + keyboardShouldPersistTaps to help Android dispatch.
 *   - Overlays (e.g., progress stripe) use pointerEvents="none"; wrappers use pointerEvents="box-none".
 *
 * RESULT:
 *   Reliable vertical scrolling in the callout on Android, with header drag + tutorial behaviors intact.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { toggleSavedEvent as toggleSavedEventSvc } from '../../services/userService';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';



// 🌀 Use GH ScrollView (not RN ScrollView) so scrolling works inside animated/gesture containers on Android.
// Requires app wrapped in <GestureHandlerRootView /> (see app/_layout.tsx).
import { ScrollView } from 'react-native-gesture-handler';


// TypeScript fix for global tutorial manager
declare global {
  namespace NodeJS {
    interface Global {
      tutorialManager?: {
        getCurrentStep?: () => { id: string } | null;
        getIsActive?: () => boolean;
        getCurrentSubStep?: () => number;
        setVenueSelectorMeasurement?: {
          x: number;
          y: number;
          width: number;
          height: number;
        };
      };
    }
  }
}

// Extend globalThis for tutorial manager
declare const global: typeof globalThis & {
  tutorialManager?: {
    getCurrentStep?: () => { id: string } | null;
    getIsActive?: () => boolean;
    getCurrentSubStep?: () => number;
    setVenueSelectorMeasurement?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Share,
  Animated,
  Dimensions,
  NativeSyntheticEvent,
  LayoutChangeEvent,
  PanResponder,
  StatusBar,
  BackHandler,
  Modal,
  Alert,
  GestureResponderEvent,
  ActivityIndicator
} from 'react-native';
import * as Calendar from 'expo-calendar';
import { MaterialIcons, Ionicons, FontAwesome } from '@expo/vector-icons';
import FallbackImage from '../common/FallbackImage';
import { VenueFavoriteButton } from '../common/VenueFavoriteButton';
import Autolink from 'react-native-autolink';

import type { Event, Venue, Cluster, TimeStatus } from '../../types/events';

// Add global tutorial manager type declarations
declare global {
  var tutorialManager: {
    getCurrentStep?: () => { id: string } | null;
    getIsActive?: () => boolean;
    getCurrentSubStep?: () => number;
  } | undefined;
}
import { addToCalendar } from '../../utils/calendarUtils';
import EventImageLightbox from './EventImageLightbox';

import * as userService from '../../services/userService';
import { useUserPrefsStore, updateSavedEvents } from '../../store/userPrefsStore';
import { useEventLikeCount, setEventLikeCount, startEventLikesListener, stopEventLikesListener } from '../../store/eventLikesStore';
import { useEventShareCount, setEventShareCount, startEventSharesListener, stopEventSharesListener } from '../../store/eventSharesStore';
import { useEventInterestedCount, setEventInterestedCount, startEventInterestedListener, stopEventInterestedListener } from '../../store/eventInterestedStore';
import { useMapStore } from '../../store/mapStore';
import { auth } from '../../config/firebaseConfig';
import { useClusterInteractionStore } from '../../store/clusterInteractionStore';

// Import the centralized date utilities
import {
  formatTime,
  formatEventDateTime,
  isEventNow,
  isEventHappeningToday,
  getEventTimeStatus,
  sortEventsByTimeStatus,
  getRelativeTimeDescription,
  combineDateAndTime
} from '../../utils/dateUtils';
import { buildGathrSharePayload } from '../../utils/shareUtils';

// Import for lazy-loading venue details
import { fetchVenueDetailsByName, VenueContactInfo } from '../../lib/api/firestoreEvents';

// Import ad components and hooks
import useNativeAds from '../../hooks/useNativeAds';
import CompactNativeAdComponent from '../ads/CompactNativeAdComponent';
import { traceMapEvent } from '../../utils/mapTrace';

const EVENT_CALLOUT_SHELL_ISOLATION_DEBUG = false;
const EVENT_CALLOUT_DISABLE_NATIVE_ADS_DEBUG = false;
const EVENT_CALLOUT_PLACEHOLDER_AD_CARD_DEBUG = false;

// ===============================================================
// PRIORITY SYSTEM IMPORTS - FIXED
// ===============================================================
import { 
  BASE_SCORES, 
  DISTANCE_BANDS, 
  ENGAGEMENT_TIERS, 
  TEMPORAL_DISTANCE_BANDS,
  calculateEngagementTier 
} from '../../utils/priorityUtils';
import { calculateDistance } from '../../store/mapStore';

// ===============================================================
// GUEST LIMITATION IMPORTS
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { InteractionType } from '../../types/guestLimitations';
import { GuestLimitedContent } from '../GuestLimitedContent';
import { LockIcon } from '../LockIcon';
import { RegistrationPrompt } from '../RegistrationPrompt';



const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type UserPrefsState = {
  savedEvents: string[];
  interests: string[];
  favoriteVenues: string[];
  likedEvents: string[];
  interestedEvents: string[];
};

// --- Local helper to derive label/start/end from the already-formatted strings ---
// Returns { label } (base without trailing " at <start>" if present), { start }, { end }, and { labelWithTime } (original base).
function partsFrom(base: string, range?: string) {
  const result = {
    label: base,
    start: undefined as string | undefined,
    end: undefined as string | undefined,
    labelWithTime: base,
  };
  if (!range) return result;

  // Detect common separators: en dash, spaced hyphen, plain hyphen, and " to "
  const rLower = range.toLowerCase();
  const sep =
    range.includes(' – ') ? ' – ' :
    range.includes('–')    ? '–'    :
    rLower.includes(' to ') ? ' to ' :
    range.includes(' - ')  ? ' - '  :
    range.includes('-')    ? '-'    :
    null;

  if (sep) {
    const [startRaw, endRaw] = range.split(sep).map(s => s?.trim());
    result.start = startRaw || undefined;
    result.end = endRaw || undefined;
  }

  // Trim trailing " at <start>" only if it matches, case-insensitively.
  if (result.start) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tailRe = new RegExp(`\\s+at\\s+${esc(result.start)}$`, 'i');
    if (tailRe.test(base)) {
      result.label = base.replace(tailRe, '');
    }
  }
  return result;
}

function getEventStartDateSortKey(event: Event): number {
  const dateValue = String(event?.startDate || '').trim();
  if (!dateValue) return 0;
  const parsed = Date.parse(`${dateValue}T00:00:00`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPreferredVenueProfileImage(events: Event[]): string {
  const candidates = (events || [])
    .map((event) => ({
      url: String(event?.profileUrl || '').trim(),
      dateSortKey: getEventStartDateSortKey(event),
    }))
    .filter((item) => Boolean(item.url))
    .sort((a, b) => b.dateSortKey - a.dateSortKey);

  return candidates[0]?.url || '';
}


// Is the given YYYY-MM-DD strictly in the future (date-only)?
function isFutureDate(dateStr?: string) {
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return !isNaN(d.getTime()) && d.getTime() > today.getTime();
}

// Format like "Aug 22" (and add year if different from this year)
function formatEndDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  let label = d.toLocaleDateString(undefined, opts);
  if (d.getFullYear() !== now.getFullYear()) label += `, ${d.getFullYear()}`;
  return label;
}


const CALLOUT_NORMAL_HEIGHT = 440; // Increased to accommodate venue selector in all cases
const CALLOUT_MIN_HEIGHT = 300;
const CALLOUT_MAX_HEIGHT = SCREEN_HEIGHT - 100; // Nearly full screen
const DRAG_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;

// Define brand colors for consistency with events tab
const BRAND = {
  primary: '#1E90FF',
  primaryDark: '#0066CC', 
  primaryLight: '#62B5FF',
  accent: '#FF3B30',
  accentDark: '#D32F2F',
  gray: '#666666',
  lightGray: '#E0E0E0',
  background: '#F5F8FF',
  white: '#FFFFFF',
  text: '#333333',
  textLight: '#777777'
};


// Helper function to get color for event category - Updated to use BRAND colors
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return BRAND.primary;
    case 'comedy show': return BRAND.primary;
    case 'cabaret': return BRAND.primary;
    case 'sports': return BRAND.primary;
    case 'meeting': return BRAND.primary;
    case 'family friendly': return BRAND.primary;
    case 'social gatherings & parties': return BRAND.primary;
    case 'drink special': return BRAND.primary;
    case 'food special': return BRAND.primary;
    case 'happy hour': return BRAND.primary;
    default: return BRAND.primary; // Default to primary blue for consistency
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

// Helper function to validate a ticket URL
const isValidTicketUrl = (url?: string): boolean => {
  return Boolean(url && url !== "N/A" && url !== "" && url.includes("http"));
};

// Helper function to check if an event is paid - UPDATED to handle "Ticketed Event" text
const isPaidEvent = (price?: string): boolean => {
  // If price is exactly "Ticketed Event", consider it a paid event
  if (price === "Ticketed Event") {
    return true; 
  }
  
  return Boolean(
    price && 
    price !== "N/A" && 
    price !== "0" && 
    !price.toLowerCase().includes("free")
  );
};

// Define types for badge props
interface BadgeContainerProps {
  isNow: boolean;
  matchesUserInterests: boolean;
  isSaved: boolean;
}

// Badge Container component for horizontal badge layout
// with smart display logic for multiple badges
const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
  isNow, 
  matchesUserInterests, 
  isSaved 
}) => {
  // If no badges to show, return null
  if (!isNow && !matchesUserInterests && !isSaved) return null;
  
  // Determine how many badges are active for smart display logic
  const activeCount = (isNow ? 1 : 0) + (matchesUserInterests ? 1 : 0) + (isSaved ? 1 : 0);
  const multipleActive = activeCount > 1;
  
  return (
    <View style={badgeStyles.badgeContainer}>
      {/* NOW Badge - Always show with text due to importance */}
      {isNow && (
        <View style={[badgeStyles.nowBadge, multipleActive && badgeStyles.compactBadge]}>
          <Text style={badgeStyles.nowBadgeText}>NOW</Text>
        </View>
      )}
      
      {/* For You Badge - Condensed to just icon when multiple badges */}
      {matchesUserInterests && (
        <View style={[
          badgeStyles.forYouBadge, 
          multipleActive && badgeStyles.compactBadge,
          // Adjust padding when showing just the icon
          (multipleActive) && badgeStyles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="thumb-up" 
            size={12} 
            color="#FFFFFF" 
          />
          {/* Only show text if single badge or if NOW is not present */}
          {(!multipleActive || (!isNow && activeCount === 2)) && (
            <Text style={badgeStyles.badgeText}>For You</Text>
          )}
        </View>
      )}
      
      {/* Saved Badge - Condensed to just icon when multiple badges */}
      {isSaved && (
        <View style={[
          badgeStyles.savedBadge, 
          multipleActive && badgeStyles.compactBadge,
          // Adjust padding when showing just the icon
          multipleActive && badgeStyles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="star" 
            size={12} 
            color={multipleActive ? "#FFFFFF" : "#000000"} 
          />
          {/* Only show text when it's the only badge */}
          {!multipleActive && (
            <Text style={badgeStyles.savedBadgeText}>Saved</Text>
          )}
        </View>
      )}
    </View>
  );
};

// ===============================================================
// TEMPORAL PENALTY HELPER FUNCTIONS - ADDED
// ===============================================================
// Function to calculate days from now
const getDaysFromNow = (eventDate: string): number => {
  const now = new Date();
  const event = new Date(eventDate);
  
  // Use date-only comparison to avoid time-of-day issues
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDateOnly = new Date(event.getFullYear(), event.getMonth(), event.getDate());
  
  const diffTime = eventDateOnly.getTime() - nowDateOnly.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays); // Never negative
};

// Function to get temporal multiplier (only applies to FUTURE events)
const getTemporalMultiplier = (eventDate: string, timeStatus: string): number => {
  // Only apply temporal penalty to FUTURE events
  if (timeStatus !== 'future') return 1.0;
  
  const daysFromNow = getDaysFromNow(eventDate);
  
  for (const band of TEMPORAL_DISTANCE_BANDS) {
    if (daysFromNow <= band.maxDays) {
      return band.multiplier;
    }
  }
  
  return 0.5; // Default fallback
};

// ===============================================================
// FIXED PRIORITY SORTING FUNCTION
// ===============================================================
// Function to sort and prioritize events - UPDATED with proper priority system
const sortAndPrioritizeCalloutEvents = (
  events: Event[], 
  savedEvents: string[], 
  userInterests: string[] = [],
  userLocation?: { coords: { latitude: number; longitude: number } } | null
): Event[] => {
  // Create a copy of events with priority scores added using the proper system
  const eventsWithScores = events.map(event => {
    // Check saved status
    const isSaved = savedEvents.includes(event.id.toString());
    
    // Get time status
    const timeStatus = getEventTimeStatus(event);
    
    // Check for interest match
    const matchesInterest = userInterests.some(interest => 
      interest.toLowerCase() === event.category.toLowerCase()
    );
    
    // Calculate base score using the proper BASE_SCORES system
    const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
    const baseScore = BASE_SCORES[scoreCategory][timeStatus];
    
    // Calculate proximity multiplier and actual distance for tie-breaking
    let proximityMultiplier = 1.0; // Default if no location available
    let distance = Infinity; // Default distance if location not available
    
    if (userLocation) {
      distance = calculateDistance(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        event.latitude,
        event.longitude
      );
      
      // Find the appropriate distance band
      for (const band of DISTANCE_BANDS) {
        if (distance <= band.maxDistance) {
          proximityMultiplier = band.multiplier;
          break;
        }
      }
    }
    
    // Calculate engagement tier score
    const engagementTierPoints = calculateEngagementTier(event);
    
    // NEW: Calculate temporal multiplier
    const temporalMultiplier = getTemporalMultiplier(event.startDate, timeStatus);
    
    // Calculate composite score WITH TEMPORAL PENALTY
    const compositeScore = (baseScore * proximityMultiplier * temporalMultiplier) + engagementTierPoints;
    
    // DEBUG: Log scoring details for troubleshooting
    //console.log(`[EventCallout Scoring] ${event.title}:`, {
    //  timeStatus,
    //  startDate: event.startDate, // NEW: Show raw date data
    //  daysFromNow: getDaysFromNow(event.startDate),
    ////  baseScore,
    //  temporalMultiplier,
    //  engagementTierPoints,
    //  compositeScore: Math.round(compositeScore * 100) / 100
   // });
    
    return {
      ...event,
      scoreData: {
        isSaved,
        timeStatus,
        baseScore,
        proximityMultiplier,
        temporalMultiplier, // NEW: Include temporal multiplier for debugging
        engagementTierPoints,
        compositeScore,
        matchesInterest,
        distance,
        daysFromNow: getDaysFromNow(event.startDate) // NEW: Include days from now for debugging
      }
    };
  });
  
  // Group saved events by time category
  const savedNowEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'now'
  );
  
  const savedTodayEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'today'
  );
  
  const savedFutureEvents = eventsWithScores.filter(item => 
    item.scoreData.isSaved && item.scoreData.timeStatus === 'future'
  );
  
  // Unsaved events
  const unsavedEvents = eventsWithScores.filter(item => !item.scoreData.isSaved);
  
  // Sort each group by composite score WITH SECONDARY SORT BY DISTANCE when scores are tied
  const sortGroup = (group: typeof eventsWithScores) => {
    return group.sort((a, b) => {
      // Primary sort by composite score
      if (b.scoreData.compositeScore !== a.scoreData.compositeScore) {
        return b.scoreData.compositeScore - a.scoreData.compositeScore;
      }
      // Secondary sort by distance when scores are tied
      return a.scoreData.distance - b.scoreData.distance;
    });
  };
  
  sortGroup(savedNowEvents);
  sortGroup(savedTodayEvents);
  sortGroup(savedFutureEvents);
  sortGroup(unsavedEvents);
  
  // Combine all groups in the correct order and return just the events (without scoreData)
  const finalSortedEvents = [
    ...savedNowEvents.map(item => {
      const { scoreData, ...event } = item;
      return event;
    }),
    ...savedTodayEvents.map(item => {
      const { scoreData, ...event } = item;
      return event;
    }),
    ...savedFutureEvents.map(item => {
      const { scoreData, ...event } = item;
      return event;
    }),
    ...unsavedEvents.map(item => {
      const { scoreData, ...event } = item;
      return event;
    })
  ];
  
  // DEBUG: Log the final sorted order
  console.log('[Final Sort Order]', finalSortedEvents.map(e => `${e.title}: ${e.id} (score: ${eventsWithScores.find(item => item.id === e.id)?.scoreData?.compositeScore || 'unknown'})`));
  
  return finalSortedEvents;
};

// Define a type for the mixed content items (event or ad)
type ContentItem = {
  type: 'event' | 'ad';
  data: Event | {
    ad: any;
    loading: boolean;
  };
};

// Helper function to mix content items with ads
const mixContentWithAds = (
  contentItems: Event[], 
  ads: {ad: any; loading: boolean}[], 
  isMinimalContent: boolean
): ContentItem[] => {
  if (contentItems.length === 0) return [];
  
  // For minimal content (1 event or 1 special or 1 of each)
  if (isMinimalContent) {
    // Convert all content items to ContentItem format
    const result: ContentItem[] = contentItems.map(item => ({
      type: 'event',
      data: item
    }));
    
    // Append one ad if available
    if (ads.length > 0) {
      result.push({
        type: 'ad',
        data: ads[0]
      });
    }
    
    return result;
  }
  
  // For multiple items (insert an ad after every second item)
  const result: ContentItem[] = [];
  let adIndex = 0;
  
  contentItems.forEach((item, index) => {
    // Add the content item
    result.push({
      type: 'event',
      data: item
    });
    
    // After every second item, add an ad (cycle through available ads)
    if ((index + 1) % 2 === 0 && ads.length > 0) {
      result.push({
        type: 'ad',
        data: ads[adIndex % ads.length] // Cycle through ads when we run out
      });
      adIndex++;
    }
  });
  
  return result;
};

// Pulsing effect component for "now" events in the callout
interface PulsingEffectProps {
  color: string;
}

const PulsingEffect: React.FC<PulsingEffectProps> = ({ color }) => {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Create pulsing animation
    const pulseAnimation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 500,
        useNativeDriver: true
      }),
      Animated.timing(opacity, {
        toValue: 0.5,
        duration: 500,
        useNativeDriver: true
      })
    ]);

    // Loop the animation
    Animated.loop(pulseAnimation).start();

    return () => {
      // Clean up animation
      opacity.stopAnimation();
    };
  }, []);

  return (
    <Animated.View 
      style={[
        styles.pulsingEffect,
        { 
          backgroundColor: color,
          opacity: opacity
        }
      ]} 
    />
  );
};

// Animated "New Content" Indicator Dot
interface IndicatorDotProps {
  hasNewContent: boolean;
  style?: any;
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

// Venue Selector Component - Modified to work with single venue
interface VenueSelectorProps {
  venues: Venue[];
  activeVenueIndex: number;
  onSelectVenue: (index: number) => void;
  onScroll?: (event: NativeSyntheticEvent<any>) => void;
  venueHasNewContent: (venue: Venue) => boolean;
  favoriteVenues: string[];
  isGuest: boolean;
}

const VenueSelector: React.FC<VenueSelectorProps> = ({
  venues,
  activeVenueIndex,
  onSelectVenue,
  onScroll,
  venueHasNewContent,
  favoriteVenues,
  isGuest
}) => {
  // LOG: VenueSelector rendering - tracks venues count and active index for debugging selector state
  // console.log("VenueSelector rendering with venues:", venues.length, 
  //            "activeIndex:", activeVenueIndex);
  
  return (
    <View style={styles.venueSelectorWrapper}>
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.venueSelectorContainer,
          venues.length <= 1 && styles.singleVenueSelectorContainer
        ]}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {venues.map((venue, index) => {
          const events = venue.events.filter(event => event.type === 'event');
          const specials = venue.events.filter(event => event.type === 'special');
          const profileImage = getPreferredVenueProfileImage(venue.events);
          
          // LOG: Venue option details - shows venue data for debugging venue selector options
          // console.log(`Venue option ${index}: ${venue.venue}, events: ${events.length}, specials: ${specials.length}, hasImage: ${!!profileImage}`);
          
          return (
            <TouchableOpacity 
              key={`venue-${venue.locationKey}-${index}`}
              style={[
                styles.venueOption,
                activeVenueIndex === index && styles.venueOptionActive,
                venues.length <= 1 && styles.singleVenueOption
              ]}
              onPress={() => onSelectVenue(index)}
              activeOpacity={0.7}
            >
            <View style={styles.venueTopContent}>
  {/* NOW indicator - positioned in top-right corner of the card */}
  {venue.events.some(event => isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)) && (
    <View style={styles.venueNowIndicator}>
      <Text style={styles.venueNowText}>NOW</Text>
    </View>
  )}

  <View style={styles.venueImageContainer}>
    {profileImage !== undefined ? (
      <FallbackImage
        imageUrl={profileImage}
        category=""
        type={venue.events.find(e => e.type === 'event') ? 'event' : 'special'}
        style={styles.venueProfileImage}
        fallbackType="profile"
      />
    ) : (
      <FallbackImage
        imageUrl=""
        category=""
        type={venue.events.find(e => e.type === 'event') ? 'event' : 'special'}
        style={styles.venueProfileImage}
        fallbackType="profile"
      />
    )}

    {/* Favorite venue button - positioned in top-right corner */}
    <View style={styles.venueFavoriteButtonContainer}>
      <VenueFavoriteButton
        locationKey={venue.locationKey}
        venueName={venue.venue}
        size={14}
        source="map_callout"
        style={styles.venueFavoriteButton}
      />
    </View>

    {/* New content indicator - animated red dot */}
    {(() => {
      const hasNew = venueHasNewContent(venue);
      console.log(`[VenueNewContent] ${venue.venue}: ${hasNew}`);
      return (
        <IndicatorDot
          hasNewContent={hasNew}
          style={styles.venueNewContentDot}
        />
      );
    })()}
  </View>

  <Text
    style={[
      styles.venueOptionName,
      activeVenueIndex === index && styles.venueOptionNameActive
    ]}
    numberOfLines={1}
    adjustsFontSizeToFit={true}
  >
    {venue.venue}
  </Text>
</View>

<View style={styles.venueItemCounts}>
                {events.length > 0 && (
                  <View style={styles.countContainer}>
                    <Text style={styles.countText}>{events.length}</Text>
                    <MaterialIcons name="event" size={14} color="#666666" />
                  </View>
                )}
                
                {specials.length > 0 && (
                  <View style={styles.countContainer}>
                    <Text style={styles.countText}>{specials.length}</Text>
                    <MaterialIcons name="restaurant" size={14} color="#666666" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// Enhanced Tab component for the callout
type TabType = 'events' | 'specials' | 'venue';

interface EventTabsProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  eventCount: number;
  specialCount: number;
  venueCount: number;
}

const EventTabs: React.FC<EventTabsProps> = ({ 
  activeTab, 
  onChangeTab, 
  eventCount, 
  specialCount, 
  venueCount 
}) => {
  return (
    <View style={styles.tabContainer}>
      {eventCount > 0 && (
        <TouchableOpacity 
          style={[
            styles.tabPill, 
            activeTab === 'events' && styles.activeTabPill
          ]} 
          onPress={() => onChangeTab('events')}
          activeOpacity={0.7}
        >
          <MaterialIcons 
            name="event" 
            size={16} 
            color={activeTab === 'events' ? '#FFFFFF' : '#666666'} 
            style={styles.tabIcon}
          />
          <Text style={[
            styles.tabPillText, 
            activeTab === 'events' && styles.activeTabPillText
          ]}>
            Events ({eventCount})
          </Text>
        </TouchableOpacity>
      )}
      
      {specialCount > 0 && (
        <TouchableOpacity 
          style={[
            styles.tabPill, 
            activeTab === 'specials' && styles.activeTabPill
          ]} 
          onPress={() => onChangeTab('specials')}
          activeOpacity={0.7}
        >
          <MaterialIcons 
            name="restaurant" 
            size={16} 
            color={activeTab === 'specials' ? '#FFFFFF' : '#666666'} 
            style={styles.tabIcon}
          />
          <Text style={[
            styles.tabPillText, 
            activeTab === 'specials' && styles.activeTabPillText
          ]}>
            Specials ({specialCount})
          </Text>
        </TouchableOpacity>
      )}
      
      <TouchableOpacity 
        style={[
          styles.tabPill, 
          activeTab === 'venue' && styles.activeTabPill
        ]} 
        onPress={() => onChangeTab('venue')}
        activeOpacity={0.7}
      >
        <MaterialIcons 
          name="place" 
          size={16} 
          color={activeTab === 'venue' ? '#FFFFFF' : '#666666'} 
          style={styles.tabIcon}
        />
        <Text style={[
          styles.tabPillText, 
          activeTab === 'venue' && styles.activeTabPillText
        ]}>
          Venue Info
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// Component for event actions
interface EventActionsProps {
  event: Event;
}

const EventActions: React.FC<EventActionsProps> = ({ event }) => {
  // DEBUG: Log what data this component receives
  console.log('EVENT ACTIONS: Event', event.id, 'ticket data:', {
    ticketLinkPosts: event.ticketLinkPosts,
    ticketLinkEvents: event.ticketLinkEvents,
    hasValidTicketLink: isValidTicketUrl(event.ticketLinkEvents) || isValidTicketUrl(event.ticketLinkPosts)
  });

  const addEventToCalendar = async () => {
    try {
      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });
    } catch (error) {
      console.error('Failed to add event to calendar', error);
    }
  };
  
const shareEvent = async () => {
  try {
    const sharePayload = buildGathrSharePayload(event);
    const result = await Share.share({
      message: sharePayload.message,
      title: sharePayload.title,
      url: sharePayload.url,
    });

    // Track the tap (we can’t reliably detect success/cancel the same on iOS/Android)
    amplitudeTrack('share_tapped', {
      source: 'map_callout',
      referrer_screen: '/map',
      content_type: 'event',
      event_id: String(event.id),
      venue_name: event.venue,
      channel:
        result?.action === Share.sharedAction
          ? ('system' as const) // System share sheet
          : 'system',
    });
  } catch (error) {
    console.error('Error sharing event', error);
  }
};


  
  const buyTickets = () => {
    // Check ticketLinkEvents first, then fall back to ticketLinkPosts if needed
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Only open URL if it's a valid URL (not empty, not "N/A")
    if (isValidTicketUrl(ticketUrl)) {
      Linking.openURL(ticketUrl);
    }
  };
  
  // Check if there's a valid ticket URL
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  
  // Determine if it's a paid event vs. free event
  const paid = isPaidEvent(event.ticketPrice);
  
  return (
    <View style={styles.actionContainer}>
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={shareEvent}
        activeOpacity={0.7}
      >
        <MaterialIcons name="share" size={20} color="#444444" />
        <Text style={styles.actionText}>Share</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={addEventToCalendar}
        activeOpacity={0.7}
      >
        <MaterialIcons name="event" size={20} color="#444444" />
        <Text style={styles.actionText}>Add to Calendar</Text>
      </TouchableOpacity>
      
      {hasTicketLink && (
        <TouchableOpacity 
          style={styles.ticketButton} 
          onPress={buyTickets}
          activeOpacity={0.7}
        >
          <Text style={styles.ticketButtonText}>
            {paid ? "Buy Tickets" : "Register"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

// Event card component for carousel
interface EventCardProps {
  event: Event;
  isSelected: boolean;
  onPress: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, isSelected, onPress }) => {
  const timeStatus = getEventTimeStatus(event);
  
  return (
    <TouchableOpacity 
      style={[
        styles.eventCard,
        isSelected && styles.selectedEventCard,
        timeStatus === 'now' && styles.nowEventCard
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[
        styles.cardCategoryIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      {timeStatus === 'now' && (
        <View style={styles.nowIndicator}>
          <Text style={styles.nowIndicatorText}>NOW</Text>
        </View>
      )}
      
      <Text style={styles.cardTitle} numberOfLines={1}>
        {event.title}
      </Text>
      
      <Text style={styles.cardDateTime}>
        {formatEventDateTime(event.startDate, event.startTime, event)}
      </Text>
      
      <GuestLimitedContent 
        contentType="description" 
        fullText={event.description}
        maxLength={100}
      >
        <Text style={styles.cardDescription} numberOfLines={2}>
          {event.description}
        </Text>
      </GuestLimitedContent>
    </TouchableOpacity>
  );
};

// Event details tab content
interface EventDetailsProps {
  event: Event;
  onImagePress: (imageUrl: string, event: Event) => void;
}

const EventDetailsContent: React.FC<EventDetailsProps> = ({ event, onImagePress }) => {
  const [expanded, setExpanded] = useState(false);
  const needsReadMore = event.description.length > 120;
  const timeStatus = getEventTimeStatus(event);
  
  return (
    <View style={styles.detailsContainer}>
      {timeStatus === 'now' && (
  <View style={styles.nowBanner}>
    <PulsingEffect color={getTimeStatusColor('now')} />
    <Text style={styles.nowBannerText}>HAPPENING NOW</Text>
  </View>
)}


      
      {event.imageUrl && (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onImagePress(event.imageUrl, event)}
        >
          <FallbackImage 
            imageUrl={event.imageUrl}
            category={event.category}
            type={event.type}
            style={styles.eventImage}
            fallbackType="post"
          />
        </TouchableOpacity>
      )}
      
      <Text style={styles.eventTitle}>{event.title}</Text>
      
      <View style={styles.eventMetaContainer}>
        <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(event.category) }]}>
          <Text style={styles.categoryText}>{event.category}</Text>
        </View>
        
        <View style={styles.timeContainer}>
          <MaterialIcons name="access-time" size={16} color="#666666" />
          <Text style={styles.eventTime}>
            {formatEventDateTime(event.startDate, event.startTime, event)}
          </Text>
        </View>
      </View>
      
      {event.ticketPrice && event.ticketPrice !== 'N/A' && (
        <View style={styles.priceContainer}>
          <MaterialIcons name="local-offer" size={16} color="#E94E77" />
          <Text style={styles.ticketPrice}>{event.ticketPrice}</Text>
        </View>
      )}
      
      <View style={styles.descriptionContainer}>
        <GuestLimitedContent 
          contentType="description" 
          fullText={event.description}
          maxLength={120}
        >
          <Autolink 
            text={event.description}
            style={styles.eventDescription}
            numberOfLines={expanded ? undefined : 3}
            linkStyle={styles.linkText}
            onPress={(url, match) => {
              console.log('Link pressed:', url);
              Linking.openURL(url).catch(err => {
                console.error('Failed to open URL:', err);
                Alert.alert('Error', 'Could not open link');
              });
            }}
            showAlert={true}
            alertTitle="Open Link"
            alertMessage="Do you want to open this link?"
            alertConfirmText="Open"
            alertCancelText="Cancel"
          />
        </GuestLimitedContent>
        
        {needsReadMore && (
          <TouchableOpacity 
            onPress={() => setExpanded(!expanded)}
            style={styles.expandButton}
            activeOpacity={0.7}
          >
            <Text style={styles.expandButtonText}>
              {expanded ? 'Show Less' : 'Read More'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <EventActions event={event} />
    </View>
  );
};

// Venue info tab content
interface VenueInfoProps {
  venue: Venue;
}


const VenueInfoContent: React.FC<VenueInfoProps> = ({ venue }) => {
  // State for lazy-loaded venue contact info
  const [isLoadingContact, setIsLoadingContact] = useState(true);
  const [fetchedContactInfo, setFetchedContactInfo] = useState<VenueContactInfo | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);

  // Get venue profile image using the same logic as the venue selector
  const venueProfileImage = getPreferredVenueProfileImage(venue.events);

  // Extract venue contact info from any event at this venue (cached data)
  const cachedContactInfo = useMemo(() => {
    for (const event of venue.events) {
      if (event.venueWebsite || event.venueFacebookUrl || event.venueInstagramUrl || event.venuePhone || event.venueRating) {
        return {
          website: event.venueWebsite,
          facebook: event.venueFacebookUrl,
          instagram: event.venueInstagramUrl,
          phone: event.venuePhone,
          rating: event.venueRating,
          // Note: profileImage is NOT cached from events - it comes from fetched venue details only
        };
      }
    }
    return null;
  }, [venue.events]);

  // Lazy-load venue details if we don't have full contact info
  useEffect(() => {
    const loadVenueDetails = async () => {
      // Skip if we already have complete contact info from cached data
      if (cachedContactInfo?.facebook && cachedContactInfo?.instagram && cachedContactInfo?.phone) {
        setIsLoadingContact(false);
        setHasFetched(true);
        return;
      }

      // Skip if we've already fetched
      if (hasFetched) return;

      setIsLoadingContact(true);
      try {
        const details = await fetchVenueDetailsByName(venue.venue);
        setFetchedContactInfo(details);
      } catch (error) {
        console.error('[VenueInfoContent] Error fetching venue details:', error);
      } finally {
        setIsLoadingContact(false);
        setHasFetched(true);
      }
    };

    loadVenueDetails();
  }, [venue.venue, cachedContactInfo, hasFetched]);

  // Merge cached and fetched contact info (fetched takes priority for missing fields)
  const venueContactInfo = useMemo(() => {
    if (!cachedContactInfo && !fetchedContactInfo) return null;

    return {
      website: cachedContactInfo?.website || fetchedContactInfo?.website,
      facebook: cachedContactInfo?.facebook || fetchedContactInfo?.facebook,
      instagram: cachedContactInfo?.instagram || fetchedContactInfo?.instagram,
      phone: cachedContactInfo?.phone || fetchedContactInfo?.phone,
      email: fetchedContactInfo?.email,
      rating: cachedContactInfo?.rating || fetchedContactInfo?.rating,
      profileImage: fetchedContactInfo?.profileImage,
    };
  }, [cachedContactInfo, fetchedContactInfo]);

  const hasAnyContactInfo = venueContactInfo && (
    venueContactInfo.website ||
    venueContactInfo.facebook ||
    venueContactInfo.instagram ||
    venueContactInfo.phone
  );

  // Parse address to show only street when collapsed, full address when expanded
  const { shortAddress, fullAddress } = useMemo(() => {
    // Format: "123 Main St, City, Province, Postal Code, Country"
    const addressParts = venue.address.split(',').map(part => part.trim());

    if (addressParts.length <= 1) {
      // If address has only one part, show it as is
      return { shortAddress: venue.address, fullAddress: venue.address };
    }

    // Take only the first part (street address)
    const short = addressParts[0];
    return { shortAddress: short, fullAddress: venue.address };
  }, [venue.address]);

  const handleDirections = () => {
    const destination = encodeURIComponent(`${venue.venue}, ${venue.address}`);
    const url = Platform.select({
      ios: `maps:?q=${destination}`,
      android: `geo:0,0?q=${destination}`
    });

    // Track before opening (the app may background immediately)
    try {
      const mapsApp = Platform.OS === 'ios' ? 'apple' : 'google';
      amplitudeTrack('directions_opened', {
        venue_name: venue.venue,
        address: venue.address,
        maps_app: mapsApp,
        source: 'venue_info_tab',
        referrer_screen: '/map',
      });
    } catch {}

    if (url) {
      Linking.openURL(url);
    }
  };

  const handleWebsite = () => {
    if (venueContactInfo?.website) {
      amplitudeTrack('venue_website_opened', {
        venue_name: venue.venue,
        source: 'venue_info_tab',
        referrer_screen: '/map',
      });
      Linking.openURL(venueContactInfo.website);
    }
  };

  const handleFacebook = () => {
    if (venueContactInfo?.facebook) {
      amplitudeTrack('venue_facebook_opened', {
        venue_name: venue.venue,
        source: 'venue_info_tab',
        referrer_screen: '/map',
      });
      Linking.openURL(venueContactInfo.facebook);
    }
  };

  const handleInstagram = () => {
    if (venueContactInfo?.instagram) {
      amplitudeTrack('venue_instagram_opened', {
        venue_name: venue.venue,
        source: 'venue_info_tab',
        referrer_screen: '/map',
      });
      Linking.openURL(venueContactInfo.instagram);
    }
  };

  const handleCall = () => {
    if (venueContactInfo?.phone) {
      amplitudeTrack('venue_call_initiated', {
        venue_name: venue.venue,
        source: 'venue_info_tab',
        referrer_screen: '/map',
      });
      Linking.openURL(`tel:${venueContactInfo.phone}`);
    }
  };

  const eventsByDate = venue.events.reduce((acc, event) => {
    const date = event.startDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const sortedDates = Object.keys(eventsByDate).sort((a, b) =>
    new Date(a).getTime() - new Date(b).getTime()
  );

  for (const date of sortedDates) {
    eventsByDate[date] = sortEventsByTimeStatus(eventsByDate[date]);
  }

  return (
    <View style={styles.venueInfoContainer}>
      {/* Venue Header Card */}
      <View style={styles.venueHeaderCard}>
        <View style={styles.venueHeaderContent}>
          {/* Venue Profile Picture */}
          <View style={styles.venueProfileContainer}>
            <FallbackImage
              imageUrl={venueProfileImage}
              category="Venue"
              type="event"
              style={styles.venueProfilePicture}
              fallbackType="profile"
              resizeMode="cover"
            />
          </View>

          {/* Venue Text Content */}
          <View style={styles.venueTextContent}>
            <Text style={styles.venueName}>{venue.venue}</Text>
            <TouchableOpacity
              style={styles.venueAddressRow}
              onPress={() => setIsAddressExpanded(!isAddressExpanded)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="place" size={16} color="#8E8E93" style={styles.venueAddressIcon} />
              <Text style={[styles.venueAddress, styles.venueAddressExpandable]}>
                {isAddressExpanded ? fullAddress : shortAddress}
              </Text>
              {shortAddress !== fullAddress && (
                <MaterialIcons
                  name={isAddressExpanded ? "expand-less" : "expand-more"}
                  size={18}
                  color="#007AFF"
                  style={styles.venueAddressChevron}
                />
              )}
            </TouchableOpacity>
            {venueContactInfo?.rating && (
              <View style={styles.venueRatingRow}>
                <View style={styles.venueRatingBadge}>
                  <MaterialIcons name="star" size={16} color="#FFB800" />
                  <Text style={styles.venueRatingText}>{venueContactInfo.rating.toFixed(1)}</Text>
                </View>
                <Text style={styles.venueRatingLabel}>Rating</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Quick Actions - Primary CTAs */}
      <View style={styles.venueActionsCard}>
        <View style={styles.venueActionsRow}>
          <TouchableOpacity
            style={styles.venueActionPrimary}
            onPress={handleDirections}
            activeOpacity={0.8}
          >
            <View style={styles.venueActionIconCircle}>
              <MaterialIcons name="directions" size={22} color="#FFFFFF" />
            </View>
            <Text style={styles.venueActionLabel}>Directions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.venueActionPrimary}
            onPress={() => {
              // Trigger the VenueFavoriteButton's toggle
              const btn = venue.locationKey;
            }}
            activeOpacity={0.8}
          >
            <VenueFavoriteButton
              locationKey={venue.locationKey}
              venueName={venue.venue}
              size={22}
              source="venue_info_tab"
              style={styles.venueActionFavoriteCircle}
              showLabel={false}
            />
            <Text style={styles.venueActionLabel}>Save</Text>
          </TouchableOpacity>

          {venueContactInfo?.phone && (
            <TouchableOpacity
              style={styles.venueActionPrimary}
              onPress={handleCall}
              activeOpacity={0.8}
            >
              <View style={[styles.venueActionIconCircle, styles.venueActionIconGreen]}>
                <MaterialIcons name="phone" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.venueActionLabel}>Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Connect Section - Social Links */}
      {(isLoadingContact || hasAnyContactInfo) && (
        <View style={styles.venueConnectCard}>
          <Text style={styles.venueSectionTitle}>Connect</Text>
          {isLoadingContact ? (
            <View style={styles.venueConnectLoading}>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.venueConnectLoadingText}>Loading...</Text>
            </View>
          ) : (
            <View style={styles.venueConnectGrid}>
              {venueContactInfo?.website && (
                <TouchableOpacity
                  style={styles.venueConnectButton}
                  onPress={handleWebsite}
                  activeOpacity={0.7}
                >
                  <View style={[styles.venueConnectIconBg, { backgroundColor: 'rgba(0, 122, 255, 0.1)' }]}>
                    <MaterialIcons name="language" size={20} color="#007AFF" />
                  </View>
                  <Text style={styles.venueConnectButtonText}>Website</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#C7C7CC" />
                </TouchableOpacity>
              )}

              {venueContactInfo?.facebook && (
                <TouchableOpacity
                  style={styles.venueConnectButton}
                  onPress={handleFacebook}
                  activeOpacity={0.7}
                >
                  <View style={[styles.venueConnectIconBg, { backgroundColor: 'rgba(24, 119, 242, 0.1)' }]}>
                    <FontAwesome name="facebook" size={18} color="#1877F2" />
                  </View>
                  <Text style={styles.venueConnectButtonText}>Facebook</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#C7C7CC" />
                </TouchableOpacity>
              )}

              {venueContactInfo?.instagram && (
                <TouchableOpacity
                  style={styles.venueConnectButton}
                  onPress={handleInstagram}
                  activeOpacity={0.7}
                >
                  <View style={[styles.venueConnectIconBg, { backgroundColor: 'rgba(228, 64, 95, 0.1)' }]}>
                    <FontAwesome name="instagram" size={18} color="#E4405F" />
                  </View>
                  <Text style={styles.venueConnectButtonText}>Instagram</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#C7C7CC" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Upcoming Events Section */}
      {sortedDates.length > 0 && (
        <View style={styles.venueEventsCard}>
          <Text style={styles.venueSectionTitle}>Upcoming Events</Text>

          {sortedDates.map((date, dateIndex) => (
            <View key={`date-${date}-${dateIndex}`} style={styles.venueDateSection}>
              <Text style={styles.venueDateHeader}>
                {formatEventDateTime(date, '12:00 PM').split(' at ')[0]}
              </Text>

              {eventsByDate[date].map((event, eventIndex) => {
                const timeStatus = getEventTimeStatus(event);

                return (
                  <View
                    key={`event-${event.id}-${date}-${eventIndex}`}
                    style={[
                      styles.venueEventItem,
                      timeStatus === 'now' && styles.nowVenueEventItem
                    ]}
                  >
                    {timeStatus === 'now' && (
                      <PulsingEffect color={getTimeStatusColor('now')} />
                    )}
                    <View style={[
                      styles.venueEventTimeBar,
                      { backgroundColor: getCategoryColor(event.category) }
                    ]} />
                    <View style={styles.venueEventDetails}>
                      <Text style={styles.venueEventTime}>{formatTime(event.startTime)}</Text>
                      <Text
                        style={[
                          styles.venueEventTitle,
                          timeStatus === 'now' && styles.nowVenueEventTitle
                        ]}
                        numberOfLines={1}
                      >
                        {event.title}
                      </Text>
                      {timeStatus === 'now' && (
                        <View style={styles.venueEventNowBadge}>
                          <Text style={styles.venueEventNowText}>LIVE</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

// Special card component for multiple specials
interface SpecialCardProps {
  event: Event;
  onSelectEvent?: (event: Event) => void;
  showVenueName?: boolean;
  onImagePress: (imageUrl: string, event: Event) => void;
  isSaved?: boolean;
  matchesUserInterests?: boolean;
  userInterests?: string[];
  isGuest?: boolean;
  isTutorialTarget?: boolean; // Add this new prop for the tutorial
}

const SpecialCard: React.FC<SpecialCardProps> = ({ 
  event, 
  onSelectEvent,
  showVenueName = false,
  onImagePress,
  isSaved = false,
  matchesUserInterests = false,
  userInterests = [],
  isGuest = false,
  isTutorialTarget = false, // Default to false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(isSaved);
  const [isToggling, setIsToggling] = useState(false);
  const [isHeroLikeToggling, setIsHeroLikeToggling] = useState(false);
  const timeStatus = getEventTimeStatus(event);

  // --- Start of Tutorial Logic ---
  // FIX 1: Correctly type the ref for Animated.View
  const viewRef = useRef<React.ElementRef<typeof Animated.View>>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    // Only run this logic if this card is the specific tutorial target
    if (isTutorialTarget) {
      const interval = setInterval(() => {
        // Check the global flag
        const globalFlag = (global as any).tutorialHighlightEventDetails || false;
        if (globalFlag !== isHighlighted) {
          setIsHighlighted(globalFlag);
        }
        
        // Continuously re-measure the component to fix alignment issues
        if (globalFlag && viewRef.current) {
          // Add '(as View)' to explicitly tell TypeScript that .measure exists
          (viewRef.current as View).measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
            (global as any).eventDetailsLayout = { x: pageX, y: pageY, width, height };
          });
        }
      }, 200);

      return () => clearInterval(interval);
    }
  }, [isTutorialTarget, isHighlighted]);

  useEffect(() => {
    if (isHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isHighlighted, pulseAnim]);

  const tutorialStyle = {
    // Apply a prominent border and shadow effect when highlighted
    borderWidth: 3, // Make border thicker
    borderColor: '#FF6B35', // Use vibrant orange for highlight
    shadowColor: '#FF6B35',
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 15,
    transform: [{ scale: pulseAnim }],
  };
  // --- End of Tutorial Logic ---
  
  useEffect(() => {
    setBookmarked(isSaved);
  }, [isSaved]);

  const eventMatchesUserInterests = matchesUserInterests || (
    userInterests.length > 0 && userInterests.some(interest => 
      interest.toLowerCase() === event.category.toLowerCase()
    )
  );
  
  const safeNumberToString = (value: any): string => {
    if (value === undefined || value === null) return '';
    return String(value);
  };
  
  const isGreaterThanZero = (value: any): boolean => {
    if (value === undefined || value === null) return false;
    const num = parseInt(String(value), 10);
    return !isNaN(num) && num > 0;
  };

  const eventIdString = String(event.id);
  const likedEvents = useUserPrefsStore((s: UserPrefsState) => s.likedEvents);
  const setUserPrefs = useUserPrefsStore.getState().setAll;
  const isHeroLiked = likedEvents.includes(eventIdString);
  const heroLikeLiveValue = useEventLikeCount(event.id);
  const heroLikeValueFromEvent =
    event.likes !== undefined && event.likes !== null ? Number(event.likes) : 0;
  const heroLikeValue = heroLikeLiveValue != null ? heroLikeLiveValue : heroLikeValueFromEvent;
  const heroLikeText = heroLikeValue > 0 ? safeNumberToString(heroLikeValue) : '';

  // Live share count
  const heroShareLiveValue = useEventShareCount(event.id);
  const heroShareValueFromEvent = event.shares !== undefined && event.shares !== null ? Number(event.shares) : 0;
  const heroShareValue = heroShareLiveValue != null ? heroShareLiveValue : heroShareValueFromEvent;
  const heroShareText = heroShareValue > 0 ? safeNumberToString(heroShareValue) : '';

  // Live interested count (calendar adds)
  const [isInterestedToggling, setIsInterestedToggling] = useState(false);
  const interestedEvents = useUserPrefsStore((s: UserPrefsState) => s.interestedEvents);
  const isInterested = interestedEvents.includes(eventIdString);
  const interestedLiveValue = useEventInterestedCount(event.id);
  const interestedValueFromEvent = event.interested !== undefined && event.interested !== null ? Number(event.interested) : 0;
  const interestedValue = interestedLiveValue != null ? interestedLiveValue : interestedValueFromEvent;
  const interestedText = interestedValue > 0 ? safeNumberToString(interestedValue) : '';

  const heroUsersRespondedCount = isGreaterThanZero(event.usersResponded) ? safeNumberToString(event.usersResponded) : null;
  useEffect(() => {
    if (!event.id) return;
    startEventLikesListener(event.id);
    startEventSharesListener(event.id);
    startEventInterestedListener(event.id);
    return () => {
      stopEventLikesListener(event.id);
      stopEventSharesListener(event.id);
      stopEventInterestedListener(event.id);
    };
  }, [event.id]);
  // Combine usersResponded (Facebook) with interested (GathR) for the person icon badge
  const facebookUsersResponded = isGreaterThanZero(event.usersResponded) ? Number(event.usersResponded) : 0;
  const combinedInterestedValue = facebookUsersResponded + interestedValue;
  const combinedInterestedText = combinedInterestedValue > 0 ? safeNumberToString(combinedInterestedValue) : '';

  type HeroEngagementMetric = {
    key: 'likes' | 'shares' | 'interested';
    icon: 'thumb-up' | 'share' | 'person';
    value: string;
  };
  const makeHeroMetric = (
    key: HeroEngagementMetric['key'],
    icon: HeroEngagementMetric['icon'],
    value: string
  ): HeroEngagementMetric => ({ key, icon, value });
  const heroEngagementMetrics: HeroEngagementMetric[] = [
    makeHeroMetric('likes', 'thumb-up', heroLikeText),
    makeHeroMetric('shares', 'share', heroShareText),
    makeHeroMetric('interested', 'person', combinedInterestedText),
  ];
  // Always show overlay - share button should always be visible
  const showHeroEngagementOverlay = true;

  const handleHeroLikePress = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (isGuest) {
      console.log('[GuestLimitation] Like blocked for guests');
      return;
    }

    if (isHeroLikeToggling) return;

    setIsHeroLikeToggling(true);
    const previousLikedEvents = [...likedEvents];
    const nextLikedEvents = isHeroLiked
      ? previousLikedEvents.filter((id) => id !== eventIdString)
      : [...previousLikedEvents, eventIdString];
    setUserPrefs({ likedEvents: nextLikedEvents });

    try {
      const baseLikes = heroLikeValueFromEvent;
      const result = await userService.toggleEventLike(event.id, {
        type: event.type,
        source: 'map_callout',
        referrer: '/map',
        venue: event?.venue,
        category: event?.category,
        baseLikes,
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to update like');
      }

      const nextCount =
        typeof result.count === 'number'
          ? result.count
          : Math.max(0, heroLikeValue + (result.liked ? 1 : -1));
      setEventLikeCount(event.id, nextCount);
    } catch (error) {
      setUserPrefs({ likedEvents: previousLikedEvents });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update like';
      console.error('Error toggling like (callout):', error);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsHeroLikeToggling(false);
    }
  };

  const handleInterestedPress = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (isGuest) {
      console.log('[GuestLimitation] Interested blocked for guests');
      return;
    }

    if (isInterestedToggling) return;

    setIsInterestedToggling(true);
    const previousInterestedEvents = [...interestedEvents];
    const nextInterestedEvents = isInterested
      ? previousInterestedEvents.filter((id) => id !== eventIdString)
      : [...previousInterestedEvents, eventIdString];
    setUserPrefs({ interestedEvents: nextInterestedEvents });

    try {
      const baseInterested = interestedValueFromEvent;
      const result = await userService.toggleEventInterested(event.id, {
        type: event.type,
        source: 'map_callout',
        referrer: '/map',
        venue: event?.venue,
        category: event?.category,
        baseInterested,
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to update interested');
      }

      const nextCount =
        typeof result.count === 'number'
          ? result.count
          : Math.max(0, interestedValue + (result.interested ? 1 : -1));
      setEventInterestedCount(event.id, nextCount);

      // If marking interested (not unmarking), also open calendar
      if (result.interested) {
        await addToCalendar({
          title: event.title,
          startDate: combineDateAndTime(event.startDate, event.startTime),
          endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
          location: `${event.venue}, ${event.address}`,
          notes: event.description
        });
      }
    } catch (error) {
      setUserPrefs({ interestedEvents: previousInterestedEvents });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update interested';
      console.error('Error toggling interested (callout):', error);
    } finally {
      setIsInterestedToggling(false);
    }
  };

  const handleAddToCalendar = async (e: any) => {
    e.stopPropagation();
    if (isGuest) return;

    // If not already interested, mark as interested (which will also add to calendar)
    if (!isInterested) {
      await handleInterestedPress(e);
      return;
    }

    // Already interested, just add to calendar again
    try {
      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });
    } catch (error) {
      console.error('Failed to add event to calendar', error);
    }
  };
  
const handleShare = async (e: any) => {
  e.stopPropagation();
  if (isGuest) return;

  // Log BEFORE opening the system share sheet
  try {
    amplitudeTrack('share_tapped', {
      event_id: String(event.id),
      content_type: event.type === 'special' ? 'special' : 'event',
      source: 'map_callout',
      referrer_screen: '/map',
      channel: 'system',
    });
  } catch {}

  try {
    const sharePayload = buildGathrSharePayload(event);

    const shareResult = await Share.share({
      message: sharePayload.message,
      title: sharePayload.title,
      url: sharePayload.url, // iOS only - shows as link preview
    });

    // Only increment count if user actually shared (not cancelled)
    if (shareResult.action === Share.sharedAction) {
      const baseShares = heroShareValueFromEvent;
      const incrementResult = await userService.incrementEventShare(event.id, {
        type: event.type === 'special' ? 'special' : 'event',
        source: 'map_callout',
        referrer: '/map',
        venue: event?.venue,
        category: event?.category,
        baseShares,
      });

      if (incrementResult.success) {
        setEventShareCount(event.id, incrementResult.count);
      }
    }
  } catch (error) {
    console.error('Error sharing event', error);
  }
};

  
  const handleTickets = (e: any) => {
    e.stopPropagation();
    if (isGuest) return;
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    if (isValidTicketUrl(ticketUrl)) {
      Linking.openURL(ticketUrl);
    }
  };
  
const toggleBookmark = async (e: any) => {
  e.stopPropagation();
  if (isGuest || isToggling) return;

  try {
    setIsToggling(true);

    // Use centralized service for persistence + Amplitude
const res = await toggleSavedEventSvc(String(event.id), {
      type: event.type === 'special' ? 'special' : 'event',
      source: 'map_callout',
      referrer: '/map',
      venue: event?.venue,
      category: event?.category,
    }, {
      id: event.id,
      title: event.title,
      venue: event.venue,
      address: event.address,
      startDate: event.startDate,
      startTime: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
    });


if (!res?.success || !('saved' in res)) {
  console.error('Error toggling saved event (service):', res?.message);
  Alert.alert('Error', res?.message || 'Failed to update saved event');
  return;
}

const savedNow = !!res.saved;

// Keep local UI/store in sync with the result
const idStr = String(event.id);
const current = useUserPrefsStore.getState().savedEvents || [];
const next = savedNow
  ? Array.from(new Set([...current, idStr]))
  : current.filter(id => id !== idStr);

setBookmarked(savedNow);
useUserPrefsStore.getState().setAll({ savedEvents: next });

  } catch (error) {
    console.error('Error toggling saved event:', error);
    Alert.alert('Error', 'Failed to update saved event');
  } finally {
    setIsToggling(false);
  }
};

  
  const getCategoryTag = () => {
    if (event.category.toLowerCase() === 'drink special') return 'Drink Special';
    if (event.category.toLowerCase() === 'food special') return 'Food Special';
    if (event.category.toLowerCase() === 'live music') return 'Live Music';
    if (event.category.toLowerCase() === 'happy hour') return 'Happy Hour';
    return event.category;
  };
  
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || isValidTicketUrl(event.ticketLinkPosts);
  const paid = isPaidEvent(event.ticketPrice);
  
  return (
    <Animated.View
      ref={viewRef}
      style={[
        styles.specialCard,
        timeStatus === 'now' && styles.nowSpecialCard,
        eventMatchesUserInterests && styles.interestMatchCard,
        isSaved && styles.savedCard,
        isHighlighted && tutorialStyle, // Apply tutorial style when highlighted
        isHighlighted && { zIndex: 99999 } // Lift the card above the tutorial overlay
      ]}
    >
      <View style={[
        styles.cardIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      <View style={styles.heroImageSection}>
        <View style={styles.heroImageContainer}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => onImagePress(event.imageUrl || event.profileUrl, event)}
          >
            <FallbackImage 
              imageUrl={event.imageUrl || event.profileUrl}
              category={event.category}
              type={event.type}
              style={styles.heroImage}
              fallbackType={event.imageUrl ? 'post' : 'profile'}
              resizeMode="cover"
            />
            
            <BadgeContainer 
              isNow={timeStatus === 'now'}
              matchesUserInterests={eventMatchesUserInterests}
              isSaved={isSaved}
            />
            
            {showHeroEngagementOverlay && (
              <View style={styles.heroEngagementOverlay} pointerEvents="box-none">
                {heroEngagementMetrics.map((metric, index) => {
                  const isLikeMetric = metric.key === 'likes';
                  const isShareMetric = metric.key === 'shares';
                  const isInterestedMetric = metric.key === 'interested';
                  const badgeStyles = [
                    styles.heroEngagementBadge,
                    index > 0 && styles.heroEngagementBadgeSpacing,
                    isLikeMetric && isHeroLiked && styles.heroEngagementBadgeLiked,
                    isInterestedMetric && isInterested && styles.heroEngagementBadgeInterested,
                  ];
                  const iconColor =
                    (isLikeMetric && isHeroLiked) ? BRAND.primaryDark :
                    (isInterestedMetric && isInterested) ? '#34A853' :
                    '#333333';
                  const badgeContent = (
                    <>
                      <MaterialIcons name={metric.icon} size={14} color={iconColor} />
                      {metric.value ? (
                        <Text style={styles.heroEngagementBadgeText}>{metric.value}</Text>
                      ) : null}
                    </>
                  );

                  if (isLikeMetric) {
                    return (
                      <TouchableOpacity
                        key={metric.key}
                        style={badgeStyles}
                        onPress={handleHeroLikePress}
                        disabled={isHeroLikeToggling || isGuest}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {badgeContent}
                      </TouchableOpacity>
                    );
                  }

                  if (isShareMetric) {
                    return (
                      <TouchableOpacity
                        key={metric.key}
                        style={badgeStyles}
                        onPress={handleShare}
                        disabled={isGuest}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {badgeContent}
                      </TouchableOpacity>
                    );
                  }

                  if (isInterestedMetric) {
                    return (
                      <TouchableOpacity
                        key={metric.key}
                        style={badgeStyles}
                        onPress={handleInterestedPress}
                        disabled={isInterestedToggling || isGuest}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {badgeContent}
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <View key={metric.key} style={badgeStyles}>
                      {badgeContent}
                    </View>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.contentSection}>
        <Text 
          style={styles.cardTitle} 
          numberOfLines={2}
          adjustsFontSizeToFit={false}
        >
          {event.title}
        </Text>
        
        {showVenueName && (
          <Text style={styles.venueNameText}>{event.venue}</Text>
        )}
        
        <View style={styles.dateTimeRow}>
          <MaterialIcons name="access-time" size={14} color="#666666" />
          {(() => {
            const base = formatEventDateTime(event.startDate, event.startTime, event);
            const timeStatus = getEventTimeStatus(event);

            const startRaw = event?.startTime;
            const endRaw   = event?.endTime;

            const start = startRaw && startRaw !== 'N/A' ? formatTime(startRaw) : null;
            const end   = endRaw   && endRaw   !== 'N/A' ? formatTime(endRaw)   : null;

            const range =
              start && end ? `${start} – ${end}` :
              start        ? `${start} – late`  :
              end          ? `until ${end}`     :
                            '';

            const rangeOrUndefined = range && range.trim() ? range : undefined;
            const { label, start: s, end: e, labelWithTime } = partsFrom(base, rangeOrUndefined);
            const showRange = (timeStatus === 'now' || timeStatus === 'today' || timeStatus === 'future') && !!rangeOrUndefined;

            const suffix = showRange ? ` • ${s}${e ? ` – ${e}` : ''}` : '';
            const endDateSuffix =
              showRange && isFutureDate(event.endDate) ? ` • (Until ${formatEndDateLabel(event.endDate!)})` : '';

const display = showRange ? `${label}${suffix}${endDateSuffix}` : labelWithTime;

return (
  <Text
    style={styles.dateTimeText}
    numberOfLines={1}
    adjustsFontSizeToFit={true}
    minimumFontScale={0.7}
  >
    {display}
  </Text>
);

          })()}
        </View>



        
      </View>
      
      <View style={styles.descriptionSection}>
        <GuestLimitedContent 
          contentType="description" 
          fullText={event.description}
          maxLength={80}
        >
          <Autolink 
            text={event.description}
            style={styles.cardDescription}
            numberOfLines={expanded ? undefined : 2}
            linkStyle={styles.linkText}
            onPress={(url, match) => { Linking.openURL(url).catch(err => console.error('Failed to open URL:', err)); }}
            showAlert={true}
          />
        </GuestLimitedContent>
        
        {event.description && event.description.length > 80 && (
          <TouchableOpacity 
            onPress={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            style={styles.readMoreButton}
          >
            <Text style={styles.readMoreText}>{expanded ? "Show less" : "Read more"}</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.cardBottomRow}>
        <View style={styles.leftSection}>
          <View style={[ styles.categoryButton2, { backgroundColor: getCategoryColor(event.category) } ]}>
            <Text style={styles.categoryText}>{getCategoryTag()}</Text>
          </View>
          
          {hasTicketLink && !paid && !event.ticketPrice && (
            <View style={styles.ticketedEventBadge}><Text style={styles.ticketedEventText}>Ticketed Event</Text></View>
          )}
          
          {event.ticketPrice && event.ticketPrice !== 'N/A' && event.ticketPrice !== "0" && event.ticketPrice !== "Ticketed Event" && !(event.ticketPrice.toLowerCase() === "free" && hasTicketLink && !paid) && (
            <View style={styles.priceTag}><Text style={styles.priceText}>{event.ticketPrice}</Text></View>
          )}
          
          {hasTicketLink && paid && (
            <TouchableOpacity style={[ styles.buyTicketsButton, isGuest && styles.disabledPremiumButton ]} onPress={handleTickets} activeOpacity={isGuest ? 1 : 0.7} disabled={isGuest}>
              <View style={styles.premiumButtonContent}>
                <Text style={[ styles.buyTicketsText, isGuest && styles.disabledPremiumButtonText ]}>Buy Tickets</Text>
                {isGuest && <MaterialIcons name="lock" size={12} color="#FFFFFF" />}
              </View>
            </TouchableOpacity>
          )}

          {hasTicketLink && !paid && event.ticketPrice && (
            <TouchableOpacity style={[ styles.registerButton, isGuest && styles.disabledPremiumButton ]} onPress={handleTickets} activeOpacity={isGuest ? 1 : 0.7} disabled={isGuest}>
              <View style={styles.premiumButtonContent}>
                <Text style={[ styles.registerButtonText, isGuest && styles.disabledPremiumButtonText ]}>Register</Text>
                {isGuest && <MaterialIcons name="lock" size={12} color="#FFFFFF" />}
              </View>
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.rightSection}>
          <TouchableOpacity style={[ styles.quickActionButton, isGuest && styles.disabledActionButton ]} onPress={handleAddToCalendar} activeOpacity={isGuest ? 1 : 0.7} disabled={isGuest}>
            <View style={styles.actionButtonCircle}>
              <MaterialIcons name="event" size={22} color={isGuest ? "#CCCCCC" : "#666666"} />
              {isGuest && <View style={styles.lockIconOverlay}><MaterialIcons name="lock" size={8} color="#333333" /></View>}
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity style={[ styles.quickActionButton, isGuest && styles.disabledActionButton ]} onPress={toggleBookmark} activeOpacity={isGuest ? 1 : 0.7} disabled={isGuest || isToggling}>
            <View style={styles.actionButtonCircle}>
              <MaterialIcons name={bookmarked ? "star" : "star-outline"} size={22} color={isGuest ? "#CCCCCC" : bookmarked ? "#FFD700" : "#666666"} />
              {isGuest && <View style={styles.lockIconOverlay}><MaterialIcons name="lock" size={8} color="#333333" /></View>}
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
};

// NEW: Memoized wrapper to prevent unnecessary re-renders of SpecialCard
const MemoSpecialCard = React.memo(SpecialCard, (prev, next) => {
  return prev.event.id === next.event.id &&
    prev.event.ticketLinkPosts === next.event.ticketLinkPosts &&  // Add this
    prev.event.ticketLinkEvents === next.event.ticketLinkEvents && // Add this
    prev.event.description === next.event.description &&           // Add this
    prev.isSaved === next.isSaved &&
    prev.matchesUserInterests === next.matchesUserInterests &&
    prev.showVenueName === next.showVenueName &&
    prev.isGuest === next.isGuest &&
    prev.isTutorialTarget === next.isTutorialTarget;
});

// Multiple Events Content Component
interface MultipleEventsContentProps {
  events: Event[];
  onSelectEvent: (event: Event) => void;
  isMultiVenue?: boolean;
  onImagePress: (imageUrl: string, event: Event) => void;
  savedEvents: string[];
  userInterests?: string[]; // Add userInterests prop
  userLocation?: { coords: { latitude: number; longitude: number } } | null; // Add userLocation prop
  isGuest?: boolean; // Add guest status prop
  getUpdatedEvent: (eventId: string | number) => Event | undefined; // Add this line
}

const MultipleEventsContent: React.FC<MultipleEventsContentProps> = ({ 
  events, 
  onSelectEvent,
  isMultiVenue = false,
  onImagePress,
  savedEvents,
  userInterests = [], // Default to empty array
  userLocation = null, // Default to null
  isGuest = false,
  getUpdatedEvent // Add this line
}) => {
// Use the FIXED prioritization function with proper parameters (memoized)
const sortedEvents = useMemo(() => {
  // If Map has already provided relevance-ordered events (with .relevanceScore),
  // trust that order to avoid re-sorting here.
  if (events.length > 0 && typeof (events[0] as any).relevanceScore === 'number') {
    return events;
  }
  return sortAndPrioritizeCalloutEvents(events, savedEvents, userInterests, userLocation);
}, [
  events.map(e => e.id).join('|'),
  savedEvents.join('|'),
  userInterests.join('|'),
  userLocation?.coords?.latitude ?? 0,
  userLocation?.coords?.longitude ?? 0,
]);



  return (
    <View style={styles.multiEventsContainer}>
      {sortedEvents.map((event, index) => (
        <TouchableOpacity
          key={`multiple-event-${event.id}-${index}`}
          style={styles.multiEventCard}
          onPress={() => onSelectEvent(event)}
          activeOpacity={0.7}
        >
           <MemoSpecialCard 
             event={getUpdatedEvent(event.id) || event}  // Uses fresh event data from store, falls back to original if not found
             showVenueName={isMultiVenue}
             onImagePress={onImagePress}
             isSaved={savedEvents.includes(event.id.toString())}
             matchesUserInterests={userInterests.some(interest => 
               interest.toLowerCase() === event.category.toLowerCase()
             )}
             userInterests={userInterests}
             isGuest={isGuest}
           />

        </TouchableOpacity>
      ))}
    </View>
  );
};

// Callout state for the bottom sheet
type CalloutState = 'expanded' | 'normal' | 'minimized';

interface EventCalloutProps {
  venues: Venue[];
  cluster: Cluster | null;
  onClose: () => void;
  onEventSelected?: (event: Event) => void;
  onLayoutReady?: () => void;
}

const EventCallout: React.FC<EventCalloutProps> = ({ 
  venues, 
  cluster,
  onClose,
  onEventSelected,
  onLayoutReady,
}) => {
  // Add store subscription to get fresh event data
  const storeEvents = useMapStore((state) => state.events);

  // Get global selectedImageData from mapStore (set by InterestsCarousel)
  const globalSelectedImageData = useMapStore((state) => state.selectedImageData);
  const setGlobalSelectedImageData = useMapStore((state) => state.setSelectedImageData);

  // Helper function to get updated event data from store
  const getUpdatedEvent = (eventId: string | number) => {
    return storeEvents.find(e => e.id === eventId);
  };

  // Get cluster interaction tracking
  const { hasNewContent: checkHasNewContent } = useClusterInteractionStore();

  // Helper function to check if a venue has new content
  const venueHasNewContent = (venue: Venue): boolean => {
    if (!cluster) return false;
    
    // Get all event IDs for this specific venue
    const venueEventIds = venue.events.map(e => e.id.toString());

    // Use ONLY venue.locationKey for stable tracking across zoom levels
    const stableVenueId = venue.locationKey;

    // Check if this venue has new content
    return checkHasNewContent(stableVenueId, venueEventIds);
  };

  // LOG: EventCallout rendered - shows venues and cluster data for debugging callout state
  // console.log("EventCallout rendered with props:", {
  //   venuesLength: venues ? venues.length : 0,
  //   isMultiVenue: venues && venues.length > 1,
  //   venueNames: venues ? venues.map(v => v.venue) : [],
  //   hasCluster: !!cluster,
  //   clusterType: cluster?.clusterType
  // });

  // --- Start of Tutorial Logic for Venue Selector & Tabs ---
  const venueSelectorRef = useRef<React.ElementRef<typeof Animated.View>>(null);
  const eventTabsRef = useRef<React.ElementRef<typeof Animated.View>>(null);

  const [isVenueSelectorHighlighted, setVenueSelectorHighlighted] = useState(false);
  const [isEventTabsHighlighted, setEventTabsHighlighted] = useState(false);

  const pulseAnimVenueSelector = useRef(new Animated.Value(1)).current;
  const pulseAnimEventTabs = useRef(new Animated.Value(1)).current;

  // Polling and Measurement for Venue Selector
  useEffect(() => {
    const interval = setInterval(() => {
      const flag = (global as any).tutorialHighlightVenueSelector || false;
      if (flag !== isVenueSelectorHighlighted) {
        setVenueSelectorHighlighted(flag);
      }
      if (flag && venueSelectorRef.current) {
        (venueSelectorRef.current as View).measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
          (global as any).venueSelectorLayout = { x: pageX, y: pageY, width, height };
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isVenueSelectorHighlighted]);

  // Polling and Measurement for Event Tabs
  useEffect(() => {
    const interval = setInterval(() => {
      const flag = (global as any).tutorialHighlightEventTabs || false;
      if (flag !== isEventTabsHighlighted) {
        setEventTabsHighlighted(flag);
      }
      if (flag && eventTabsRef.current) {
        (eventTabsRef.current as View).measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
          (global as any).eventTabsLayout = { x: pageX, y: pageY, width, height };
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isEventTabsHighlighted]);
  
  // Animation for Venue Selector
  useEffect(() => {
    if (isVenueSelectorHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimVenueSelector, { toValue: 1.02, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnimVenueSelector, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnimVenueSelector.stopAnimation();
      pulseAnimVenueSelector.setValue(1);
    }
  }, [isVenueSelectorHighlighted]);
  
  // Animation for Event Tabs
  useEffect(() => {
    if (isEventTabsHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimEventTabs, { toValue: 1.02, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnimEventTabs, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnimEventTabs.stopAnimation();
      pulseAnimEventTabs.setValue(1);
    }
  }, [isEventTabsHighlighted]);

  const tutorialHighlightStyle = {
    borderWidth: 3,
    borderColor: '#FF6B35',
    borderRadius: 8, // A generic radius for these components
    zIndex: 99999,
  };
  // --- End of Tutorial Logic ---

  // ===============================================================
  // GUEST LIMITATION SETUP
  // ===============================================================
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();
  
  // Track scroll state per venue+tab combination
  const [scrolledCombinations, setScrolledCombinations] = useState<Set<string>>(new Set());
  
  // ===============================================================
  // EXISTING STATE (keep all existing state)
  // ===============================================================
  
  // State for saved events and favorite venues
// Read saved events, interests, favorite venues, and liked events from the centralized cache (hydrated at login)
const savedEvents = useUserPrefsStore((s: UserPrefsState) => s.savedEvents);
const userInterests = useUserPrefsStore((s: UserPrefsState) => s.interests);
const favoriteVenues = useUserPrefsStore((s: UserPrefsState) => s.favoriteVenues);
const [userLocation, setUserLocation] = useState<{ coords: { latitude: number; longitude: number } } | null>(null);

  
// Removed local fetching/listening of user prefs.
// Now sourced from useUserPrefsStore (hydrated at login via AuthProvider).
  
  const findMostRelevantVenueIndex = (venues: Venue[], userFavoriteVenues: string[]): number => {
    if (!venues || venues.length === 0) return 0;
    if (venues.length === 1) return 0;

    // Build venue info with favorite and now status
    const venueInfo = venues.map((venue, index) => {
      const isFavorite = userFavoriteVenues.includes(venue.locationKey);
      const hasNowEvents = venue.events.some(event =>
        isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)
      );
      return { index, isFavorite, hasNowEvents };
    });

    // Priority 1: Favorite venue with "now" events
    const favoriteWithNow = venueInfo.find(v => v.isFavorite && v.hasNowEvents);
    if (favoriteWithNow) {
      console.log(`Found favorite venue with 'happening now' content at index ${favoriteWithNow.index}: ${venues[favoriteWithNow.index].venue}`);
      return favoriteWithNow.index;
    }

    // Priority 2: Any favorite venue
    const favoriteVenue = venueInfo.find(v => v.isFavorite);
    if (favoriteVenue) {
      console.log(`Found favorite venue at index ${favoriteVenue.index}: ${venues[favoriteVenue.index].venue}`);
      return favoriteVenue.index;
    }

    // Priority 3: Any venue with "now" events
    const nowVenue = venueInfo.find(v => v.hasNowEvents);
    if (nowVenue) {
      console.log(`Found venue with 'happening now' content at index ${nowVenue.index}: ${venues[nowVenue.index].venue}`);
      return nowVenue.index;
    }

    // Priority 4: Venue with earliest upcoming event
    let earliestEventTime = new Date(8640000000000000);
    let earliestVenueIndex = 0;

    venues.forEach((venue, index) => {
      venue.events.forEach(event => {
        try {
          const eventStartTime = combineDateAndTime(event.startDate, event.startTime);
          if (eventStartTime < earliestEventTime) {
            earliestEventTime = eventStartTime;
            earliestVenueIndex = index;
          }
        } catch (error) {
          console.warn(`Error parsing date for event: ${event.title}`, error);
        }
      });
    });

    console.log(`Selected venue with earliest event at index ${earliestVenueIndex}: ${venues[earliestVenueIndex].venue}`);
    return earliestVenueIndex;
  };
  
const { reorderedVenues, initialVenueIndex } = useMemo(() => {
  const mostRelevantIndex = findMostRelevantVenueIndex(venues, favoriteVenues);

  if (mostRelevantIndex === 0) {
    // Most relevant venue is already first, no reordering needed
    return { reorderedVenues: venues, initialVenueIndex: 0 };
  }

  // Move the most relevant venue to position 0
  const reordered = [...venues];
  const [mostRelevantVenue] = reordered.splice(mostRelevantIndex, 1);
  reordered.unshift(mostRelevantVenue);

  return { reorderedVenues: reordered, initialVenueIndex: 0 };
}, [venues, favoriteVenues]);

const [activeVenueIndex, setActiveVenueIndex] = useState(initialVenueIndex);
const activeVenue = reorderedVenues[activeVenueIndex];
  // LOG: Active venue tracking - shows currently selected venue for debugging venue state
  // console.log("Active venue index:", activeVenueIndex, 
  //             "Active venue:", activeVenue ? activeVenue.venue : 'none');
  
  const isMultiVenue = venues.length > 1;
  // LOG: Multi-venue detection - tracks venue count for debugging layout decisions
  // console.log("Is multi-venue:", isMultiVenue, 
  //             "Total venues:", venues.length);
  
  const events = activeVenue.events.filter(event => event.type === 'event');
  const specials = activeVenue.events.filter(event => event.type === 'special');
  // LOG: Active venue content counts - shows events and specials count for debugging content display
  // console.log("Active venue events:", events.length, 
  //             "Active venue specials:", specials.length);
  
  const hasEvents = events.length > 0;
  const hasSpecials = specials.length > 0;
  
  const getInitialActiveTab = (): TabType => {
    const hasNowEvents = events.some(event => 
      isEventNow(event.startDate, event.startTime, event.endDate, event.endTime)
    );
    const hasNowSpecials = specials.some(special => 
      isEventNow(special.startDate, special.startTime, special.endDate, special.endTime)
    );
    
    if (hasNowSpecials) return 'specials';
    if (hasNowEvents) return 'events';
    if (hasEvents) return 'events';
    if (hasSpecials) return 'specials';
    return 'venue';
  };
  
const [activeTab, setActiveTab] = useState<TabType>(getInitialActiveTab());
const [selectedEvent, setSelectedEvent] = useState<Event | null>(
  hasEvents ? events[0] : (hasSpecials ? specials[0] : null)
);
// Track last default ID to avoid redundant setSelectedEvent calls
const lastDefaultIdRef = useRef<string | number | null>(selectedEvent?.id ?? null);
const [calloutState, setCalloutState] = useState<CalloutState>('expanded');

  const [scrollEnabled, setScrollEnabled] = useState(true);
  
  // Track when current venue was activated for duration tracking
  const venueActivatedAtRef = useRef<number>(Date.now());

  // Track which venues have been engaged with via scrolling (for "new content" indicator clearing)
  // Key format: stableVenueId (venue.locationKey)
  const venuesEngagedViaScrollRef = useRef<Set<string>>(new Set());

// Keep track of scroll position
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);  // Track current scroll position for gesture handling
  const currentStateRef = useRef<CalloutState>('expanded');
  const hasReportedInitialLayoutRef = useRef(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScrollMore, setCanScrollMore] = useState(false);

  // NEW: Venue selector scroll progress
  const [venueScrollProgress, setVenueScrollProgress] = useState(0);
  const [venueCanScrollMore, setVenueCanScrollMore] = useState(false);
  
  // Back to top button state
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopOpacity = useRef(new Animated.Value(0)).current;
  
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
  } | null>(null);
  
  // Change this: remove the calloutVisible state
  // Instead, use CSS to show/hide the callout when the lightbox is open
  const isLightboxOpen = !EVENT_CALLOUT_SHELL_ISOLATION_DEBUG && selectedImageData !== null;
  
  // Calculate the number of ads needed based on the content
  const calculateAdCount = useMemo(() => {
    let adCount = 1; // Default minimum
    
    // Get active content based on current tab
    const activeContent = activeTab === 'events' ? events : activeTab === 'specials' ? specials : [];
    
    // Check if current tab has minimal content (each tab is evaluated independently)
    const isCurrentTabMinimalContent = activeContent.length <= 1;
    
    if (activeContent.length > 0) {
      if (isCurrentTabMinimalContent) {
        // For minimal content (just 1 item), we just need 1 ad
        adCount = 1;
      } else {
        // For multiple items, calculate 1 ad per 3 content items
        adCount = Math.ceil(activeContent.length / 2);
        
        // Increase reasonable limits for longer lists
        const maxAds = Math.min(15, Math.ceil(activeContent.length / 2)); // Up to 15 ads or half the content, whichever is smaller
        adCount = Math.min(adCount, maxAds);
      }
    }
    
    console.log(`Calculated ${adCount} ads needed for ${activeTab} tab with ${activeContent.length} items (${isCurrentTabMinimalContent ? 'minimal content' : 'multiple items'})`);
    return adCount;
  }, [activeTab, events.length, specials.length]);
  
  // Load native ads for the current tab
  // Pass activeVenueIndex as startIndex so different venues show different ads from the pool
  const requestedNativeAdCount = EVENT_CALLOUT_DISABLE_NATIVE_ADS_DEBUG ? 0 : calculateAdCount;
  const nativeAds = useNativeAds(
    requestedNativeAdCount,
    activeTab === 'events' ? 'events' : 'specials',
    activeVenueIndex
  );
  
  // Create mixed content arrays for events and specials tabs
  const mixedEventsContent = useMemo(() => {
    // For events tab: evaluate only the events count (independent of specials)
    const isMinimalEventsContent = events.length <= 1;
    return mixContentWithAds(events, nativeAds, isMinimalEventsContent);
  }, [events, nativeAds]);
  
  const mixedSpecialsContent = useMemo(() => {
    // For specials tab: evaluate only the specials count (independent of events)
    const isMinimalSpecialsContent = specials.length <= 1;
    return mixContentWithAds(specials, nativeAds, isMinimalSpecialsContent);
  }, [specials, nativeAds]);
  
  const handleImagePress = (imageUrl: string, event: Event) => {
    console.log('IMAGE PRESSED - Starting handleImagePress with URL:', imageUrl);
console.log('EVENT DATA:', { 
  id: event.id, 
  title: event.title, 
  type: event.type 
});

// DEBUG: compare address in prop vs store before opening lightbox
try {
  const storeEvent = storeEvents.find(e => e.id === event.id);
  console.log('[AddressFlow][Callout->Lightbox]', {
    id: event.id,
    propAddress: event.address,
    storeAddress: storeEvent?.address,
    propHasCoords: !!(event.latitude != null && event.longitude != null),
    storeHasCoords: !!(storeEvent?.latitude != null && storeEvent?.longitude != null),
  });
} catch {}

// Just set the selectedImageData - don't hide the callout
setSelectedImageData({ imageUrl, event });
console.log('ATTEMPTING to set selectedImageData state...');

    
    // Just set the selectedImageData - don't hide the callout
    setSelectedImageData({ imageUrl, event });
    console.log('ATTEMPTING to set selectedImageData state...');
  };
  
  const handleModalClose = () => {
    console.log('LIGHTBOX CLOSE triggered');
    setSelectedImageData(null);
    setGlobalSelectedImageData(null);
  };
  
  // ===============================================================
  // GUEST LIMITATION INTERACTION HANDLERS
  // ===============================================================
  
  /**
   * Handle venue selection with guest limitation tracking
   */
const handleVenueSelect = (index: number) => {
  console.log(`[GuestLimitation] Venue change: ${activeVenueIndex} → ${index}`);
  
  // Track venue change interaction for guests
  if (isGuest && !trackInteraction(InteractionType.CLUSTER_VENUE_CHANGE)) {
    console.log('[GuestLimitation] Venue change interaction blocked - allowing action but prompt should show');
    // Still allow the venue change - the prompt will show over the content
  }
  
  // Calculate duration on previous venue
  const now = Date.now();
  const durationMs = now - venueActivatedAtRef.current;
  const durationSeconds = Math.round(durationMs / 1000);
  
  // 🔥 ANALYTICS: Track venue change with duration
  const fromVenue = reorderedVenues[activeVenueIndex];
  const toVenue = reorderedVenues[index];

  amplitudeTrack('callout_venue_changed', {
    previous_venue: fromVenue?.venue || 'unknown',
    current_venue: toVenue?.venue || 'unknown',
    previous_venue_index: activeVenueIndex,
    current_venue_index: index,
    total_venues: venues.length,
    previous_event_count: fromVenue?.events.filter(e => e.type === 'event').length || 0,
    current_event_count: toVenue?.events.filter(e => e.type === 'event').length || 0,
    previous_special_count: fromVenue?.events.filter(e => e.type === 'special').length || 0,
    current_special_count: toVenue?.events.filter(e => e.type === 'special').length || 0,
    cluster_id: cluster?.id || 'single_venue',
    active_tab: activeTab,
    source: 'map_callout',
    referrer_screen: '/map',
    venue_active_for_seconds: durationSeconds, // ⭐ How long user was on previous venue
    venue_active_for_ms: durationMs, // ⭐ Duration in milliseconds for precision
  });
  
  // Update timestamp for the new venue
  venueActivatedAtRef.current = now;
  
  // Clear scroll tracking for the new venue+tab combination
  const newScrollKey = `venue_${index}_tab_${activeTab}`;
  setScrolledCombinations(prev => {
    const newSet = new Set(prev);
    newSet.delete(newScrollKey); // Remove if exists so first scroll in new venue counts
    return newSet;
  });

  // Reset scroll and UI state so the new venue starts at the top
  // Skip during venue-selector tutorial step to avoid janky jumps
  const tutorialActive = (global as any).tutorialManager?.getIsActive?.() === true;
  const tutorialStep = (global as any).tutorialManager?.getCurrentStep?.()?.id;
  const shouldSkipAutoScroll = tutorialActive && tutorialStep === 'callout-venue-selector';

  if (!shouldSkipAutoScroll) {
    scrollViewRef.current?.scrollTo({
      y: 0,
      animated: false
    });
  }
  // Reset progress/affordances immediately so UI doesn't flash stale state
  setScrollProgress(0);
  setCanScrollMore(false);
  if (showBackToTop) {
    setShowBackToTop(false);
    backToTopOpacity.setValue(0);
  }
  
  // Record venue-specific interaction for "new content" tracking
  // Use ONLY venue.locationKey for stable tracking across zoom levels
  if (cluster && toVenue) {
    const venueEventIds = toVenue.events.map(e => e.id.toString());
    const stableVenueId = toVenue.locationKey;
    const { recordInteraction } = useClusterInteractionStore.getState();
    recordInteraction(stableVenueId, venueEventIds);
  }
  
  // Proceed with venue change
  setActiveVenueIndex(index);
};
  
  /**
   * Handle tab change with guest limitation tracking
   */
const handleTabChange = (tab: TabType) => {
  console.log(`[GuestLimitation] Tab change: ${activeTab} → ${tab}`);
  
  // Track tab change interaction for guests
  if (isGuest && !trackInteraction(InteractionType.CLUSTER_TAB_CHANGE)) {
    console.log('[GuestLimitation] Tab change interaction blocked - allowing action but prompt should show');
    // Still allow the tab change - the prompt will show over the content
  }
  
  // 🔥 ANALYTICS: Track tab change
  amplitudeTrack('callout_tab_changed', {
    from_tab: activeTab,
    to_tab: tab,
    venue_name: activeVenue.venue,
    venue_index: activeVenueIndex,
    total_venues: venues.length,
    event_count: events.length,
    special_count: specials.length,
    cluster_id: cluster?.id || 'single_venue',
    source: 'map_callout',
    referrer_screen: '/map',
  });

  // 🎯 TUTORIAL: auto-complete 'events-tab' when user selects the Events tab
try {
  const tMgr = (global as any).tutorialManager;
  const tutorialActive = tMgr?.getIsActive?.() === true;
  const currentStep = tMgr?.getCurrentStep?.();

  if (tutorialActive && currentStep?.id === 'events-tab' && tab === 'events') {
    const now = Date.now();
    const dwellStart = (global as any).__tutorialStepDwellStartTs || now;
    const dwell = Math.max(0, now - dwellStart);

    // Emit completion for the interaction step
    amplitudeTrack('tutorial_step_completed', {
      // standard tutorial props
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 1,
      total_steps: tMgr?.getTotalSteps?.() ?? 0,
      step_index: tMgr?.getCurrentStepIndex?.() ?? 0,
      step_key: 'events-tab',
      from_screen: '/map',
      launch_source: (global as any).tutorialLaunchSource || 'auto',
      user_initiated: (global as any).tutorialLaunchUserInitiated === true,
      source: 'tutorial_system',
      is_guest: !!isGuest,
      dwell_ms_on_step: dwell,
    });
    // NOTE: We do NOT auto-advance here; TutorialManager controls flow.
  }
} catch {}

  
  // Clear scroll tracking for the new venue+tab combination
  const newScrollKey = `venue_${activeVenueIndex}_tab_${tab}`;
  setScrolledCombinations(prev => {
    const newSet = new Set(prev);
    newSet.delete(newScrollKey); // Remove if exists so first scroll in new tab counts
    return newSet;
  });
  
  // Proceed with tab change
  setActiveTab(tab);
};
  
  /**
   * Handle scroll with first-scroll-per-venue-tab-combination tracking
   */
  const handleContentScroll = (event: NativeSyntheticEvent<any>) => {
    // Always update scroll progress for UI
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollYRef.current = contentOffset.y;  // Track scroll position for gesture handling
    const progress = contentOffset.y / (contentSize.height - layoutMeasurement.height);
    setScrollProgress(Math.min(Math.max(progress, 0), 1));
    setCanScrollMore(contentSize.height > layoutMeasurement.height);

    // Back to top button visibility logic
    const shouldShowBackToTop = contentOffset.y > 200; // Show after scrolling down 200px
    if (shouldShowBackToTop !== showBackToTop) {
      setShowBackToTop(shouldShowBackToTop);
      Animated.timing(backToTopOpacity, {
        toValue: shouldShowBackToTop ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }

    // NEW: Record venue interaction when user scrolls ≥ 150px (approximately one event card height)
    // This clears the "new content" indicator for the current venue
    const SCROLL_ENGAGEMENT_THRESHOLD = 150;
    if (cluster && reorderedVenues.length > 0 && contentOffset.y >= SCROLL_ENGAGEMENT_THRESHOLD) {
      const currentVenue = reorderedVenues[activeVenueIndex];
      const stableVenueId = currentVenue.locationKey;

      // Only record once per venue
      if (!venuesEngagedViaScrollRef.current.has(stableVenueId)) {
        venuesEngagedViaScrollRef.current.add(stableVenueId);
        const venueEventIds = currentVenue.events.map(e => e.id.toString());
        const { recordInteraction } = useClusterInteractionStore.getState();
        console.log(`[ScrollEngagement] User scrolled ≥${SCROLL_ENGAGEMENT_THRESHOLD}px in venue: ${currentVenue.venue}, StableVenueID: ${stableVenueId}`);
        recordInteraction(stableVenueId, venueEventIds);
      }
    }

    // Track interaction only for guests and only first scroll per venue+tab combo
    if (isGuest) {
      const scrollKey = `venue_${activeVenueIndex}_tab_${activeTab}`;

      if (!scrolledCombinations.has(scrollKey)) {
        console.log(`[GuestLimitation] First scroll in ${scrollKey}`);

        // Mark this combination as scrolled
        setScrolledCombinations(prev => new Set(prev).add(scrollKey));

        // Track the scroll interaction
        if (!trackInteraction(InteractionType.CLUSTER_SCROLL)) {
          console.log('[GuestLimitation] Scroll interaction blocked - allowing scroll but prompt should show');
          // Continue allowing scroll - the prompt will show over the content
        }
      }
    }
  };
  
  // Handle back to top button press
  const handleBackToTop = () => {
    scrollViewRef.current?.scrollTo({ 
      y: 0, 
      animated: true 
    });
  };
  /**
   * Handle event selection with guest limitation tracking
   */
  const handleEventSelect = (event: Event) => {
    console.log(`[GuestLimitation] Event click: ${event.title}`);

    // Record venue interaction when user clicks an event
    // This clears the "new content" indicator for this venue
    if (cluster && reorderedVenues.length > 0) {
      const currentVenue = reorderedVenues[activeVenueIndex];
      const venueEventIds = currentVenue.events.map(e => e.id.toString());
      const stableVenueId = currentVenue.locationKey;
      const { recordInteraction } = useClusterInteractionStore.getState();
      console.log(`[EventClick] Recording interaction for venue: ${currentVenue.venue}, StableVenueID: ${stableVenueId}`);
      recordInteraction(stableVenueId, venueEventIds);
    }

    // Track event click interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_ITEM_CLICK)) {
      console.log('[GuestLimitation] Event click interaction blocked - allowing action but prompt should show');
      // Still allow the event selection - the prompt will show over the lightbox
    }

    // Keep existing functionality
    setSelectedEvent(event);
    if (onEventSelected) {
      onEventSelected(event);
    }

    // Add lightbox functionality
    // Check if the event has an image to display
    const imageUrl = event.imageUrl || event.profileUrl;
    if (imageUrl) {
      // Use the same lightbox opening logic that's used for image clicks
      console.log('CARD PRESSED - Opening lightbox for:', imageUrl);
      console.log('EVENT DATA:', {
        id: event.id,
        title: event.title,
        type: event.type
      });

      // Use the existing state variables
      setSelectedImageData({ imageUrl, event });
    }
  };
  
  // NEW: Venue scroll handler
  const handleVenueScroll = (event: NativeSyntheticEvent<any>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const progress = contentOffset.x / (contentSize.width - layoutMeasurement.width);
    setVenueScrollProgress(Math.min(Math.max(progress, 0), 1));
    setVenueCanScrollMore(contentSize.width > layoutMeasurement.width);
  };
  
  const translateY = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(0)).current;
  const indicatorRotation = useRef(new Animated.Value(0)).current;
  
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const readAnimatedNumeric = (value: Animated.Value): number | null => {
    try {
      const getValue = (value as any).__getValue;
      if (typeof getValue !== 'function') {
        return null;
      }

      const rawValue = getValue.call(value);
      return typeof rawValue === 'number' ? Number(rawValue.toFixed(2)) : null;
    } catch {
      return null;
    }
  };

  const getCalloutHeightForState = (state: CalloutState) => {
    if (state === 'expanded') return CALLOUT_MAX_HEIGHT;
    if (state === 'minimized') return CALLOUT_MIN_HEIGHT;
    return CALLOUT_NORMAL_HEIGHT;
  };

  useEffect(() => {
    traceMapEvent('event_callout_rendered', {
      venueCount: venues.length,
      clusterId: cluster?.id ?? 'none',
      clusterType: cluster?.clusterType ?? 'single_venue',
      activeVenueIndex,
      activeVenue: activeVenue?.venue || 'unknown',
      activeTab,
      calloutState,
      selectedEventId: selectedEvent?.id ?? 'none',
    });
  }, [
    activeTab,
    activeVenue?.venue,
    activeVenueIndex,
    calloutState,
    cluster?.clusterType,
    cluster?.id,
    selectedEvent?.id,
    venues.length,
  ]);
  
useEffect(() => {
  console.log("Venues changed, recalculating most relevant venue");
  // Active venue index will always be 0 since we reorder the venues array
  setActiveVenueIndex(0);

  // NOTE: We do NOT record venue interaction here when callout opens.
  // This allows the "new content" indicator dot to remain visible on the venue card,
  // showing the user which venue has new events.
  // Interaction is recorded when the user:
  // 1. Swipes to a different venue (handled in handleVenueSelect)
  // 2. Clicks on an event in the venue (handled in handleEventSelect)
}, [venues]);
  
  useEffect(() => {
  console.log("Venue change effect triggered - activeVenueIndex:", activeVenueIndex);
  
  // ðŸŽ¯ TUTORIAL FIX: Prevent automatic tab changes during venue selector tutorial step
  if (global.tutorialManager && typeof global.tutorialManager.getCurrentStep === 'function') {
    const currentStep = global.tutorialManager.getCurrentStep();
    const isActive = global.tutorialManager.getIsActive?.();
    
    if (isActive && currentStep?.id === 'callout-venue-selector') {
      console.log("ðŸ”´ TUTORIAL FIX: Skipping automatic tab change during venue selector step");
      
      // Still set the default event, but don't change tabs automatically
      const venueEvents = activeVenue.events.filter(event => event.type === 'event');
      const venueSpecials = activeVenue.events.filter(event => event.type === 'special');
      
      let defaultEvent = null;
      if (activeTab === 'events' && venueEvents.length > 0) {
        if ((venueEvents[0] as any)?.relevanceScore !== undefined) {
          defaultEvent = venueEvents[0];
        } else {
          const sortedEvents = sortAndPrioritizeCalloutEvents(venueEvents, savedEvents, userInterests, userLocation);
          defaultEvent = sortedEvents[0];
        }
      } else if (activeTab === 'specials' && venueSpecials.length > 0) {
        if ((venueSpecials[0] as any)?.relevanceScore !== undefined) {
          defaultEvent = venueSpecials[0];
        } else {
          const sortedSpecials = sortAndPrioritizeCalloutEvents(venueSpecials, savedEvents, userInterests, userLocation);
          defaultEvent = sortedSpecials[0];
        }
      }


// Only update when the default actually changes
const newId = defaultEvent?.id ?? null;
if (lastDefaultIdRef.current !== newId) {
  lastDefaultIdRef.current = newId;
  setSelectedEvent(defaultEvent);
}
return; // Exit early - don't do automatic tab switching

    }
  }
  
  const venueEvents = activeVenue.events.filter(event => event.type === 'event');
  const venueSpecials = activeVenue.events.filter(event => event.type === 'special');
  
  let newActiveTab = activeTab;
  if (activeTab === 'events' && venueEvents.length === 0) {
    if (venueSpecials.length > 0) {
      newActiveTab = 'specials';
    } else {
      newActiveTab = 'venue';
    }
  } else if (activeTab === 'specials' && venueSpecials.length === 0) {
    if (venueEvents.length > 0) {
      newActiveTab = 'events';
    } else {
      newActiveTab = 'venue';
    }
  }
  
  if (newActiveTab !== activeTab) {
    console.log("Changing active tab from", activeTab, "to", newActiveTab);
    setActiveTab(newActiveTab);
  }
  
let defaultEvent = null;
if (newActiveTab === 'events' && venueEvents.length > 0) {
  if ((venueEvents[0] as any)?.relevanceScore !== undefined) {
    defaultEvent = venueEvents[0];
  } else {
    const sortedEvents = sortAndPrioritizeCalloutEvents(venueEvents, savedEvents, userInterests, userLocation);
    defaultEvent = sortedEvents[0];
  }
} else if (newActiveTab === 'specials' && venueSpecials.length > 0) {
  if ((venueSpecials[0] as any)?.relevanceScore !== undefined) {
    defaultEvent = venueSpecials[0];
  } else {
    const sortedSpecials = sortAndPrioritizeCalloutEvents(venueSpecials, savedEvents, userInterests, userLocation);
    defaultEvent = sortedSpecials[0];
  }
}


// Only set if changed to avoid re-renders
const newId = defaultEvent?.id ?? null;
if (lastDefaultIdRef.current !== newId) {
  console.log("Setting default event:", defaultEvent ? defaultEvent.title : 'none');
  lastDefaultIdRef.current = newId;
  setSelectedEvent(defaultEvent);
} else {
  console.log("Default event unchanged; skipping setSelectedEvent");
}

}, [activeVenueIndex, activeVenue, savedEvents, userInterests, userLocation]);
  
  useEffect(() => {
    console.log('selectedImageData CHANGED:', 
      selectedImageData ? {
        url: selectedImageData.imageUrl,
        eventTitle: selectedImageData.event.title
      } : 'null'
    );
  }, [selectedImageData]);
  
const insets = useSafeAreaInsets();
const tabBarHeight = useBottomTabBarHeight();
const navBarOffset = tabBarHeight + (insets?.bottom ?? 0);
const bottomInset = Math.max(16, navBarOffset + 12); // pad list above the tab bar + a small buffer
// Expanded snap offset: match prior behavior (safe-area + 22)
const safeTopOffset = Math.max(0, (insets?.top ?? 0) + 22);
const currentCalloutHeight = getCalloutHeightForState(calloutState);
const CalloutContainerComponent: any = EVENT_CALLOUT_SHELL_ISOLATION_DEBUG ? View : Animated.View;
const calloutContainerStyle = EVENT_CALLOUT_SHELL_ISOLATION_DEBUG
  ? [
      styles.calloutContainer,
      {
        height: currentCalloutHeight,
        transform: [{ translateY: calloutState === 'expanded' ? safeTopOffset : 0 }],
      },
    ]
  : [
      styles.calloutContainer,
      {
        height: currentCalloutHeight,
        transform: [{ translateY: translateY }],
        opacity: isLightboxOpen ? 0.3 : 1,
      }
    ];

useEffect(() => {
  traceMapEvent('event_callout_visual_state_changed', {
    clusterId: cluster?.id ?? 'none',
    venueCount: venues.length,
    activeTab,
    calloutState,
    activeVenueIndex,
    selectedEventId: selectedEvent?.id ?? 'none',
    currentTranslateY: readAnimatedNumeric(translateY),
    currentBackgroundOpacity: readAnimatedNumeric(backgroundOpacity),
    currentIndicatorRotation: readAnimatedNumeric(indicatorRotation),
    computedHeight: currentCalloutHeight,
    safeTopOffset,
    navBarOffset,
    bottomInset,
  });

  const delays = [100, 300, 700, 1500];
  const timers = delays.map((delayMs) =>
    setTimeout(() => {
      traceMapEvent('event_callout_visual_probe', {
        delayMs,
        clusterId: cluster?.id ?? 'none',
        venueCount: venues.length,
        activeTab,
        calloutState,
        activeVenueIndex,
        selectedEventId: selectedEvent?.id ?? 'none',
        currentTranslateY: readAnimatedNumeric(translateY),
        currentBackgroundOpacity: readAnimatedNumeric(backgroundOpacity),
        currentIndicatorRotation: readAnimatedNumeric(indicatorRotation),
        computedHeight: currentCalloutHeight,
        safeTopOffset,
        navBarOffset,
        bottomInset,
      });
    }, delayMs)
  );

  return () => {
    timers.forEach(clearTimeout);
  };
}, [
  activeTab,
  activeVenueIndex,
  bottomInset,
  calloutState,
  cluster?.id,
  currentCalloutHeight,
  navBarOffset,
  safeTopOffset,
  selectedEvent?.id,
  venues.length,
]);

const setCalloutStateWithAnimation = (state: CalloutState) => {
  if (EVENT_CALLOUT_SHELL_ISOLATION_DEBUG) {
    setCalloutState(state);
    currentStateRef.current = state;
    translateY.setValue(0);
    backgroundOpacity.setValue(0);
    indicatorRotation.setValue(state === 'expanded' ? 1 : 0);
    traceMapEvent('event_callout_internal_animation_skipped', {
      clusterId: cluster?.id ?? 'none',
      venueCount: venues.length,
      requestedState: state,
      appliedState: state,
      shellIsolation: true,
    });
    return;
  }



  console.log('ANIMATION - Changing from', calloutState, 'to', state);
  setCalloutState(state);
  currentStateRef.current = state; // Update ref immediately
  console.log('STATE SHOULD NOW BE:', state);
  
  let targetTranslateY: number;
  let targetOpacity: number;
  let targetRotation: number;
  
    switch (state) {
  case 'expanded':
    targetTranslateY = safeTopOffset; // Land just below the header/safe area
    targetOpacity = 0.5;
    targetRotation = 1;
    break;

  case 'minimized':
    targetTranslateY = CALLOUT_NORMAL_HEIGHT - CALLOUT_MIN_HEIGHT; // Back to original value
    targetOpacity = 0;
    targetRotation = 0;
    break;
  default: // normal
    targetTranslateY = 0; // Keep this at 0
    targetOpacity = 0;
    targetRotation = 0;
}
    
    console.log('ANIMATION TARGETS - translateY:', targetTranslateY, 'opacity:', targetOpacity);
    traceMapEvent('event_callout_internal_animation_started', {
      clusterId: cluster?.id ?? 'none',
      venueCount: venues.length,
      fromState: calloutState,
      toState: state,
      currentStateRef: currentStateRef.current,
      targetTranslateY,
      targetOpacity,
      targetRotation,
      currentTranslateY: readAnimatedNumeric(translateY),
      currentBackgroundOpacity: readAnimatedNumeric(backgroundOpacity),
      currentIndicatorRotation: readAnimatedNumeric(indicatorRotation),
      computedHeight: getCalloutHeightForState(state),
      safeTopOffset,
      navBarOffset,
      bottomInset,
    });
    
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: targetTranslateY,
        useNativeDriver: true,
        bounciness: 0
      }),
      Animated.timing(backgroundOpacity, {
        toValue: targetOpacity,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(indicatorRotation, {
        toValue: targetRotation,
        duration: 200,
        useNativeDriver: true
      })
    ]).start(({ finished }) => {
      traceMapEvent('event_callout_internal_animation_finished', {
        clusterId: cluster?.id ?? 'none',
        venueCount: venues.length,
        targetState: state,
        finished,
        currentStateRef: currentStateRef.current,
        targetTranslateY,
        currentTranslateY: readAnimatedNumeric(translateY),
        currentBackgroundOpacity: readAnimatedNumeric(backgroundOpacity),
        currentIndicatorRotation: readAnimatedNumeric(indicatorRotation),
        computedHeight: getCalloutHeightForState(currentStateRef.current),
        safeTopOffset,
        navBarOffset,
        bottomInset,
      });
    });
  };

  // Attach the PanResponder to entire callout for swipe-from-anywhere
  const panResponder = useRef(
    PanResponder.create({
      // Don't claim gesture on touch start - let ScrollView have a chance
      onStartShouldSetPanResponder: () => false,

      // Only claim when clear vertical movement detected AND scroll-aware
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const { dx, dy } = gestureState;

        // Must be primarily vertical
        const isVerticalGesture = Math.abs(dy) > Math.abs(dx);
        const exceededThreshold = Math.abs(dy) > 10;
        const hasVerticalBias = Math.abs(dy) > Math.abs(dx) * 1.5;

        if (!isVerticalGesture || !exceededThreshold || !hasVerticalBias) {
          return false;
        }

        // Check scroll position
        const currentScrollY = scrollYRef.current || 0;

        // Down swipe: only claim if at top of scroll
        if (dy > 0 && currentScrollY < 5) {
          return true;
        }

        // Up swipe: always claim (doesn't interfere with scrolling)
        if (dy < 0) {
          return true;
        }

        // Otherwise, let ScrollView handle
        return false;
      },
      onPanResponderGrant: () => {
  // ⚠️ Do NOT toggle ScrollView enable/disable here.
  // On Android, if a gesture terminates without 'release', the list can get stuck non-scrollable.

        translateY.stopAnimation();
        translateY.extractOffset();
        setScrollEnabled(false);
      },
      onPanResponderMove: (_, gestureState) => {
        // LOG: Pan gesture movement tracking
        // console.log('MOVE - dy:', gestureState.dy.toFixed(2), 'dx:', gestureState.dx.toFixed(2), 'vy:', gestureState.vy.toFixed(2));
        translateY.setValue(gestureState.dy);
        let opacity = 0;
        if (calloutState === 'expanded') {
          opacity = Math.max(0, 0.5 - (gestureState.dy / SCREEN_HEIGHT));
        } else if (calloutState === 'normal' && gestureState.dy < 0) {
          opacity = Math.min(0.5, Math.abs(gestureState.dy) / SCREEN_HEIGHT);
        }
        backgroundOpacity.setValue(opacity);
        const rotation = calloutState === 'expanded' ? 
          Math.max(0, 1 - (gestureState.dy / 300)) :
          Math.min(1, Math.abs(gestureState.dy) / 300);
        indicatorRotation.setValue(rotation);
      },
      onPanResponderRelease: (_, gestureState) => {
  // Keep ScrollView state untouched; header pan shouldn’t globally enable/disable inner scrolling

        translateY.flattenOffset();
        setScrollEnabled(true);
        const { dy, vy } = gestureState;
        console.log('RELEASE - dy:', dy.toFixed(2), 'vy:', vy.toFixed(2), 'current state:', currentStateRef.current);
        if (currentStateRef.current === 'minimized' && dy > 10) {
          console.log('CLOSING callout');
          onClose();
          return;
        }
        let targetState = currentStateRef.current;
        if (Math.abs(vy) > VELOCITY_THRESHOLD) {
          console.log('VELOCITY-BASED decision - threshold exceeded:', Math.abs(vy), '>', VELOCITY_THRESHOLD);
          if (vy > 0) {
            console.log('SWIPING DOWN with velocity');
            if (currentStateRef.current === 'expanded') targetState = 'normal';
            else if (currentStateRef.current === 'normal') targetState = 'minimized';
          } else {
            console.log('SWIPING UP with velocity');
            if (currentStateRef.current === 'minimized') targetState = 'normal';
            else if (currentStateRef.current === 'normal') targetState = 'expanded';
          }
        } else if (Math.abs(dy) > DRAG_THRESHOLD) {
          console.log('DISTANCE-BASED decision - threshold exceeded:', Math.abs(dy), '>', DRAG_THRESHOLD);
          if (dy > 0) {
            console.log('DRAGGED DOWN');
            if (currentStateRef.current === 'expanded') targetState = 'normal';
            else if (currentStateRef.current === 'normal') targetState = 'minimized';
          } else {
            console.log('DRAGGED UP');
            if (currentStateRef.current === 'minimized') targetState = 'normal';
            else if (currentStateRef.current === 'normal') targetState = 'expanded';
          }
        }
        console.log('TARGET STATE decided:', targetState);
        setCalloutStateWithAnimation(targetState);
      }
    })
  ).current;
const shellPanHandlers = EVENT_CALLOUT_SHELL_ISOLATION_DEBUG ? {} : panResponder.panHandlers;

    useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (calloutState === 'expanded') {
        setCalloutStateWithAnimation('normal');
        return true;
      }
      return false;
    });
    
    return () => backHandler.remove();
  }, [calloutState]);

// ðŸŽ¯ TUTORIAL INTEGRATION: Expose callout state control globally (attach per mount)
const setCalloutStateRef = useRef(setCalloutStateWithAnimation);
const onCloseRef = useRef(onClose);

useEffect(() => {
  setCalloutStateRef.current = setCalloutStateWithAnimation;
  onCloseRef.current = onClose;
}, [setCalloutStateWithAnimation, onClose]);

useEffect(() => {
  // @ts-ignore - Add wrappers to global for tutorial system access
  (global as any).setCalloutState = (state: any) => {
    // schedule on next frame to avoid racing current render/animation
    requestAnimationFrame(() => setCalloutStateRef.current(state));
  };
  // @ts-ignore - Add close function for tutorial system
  (global as any).closeCallout = () => {
    requestAnimationFrame(() => onCloseRef.current());
  };
  console.log('[Tutorial] Callout state function exposed globally');

  return () => {
    // @ts-ignore - Cleanup on unmount so the next mount re-attaches fresh
    delete (global as any).setCalloutState;
    // @ts-ignore
    delete (global as any).closeCallout;
  };
}, []);



useEffect(() => {
  console.log("Initial callout animation effect");
  const initialCalloutState: CalloutState = 'expanded';
  if (calloutState !== initialCalloutState) {
    setCalloutState(initialCalloutState);
  }
  currentStateRef.current = initialCalloutState;
  traceMapEvent('event_callout_initial_positioning', {
    clusterId: cluster?.id ?? 'none',
    venueCount: venues.length,
    calloutState: initialCalloutState,
    currentStateRef: currentStateRef.current,
    safeTopOffset,
    currentTranslateY: readAnimatedNumeric(translateY),
  });
  const shouldAnimateToExpanded = false;
  const initialTranslateY = initialCalloutState === 'expanded' ? safeTopOffset : 0;
  const initialBackgroundOpacity = initialCalloutState === 'expanded' ? 0.5 : 0;
  const initialIndicatorRotation = initialCalloutState === 'expanded' ? 1 : 0;

  translateY.setValue(initialTranslateY);
  backgroundOpacity.setValue(initialBackgroundOpacity);
  indicatorRotation.setValue(initialIndicatorRotation);
  traceMapEvent('event_callout_initial_position_applied', {
    clusterId: cluster?.id ?? 'none',
    venueCount: venues.length,
    calloutState: initialCalloutState,
    currentStateRef: currentStateRef.current,
    safeTopOffset,
    currentTranslateY: readAnimatedNumeric(translateY),
    initialTranslateY,
    initialBackgroundOpacity,
    initialIndicatorRotation,
    shouldAnimateToExpanded,
  });
}, [cluster?.id, safeTopOffset, venues.length]);



  const handleTouchStart = (e: NativeSyntheticEvent<any>) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
  };

  const handleTouchEnd = (e: NativeSyntheticEvent<any>) => {
    const touchEndX = e.nativeEvent.pageX;
    const touchEndY = e.nativeEvent.pageY;
    
    const swipeX = touchStartX.current - touchEndX;
    const swipeY = Math.abs(touchStartY.current - touchEndY);
    
    if (Math.abs(swipeX) > 50 && swipeY < 50) {
      if (swipeX > 0) {
        if (activeTab === 'events' && hasSpecials) {
          handleTabChange('specials');
        } else if ((activeTab === 'events' || activeTab === 'specials')) {
          handleTabChange('venue');
        }
      } else {
        if (activeTab === 'venue' && hasSpecials) {
          handleTabChange('specials');
        } else if (activeTab === 'venue' && hasEvents) {
          handleTabChange('events');
        } else if (activeTab === 'specials' && hasEvents) {
          handleTabChange('events');
        }
      }
    }
  };

  // Enhanced render function for content items (events and ads)
  const renderContentItem = (item: ContentItem, index: number) => {
    if (item.type === 'ad') {
      return (
        <View key={`ad-${index}`} style={styles.adContainer}>
          {EVENT_CALLOUT_PLACEHOLDER_AD_CARD_DEBUG ? (
            <View style={styles.placeholderAdCard}>
              <View style={styles.placeholderAdBadge}>
                <Text style={styles.placeholderAdBadgeText}>Sponsored</Text>
              </View>
              <View style={styles.placeholderAdContent}>
                <MaterialIcons name="campaign" size={22} color="#6B7280" />
                <View style={styles.placeholderAdTextGroup}>
                  <Text style={styles.placeholderAdTitle}>Ad Slot Placeholder</Text>
                  <Text style={styles.placeholderAdBody}>
                    Callout native ad view disabled for preview isolation.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <CompactNativeAdComponent 
              nativeAd={(item.data as {ad: any; loading: boolean}).ad}
              loading={(item.data as {ad: any; loading: boolean}).loading}
            />
          )}
        </View>
      );
    } else {
      // Render event/special card
      const event = item.data as Event;
      return (
        <TouchableOpacity 
          key={`event-${event.id}-${index}`}
          onPress={() => handleEventSelect(event)}
          activeOpacity={0.7}
          testID={index === 0 ? "event-list-item" : undefined}
        >
          <MemoSpecialCard 
            event={getUpdatedEvent(event.id) || event}  // Uses fresh event data from store, falls back to original if not found
            showVenueName={isMultiVenue}
            onImagePress={handleImagePress}
            isSaved={savedEvents.includes(event.id.toString())}
            matchesUserInterests={userInterests.some(interest => 
              interest.toLowerCase() === event.category.toLowerCase()
            )}
            userInterests={userInterests}
            isGuest={isGuest}
            // Pass the prop to the first card in the list
            isTutorialTarget={index === 0}
          />
        </TouchableOpacity>
      );
    }
  };

  const rotateZ = indicatorRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg']
  });

  //console.log("RENDER CHECK - Will lightbox render?", !!selectedImageData);
  // LOG: EventCallout final render state
    // console.log("Rendering EventCallout - isMultiVenue:", isMultiVenue, 
    //             "Callout height:", calloutState === 'expanded' ? 'EXPANDED' : 
    //                              calloutState === 'minimized' ? 'MINIMIZED' : 
    //                              `NORMAL`);

  return (
    <>
      {!EVENT_CALLOUT_SHELL_ISOLATION_DEBUG && (
        <Animated.View 
          style={[
            styles.dimOverlay,
            { opacity: backgroundOpacity }
          ]} 
          pointerEvents="none"
        />
      )}
      
      {/* Always render the callout, but apply style changes when lightbox is open */}
      <CalloutContainerComponent
        pointerEvents={isLightboxOpen ? 'none' : 'auto'}
        style={calloutContainerStyle}
        onLayout={(event: LayoutChangeEvent) => {
          const { height, width, x, y } = event.nativeEvent.layout;
          traceMapEvent('event_callout_on_layout', {
            height,
            width,
            x,
            y,
            venueCount: venues.length,
            clusterId: cluster?.id ?? 'none',
            activeTab,
            calloutState,
            currentTranslateY: readAnimatedNumeric(translateY),
            currentBackgroundOpacity: readAnimatedNumeric(backgroundOpacity),
            currentIndicatorRotation: readAnimatedNumeric(indicatorRotation),
            computedHeight: currentCalloutHeight,
            safeTopOffset,
            navBarOffset,
            bottomInset,
          });
          if (!hasReportedInitialLayoutRef.current) {
            hasReportedInitialLayoutRef.current = true;
            traceMapEvent('event_callout_initial_layout_ready', {
              height,
              width,
              x,
              y,
              venueCount: venues.length,
              clusterId: cluster?.id ?? 'none',
              activeTab,
              calloutState,
            });
            onLayoutReady?.();
          }
        }}
      >
        <View style={styles.compactHeaderContainer}>
          {/* Draggable area: Left section + Center (drag handle) */}
          <View {...shellPanHandlers} style={styles.headerDraggableArea}>
            <View style={styles.headerLeftSection}>
              <Text style={styles.venueTitleSmall} numberOfLines={1}>
                {isMultiVenue 
                  ? `${venues.length} Venues | ${venues.reduce((total, v) => total + v.events.length, 0)} Items`
                  : events.length > 0 && specials.length > 0 
                    ? `${events.length} Events | ${specials.length} Specials`
                    : events.length > 0 
                      ? `${events.length} Events` 
                      : specials.length > 0 
                        ? `${specials.length} Specials`
                        : `${activeVenue.venue}`
                }
              </Text>
            </View>
            <View style={styles.headerCenterSectionAbsolute}>
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
                <Animated.View style={{ transform: [{ rotateZ }], marginTop: -2 }}>
                  <MaterialIcons name="keyboard-arrow-up" size={20} color="#999999" />
                </Animated.View>
              </View>
            </View>
          </View>
          {/* Non-draggable area: Right section with reset and close buttons */}
          <View style={styles.headerRightSection}>
            <TouchableOpacity 
              onPress={() => setCalloutStateWithAnimation('normal')} 
              style={styles.resetButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="unfold-less" size={18} color="#666666" />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                console.log("ðŸ”´ CALLOUT DEBUG: CLOSE BUTTON PRESSED");
                onClose();
                console.log("ðŸ”´ CALLOUT DEBUG: After onClose() call");
              }} 
              style={styles.closeButton} 
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={22} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>
        
        <Animated.View
          {...shellPanHandlers}
          ref={venueSelectorRef}
          testID="venue-selector"
          style={[
            isVenueSelectorHighlighted && tutorialHighlightStyle,
            isVenueSelectorHighlighted && { transform: [{ scale: pulseAnimVenueSelector }] }
          ]}
        >
          <VenueSelector
            venues={reorderedVenues}
            activeVenueIndex={activeVenueIndex}
            onSelectVenue={handleVenueSelect}
            onScroll={handleVenueScroll}
            venueHasNewContent={venueHasNewContent}
            favoriteVenues={favoriteVenues}
            isGuest={isGuest}
          />
        </Animated.View>
        
        {/* Venue Selector Progress Bar */}
        {venueCanScrollMore && (
          <View style={styles.venueProgressContainer}>
            <View style={[styles.venueProgressBar, { width: `${venueScrollProgress * 100}%` }]} />
          </View>
        )}
        
        {/* Divider between venue selector and tabs */}
        <View style={styles.venueSelectorDivider} />
        
        <Animated.View
          {...shellPanHandlers}
          ref={eventTabsRef}
          testID="event-tabs"
          data-testid="event-tabs"
          style={[
            isEventTabsHighlighted && tutorialHighlightStyle,
            isEventTabsHighlighted && { transform: [{ scale: pulseAnimEventTabs }] }
          ]}
        >
          <EventTabs 
            activeTab={activeTab} 
            onChangeTab={handleTabChange}
            eventCount={events.length}
            specialCount={specials.length}
            venueCount={venues.length}
          />
        </Animated.View>
        
        <View style={styles.contentContainer}>
        <ScrollView 
            ref={scrollViewRef}
            style={styles.calloutContent}
            showsVerticalScrollIndicator={false}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            scrollEventThrottle={16}
            scrollEnabled={scrollEnabled && calloutState !== 'minimized'}
            bounces={false}
            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: bottomInset }]}
            onScroll={handleContentScroll}
          >
            {activeTab === 'events' && (
              <>
                {hasEvents && (
                  <View style={styles.multiEventsContainer}>
                    {mixedEventsContent.map((item, index) => renderContentItem(item, index))}
                  </View>
                )}
              </>
            )}
            
            {activeTab === 'specials' && (
              <>
                {hasSpecials && (
                  <View style={styles.multiEventsContainer}>
                    {mixedSpecialsContent.map((item, index) => renderContentItem(item, index))}
                  </View>
                )}
              </>
            )}
            
            {activeTab === 'venue' && (
              <VenueInfoContent venue={activeVenue} />
            )}
            
            {/* bottom spacer replaced by dynamic paddingBottom */}
          </ScrollView>
          
          {/* Vertical Scroll Progress Bar */}
          {canScrollMore && (
            <View style={styles.verticalProgressContainer}>
              <View style={[styles.verticalProgressBar, { height: `${scrollProgress * 100}%` }]} />
            </View>
          )}
          
          {/* Back to top button */}
          {showBackToTop && (
            <Animated.View
              style={[
                styles.backToTopButton,
                {
                  opacity: backToTopOpacity,
                  bottom: (calloutState === 'expanded' ? 1 : 15) + navBarOffset,
                }
              ]}
            >
              <TouchableOpacity
                style={styles.backToTopButtonInner}
                onPress={handleBackToTop}
                activeOpacity={0.8}
              >
                <MaterialIcons 
                  name="keyboard-double-arrow-up" 
                  size={20} 
                  color="#FFFFFF" 
                />
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </CalloutContainerComponent>

      {/* Render the lightbox modal when needed - supports both local and global state */}
      {!EVENT_CALLOUT_SHELL_ISOLATION_DEBUG && (selectedImageData || globalSelectedImageData) && (
        <Modal
          transparent={true}
          visible={true}
          animationType="fade"
          onRequestClose={handleModalClose}
          statusBarTranslucent={true}
          presentationStyle="overFullScreen"
          hardwareAccelerated={true}
        >
          <EventImageLightbox
            imageUrl={(globalSelectedImageData || selectedImageData)!.imageUrl}
            event={(globalSelectedImageData || selectedImageData)!.event}
            venue={globalSelectedImageData?.venue}
            cluster={globalSelectedImageData?.cluster}
            onClose={handleModalClose}
          />
        </Modal>
      )}

      {/* =============================================================== */}
      {/* GUEST LIMITATION REGISTRATION PROMPT - ONLY FOR GUESTS */}
      {/* =============================================================== */}
      {isGuest && <RegistrationPrompt />}
    </>
  );
};

// Badge styles - separate StyleSheet for organization
const badgeStyles = StyleSheet.create({
  badgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  // Individual badge styles - Updated for condensed display
  nowBadge: {
    backgroundColor: 'rgba(52, 168, 83, 0.92)', // Slightly translucent green
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#34A853',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  forYouBadge: {
    backgroundColor: 'rgba(30, 144, 255, 0.92)', // Blue glass badge
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  savedBadge: {
    backgroundColor: 'rgba(255, 184, 0, 0.92)', // Gold glass badge
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  // Compact badge styles
  compactBadge: {
    marginLeft: 3, // Reduced margin
  },
  iconOnlyBadge: {
    paddingHorizontal: 5, // Reduced horizontal padding
  },
  // Badge text styles
  nowBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  savedBadgeText: {
    color: '#FFFFFF', // White text for better contrast on gold glass
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
});

const styles = StyleSheet.create({
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 1,
  },
  calloutContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // SOLID: Clean white background (no translucency)
    backgroundColor: '#FBF9F3',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    // Soft inner highlight for premium edge
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)', 
    borderBottomWidth: 0,
    // Modern floating shadow: diffuse, lifted, not heavy
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -6,
    },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 14,
    zIndex: 5, 
    overflow: 'hidden',
  },
  compactHeaderContainer: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
    // Glass divider: subtle, translucent
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.25)', // Slight top gradient layer
  },
  // New wrapper for the draggable area (left + center)
  headerDraggableArea: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
  },
  headerLeftSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginLeft: 5,
  },
  headerRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 5,
  },
  headerCenterSectionAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 9,
    paddingTop: 5,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(0, 0, 0, 0.15)', // More translucent, modern
  },
  venueTitleSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },
  resetButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.06)', // Translucent glass button
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.06)', // Translucent glass button
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  venueSelectorDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.06)', // Soft glass divider
    marginHorizontal: 0,
  },
  venueTopContent: {
  alignItems: 'center',
},
  tabContainer: {
  flexDirection: 'row',
  backgroundColor: 'rgba(0, 0, 0, 0.03)', // Very subtle glass tint
  paddingHorizontal: 2,
  paddingVertical: 2,
  justifyContent: 'space-around',
  gap: 4,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(0, 0, 0, 0.06)',
},
  tabPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)', // Glass inactive state
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    minHeight: 30,
  },
  activeTabPill: {
    backgroundColor: 'rgba(30, 144, 255, 0.95)', // Blue accent only when active
    borderColor: 'rgba(30, 144, 255, 0.3)',
    borderWidth: 1.5,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  tabIcon: {
    marginRight: 4,
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(0, 0, 0, 0.65)', // Softer neutral text
  },
  activeTabPillText: {
    color: '#FFFFFF',
    fontWeight: '700',
    letterSpacing: 0.3, // Slight spacing for premium feel
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingTop: 8, // Add breathing room above scrollable content
  },
  calloutContent: {
    flex: 1,
  },
  smallBottomPadding: {
    height: 16,
  },
  // Vertical scroll indicator styles
  verticalProgressContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 2,
    width: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 1.5,
  },
  verticalProgressBar: {
    width: '100%',
    backgroundColor: '#1E90FF', // Blue accent
    borderRadius: 1.5,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 1, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  // Venue selector progress bar styles
  venueProgressContainer: {
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 12,
  },
  venueProgressBar: {
    height: '100%',
    backgroundColor: '#1E90FF', // Blue accent
    borderRadius: 1.5,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  // Ad container styling
  adContainer: {
    marginBottom: 12,
  },
  placeholderAdCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D8E1EA',
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  placeholderAdBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  placeholderAdBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  placeholderAdContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholderAdTextGroup: {
    flex: 1,
    marginLeft: 10,
  },
  placeholderAdTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  placeholderAdBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6B7280',
  },
  carouselContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  eventCard: {
    width: 200,
    height: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.7)', // Frosted glass
    borderRadius: 16,
    marginRight: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    position: 'relative',
    overflow: 'hidden',
    // Soft floating shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  selectedEventCard: {
    borderColor: 'rgba(30, 144, 255, 0.6)',
    borderWidth: 2,
    backgroundColor: 'rgba(30, 144, 255, 0.1)', // Subtle blue glass tint
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  nowEventCard: {
    borderColor: '#34A853',
    borderWidth: 2,
    backgroundColor: '#E6F4EA',
  },
  cardCategoryIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 5,
    height: '100%',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginLeft: 8,
    marginBottom: 4,
  },
  cardDateTime: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 8,
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
  },
  linkText: {
    color: '#1E90FF', // Blue accent
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  nowIndicator: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#34A853',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nowIndicatorText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  venueSelectorWrapper: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)', // Near-transparent glass layer
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  venueSelectorContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  singleVenueSelectorContainer: {
    justifyContent: 'center',
    flexGrow: 1,
  },
  venueOption: {
  flexGrow: 1,
  width: 90,
  marginHorizontal: 2,
  alignItems: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.65)', // Frosted glass card
  borderRadius: 14,
  paddingTop: 2,
  paddingHorizontal: 2,
  paddingBottom: 2,
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.35)',
  justifyContent: 'space-between',
  // Subtle shadow for depth
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
  elevation: 2,
  },
  singleVenueOption: {
    width: 150,
  },
  venueOptionActive: {
    borderColor: 'rgba(30, 144, 255, 0.5)', // Blue accent for active
    backgroundColor: 'rgba(30, 144, 255, 0.08)', // Very subtle blue tint
    borderWidth: 2,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  venueOptionName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333333',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  venueOptionNameActive: {
    color: '#1E90FF', // Blue accent for active state
    fontWeight: '700',
  },
   venueProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  venueImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  venueNewContentDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 5,
  },
  venueNowIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#34A853',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 10,
  },
  venueNowText: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  venueFavoriteButtonContainer: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    zIndex: 10,
  },
  venueFavoriteButton: {
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  venuePlaceholderImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  venueItemCounts: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
    },
  countContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 2,
  },
  countText: {
    fontSize: 12,
    color: '#666666',
    marginRight: 2,
  },
  multiEventsContainer: {
    padding: 0, // Remove padding to allow full-width cards
    marginTop: -4, // Add margin above the card list for separation
    marginRight: 2,
  },
  multiEventCard: {
    marginBottom: 0, // Remove margin since we're using dividers
    overflow: 'hidden',
  },
  // Removed cardDivider - now using borderBottom on each card like events tab
  specialCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)', // Frosted glass surface
    paddingBottom: 0,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    marginHorizontal: 2,
    marginBottom: 6,
    // Modern floating shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 5,
  },
  nowSpecialCard: {
    borderLeftColor: '#34A853',
    borderLeftWidth: 4,
    backgroundColor: 'rgba(52, 168, 83, 0.06)', // Subtle green glass tint
    shadowColor: '#34A853',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  interestMatchCard: {
    borderLeftColor: '#1E90FF',
    borderLeftWidth: 4,
    backgroundColor: 'rgba(30, 144, 255, 0.05)', // Subtle blue glass tint
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  savedCard: {
    borderLeftColor: '#FFB800',
    borderLeftWidth: 4,
    backgroundColor: 'rgba(255, 184, 0, 0.04)', // Subtle gold glass tint
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  cardIndicator: {
    width: 3, // Slightly thinner for cleaner look
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  heroImageSection: {
    width: '100%',
    position: 'relative', // For proper badge positioning
    paddingHorizontal: 0, // Add horizontal padding so image isn't full width
    paddingBottom: 10, // Add space below image
    // Create strong "window frame" shadow effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  heroImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)', // Glass-like white border
    // Premium floating shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
  },
  heroEngagementOverlay: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    zIndex: 12,
  },
  heroEngagementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    minWidth: 34,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
  },
  heroEngagementBadgeSpacing: {
    marginLeft: 3,
  },
  heroEngagementBadgeLiked: {
    borderColor: BRAND.primary,
    backgroundColor: '#EBF4FF',
  },
  heroEngagementBadgeInterested: {
    borderColor: '#34A853',
    backgroundColor: '#E8F5E9',
  },
  heroEngagementBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
  },
  // Add new style for image container background
  heroImageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.5)', // Soft glass frame
    borderRadius: 16,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  contentSection: {
    paddingHorizontal: 16, // Horizontal padding for edge spacing
    paddingVertical: 12,
    paddingTop: 4, // Reduced since we have spacing from heroImageSection
    paddingBottom: 1, // Reduced to closer connect with description
  },
  cardImage: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  // Added new description section that takes full width
  descriptionSection: {
    paddingHorizontal: 16, // Match horizontal padding with top section
    paddingBottom: 8,
  },

  venueNameText: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 2,
    fontStyle: 'italic',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateTimeText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    flex: 1, // Allow text to take available space
  },
  nowBannerTime: {
  marginLeft: 6,
  fontSize: 12,
  fontWeight: '600',
  color: '#1F6F43', // a deeper green reads well next to the pulsing bar; tweak if needed
},

  
  readMoreButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  readMoreText: {
    color: '#1E90FF', // Blue accent
    fontWeight: '600',
    fontSize: 12,
  },
  cardNowIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardNowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  specialCardTopSection: {
    flexDirection: 'row',
    minHeight: 120,
  },
  specialCardContent: {
    width: '65%',
    padding: 12,
    paddingLeft: 16,
  },
  specialCardRightSection: {
    width: '35%',
    height: 120,
  },
  specialCardImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
  },
  specialCardTitle: {
    fontSize: 16,
    fontWeight: '800' ,
    color: '#333333',
    marginBottom: 12,
  },

  specialCardDateTime: {
    fontSize: 12,
    color: '#666666',
    marginLeft: 4,
  },
  specialCardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
    marginBottom: 4,
  },

  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16, // Match horizontal padding with other sections
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Note: categoryButton2 to avoid conflict with the filter categoryButton
  categoryButton2: { 
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  // Added style for Ticketed Event badge
  ticketedEventBadge: {
    backgroundColor: 'rgba(30, 144, 255, 0.1)', // Subtle blue glass
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(30, 144, 255, 0.4)',
  },
  ticketedEventText: {
    color: '#1E90FF', // Blue accent
    fontSize: 12,
    fontWeight: '600',
  },
  priceTag: {
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  priceText: {
    color: BRAND.accent, // Updated to accent red
    fontSize: 12,
    fontWeight: '500',
  },
  buyTicketsButton: {
    backgroundColor: '#1E90FF', // Blue accent for primary actions
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  buyTicketsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  // Premium feature disabled styles for guests
  disabledPremiumButton: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  disabledPremiumButtonText: {
    color: '#CCCCCC',
  },
  premiumButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  disabledActionButton: {
    opacity: 0.6,
  },
  lockIconOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    padding: 1,
  },
  quickActionButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  // New circular background for action buttons
  actionButtonCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.04)', // Softer glass
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  nowBanner: {
    backgroundColor: 'rgba(52, 168, 83, 0.12)', // Translucent green glass
    padding: 10,
    marginBottom: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52, 168, 83, 0.25)',
    shadowColor: '#34A853',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  nowBannerText: {
    color: '#34A853',
    fontWeight: 'bold',
    fontSize: 16,
  },
  pulsingEffect: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#34A853',
  },
  detailsContainer: {
    padding: 10,
  },
  eventImage: {
    width: '80%',
    height: 180,
    borderRadius: 12,
    marginBottom: 16,
    alignSelf: 'center',
    backgroundColor: '#F0F0F0',
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    color: '#333333',
  },
  eventMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },

  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  eventTime: {
    fontSize: 14,
    color: '#666666',
    marginLeft: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  ticketPrice: {
    fontSize: 14,
    color: '#E94E77',
    fontWeight: '600',
    marginLeft: 6,
  },
  descriptionContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  eventDescription: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 22,
  },
  expandButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  expandButtonText: {
    color: '#1E90FF', // Blue accent
    fontWeight: '600',
    fontSize: 14,
  },
  actionContainer: {
    flexDirection: 'row',
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)', // Glass background
    borderRadius: 14,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  actionText: {
    fontSize: 13,
    color: '#444444',
    marginLeft: 6,
  },
  ticketButton: {
    backgroundColor: '#1E90FF', // Blue accent for primary actions
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  ticketButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // ==========================================
  // VENUE INFO TAB - MODERN 2026 STYLES
  // ==========================================
  venueInfoContainer: {
    padding: 16,
    paddingTop: 8,
  },

  // Venue Header Card
  venueHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    // Cross-platform shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  venueHeaderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  venueProfileContainer: {
    marginRight: 12,
  },
  venueProfilePicture: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  venueTextContent: {
    flex: 1,
    justifyContent: 'center',
  },
  venueName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'left',
    letterSpacing: -0.3,
  },
  venueAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  venueAddressIcon: {
    marginRight: 4,
  },
  venueAddress: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'left',
    flexShrink: 1,
  },
  venueAddressExpandable: {
    color: '#007AFF',
  },
  venueAddressChevron: {
    marginLeft: 4,
  },
  venueRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  venueRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  venueRatingText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginLeft: 4,
  },
  venueRatingLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 8,
  },

  // Actions Card (Directions, Save, Call)
  venueActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  venueActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 32,
  },
  venueActionPrimary: {
    alignItems: 'center',
    minWidth: 70,
  },
  venueActionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    // Subtle shadow for depth
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  venueActionIconGreen: {
    backgroundColor: '#34C759',
    shadowColor: '#34C759',
  },
  venueActionFavoriteCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  venueActionLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
  },

  // Connect Card (Social Links)
  venueConnectCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  venueSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  venueConnectGrid: {
    gap: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    overflow: 'hidden',
  },
  venueConnectLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  venueConnectLoadingText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 10,
  },
  venueConnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  venueConnectIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  venueConnectButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '400',
    color: '#1A1A1A',
    marginLeft: 12,
  },

  // Events Card
  venueEventsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  venueDateSection: {
    marginBottom: 16,
  },
  venueDateHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  venueEventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginBottom: 4,
  },
  nowVenueEventItem: {
    backgroundColor: '#F0FFF4',
  },
  venueEventTimeBar: {
    width: 3,
    height: 36,
    borderRadius: 2,
    marginRight: 12,
  },
  venueEventDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  venueEventTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    minWidth: 70,
  },
  venueEventTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  nowVenueEventTitle: {
    color: '#34C759',
    fontWeight: '600',
  },
  venueEventNowBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  venueEventNowText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Legacy styles kept for compatibility
  venueDetailSection: {
    marginBottom: 16,
  },
  venueConnectSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  venueConnectTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  venueQuickActionsSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  venueQuickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  venueFavoriteButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  directionsButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  directionsButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  upcomingEventsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333333',
  },
  dateSection: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 10,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inlineNowIndicator: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineNowText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight
    : 'bold',
  },
  backToTopButton: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    zIndex: 1000,
  },
  backToTopButtonInner: {
    backgroundColor: 'rgba(30, 144, 255, 0.95)', // Slightly more opaque for legibility
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    // Premium floating shadow
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
});

export default EventCallout;
