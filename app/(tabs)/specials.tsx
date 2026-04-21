import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Modal,
  Share,
  Platform,
  Linking,
  GestureResponderEvent,
  TextInput,
  Alert,
  Keyboard,
  Pressable,
  InteractionManager
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import FallbackImage from '../../components/common/FallbackImage';
import { VenueFavoriteButton } from '../../components/common/VenueFavoriteButton';
import Autolink from 'react-native-autolink';

// Import the store and types
import { useMapStore } from '../../store';
import { useEventLikeCount, setEventLikeCount, startEventLikesListener, stopEventLikesListener } from '../../store/eventLikesStore';
import { useEventShareCount, setEventShareCount, startEventSharesListener, stopEventSharesListener } from '../../store/eventSharesStore';
import { useEventInterestedCount, setEventInterestedCount, startEventInterestedListener, stopEventInterestedListener } from '../../store/eventInterestedStore';
import { Event } from '../../types/events';
import { TimeFilterType } from '../../types/filter';
import CategoryFilterOptions from '../../components/map/CategoryFilterOptions';


// Import components
import EventImageLightbox from '../../components/map/EventImageLightbox';
import FullSizeSdkAdCard, { FULL_SIZE_SDK_AD_ROW_HEIGHT } from '../../components/ads/FullSizeSdkAdCard';

// Import utilities
import {
  formatEventDateTime,
  getEventTimeStatus,
  sortEventsByTimeStatus,
  combineDateAndTime,
  isEventNow,
  isEventHappeningToday,
  formatTime,
  parseISO,
  format
} from '../../utils/dateUtils';
import { addToCalendar } from '../../utils/calendarUtils';
import { buildGathrSharePayload } from '../../utils/shareUtils';

// Import priority utilities, user service, and distance calculation
import {
  BASE_SCORES,
  DISTANCE_BANDS,
  ENGAGEMENT_TIERS,
  calculateEngagementTier,
  FAVORITE_VENUE_BONUS,
  createLocationKeyFromEvent
} from '../../utils/priorityUtils';
import * as userService from '../../services/userService';
import { calculateDistance, doesEventMatchTypeFilters } from '../../store/mapStore';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { areEventIdsEquivalent } from '../../lib/api/firestoreEvents';

// Import for loading native ads
import useNativeAds from '../../hooks/useNativeAds';

// Import Firebase functionality for real-time updates
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '../../config/firebaseConfig';

// ===============================================================
// GUEST LIMITATION IMPORTS
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { InteractionType } from '../../types/guestLimitations';
import { GuestLimitedContent } from '../../components/GuestLimitedContent';
import { LockIcon } from '../../components/LockIcon';
import { RegistrationPrompt } from '../../components/RegistrationPrompt';
import { trackTabSelect, trackScrollInteraction, useGuestLimitationStore} from '../../store/guestLimitationStore';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';


// ===============================================================
// ANALYTICS IMPORT - RE-ENABLED
// ===============================================================
import useAnalytics from '../../hooks/useAnalytics';

// Constants
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const SPECIALS_NATIVE_AD_PLACEHOLDER_DEBUG = false;

// --- Local helpers for safe label/range handling and end-date suffix ---
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


function isFutureDate(dateStr?: string) {
  if (!dateStr) return false;
  try {
    const d = parseISO(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d > today;
  } catch {
    return false;
  }
}

function formatEndDateLabel(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'MMM d');
  } catch {
    return '';
  }
}


// Define brand colors for consistency with events page
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

// Helper function to get color for special category
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return BRAND.primary;
    case 'comedy show': return BRAND.primary;
    case 'cabaret': return BRAND.primary;
    case 'sports': return BRAND.primary;
    case 'meeting': return BRAND.primary;
    case 'food special': return BRAND.primary;
    case 'drink special': return BRAND.primary;
    case 'happy hour': return BRAND.primary;
    default: return BRAND.primary;
  }
};

// Helper function to validate a ticket URL
const isValidTicketUrl = (url?: string): boolean => {
  return Boolean(url && url !== "N/A" && url !== "" && url.includes("http"));
};

// Helper function to check if an event is paid
const isPaidEvent = (price?: string): boolean => {
  return Boolean(
    price && 
    price !== "N/A" && 
    price !== "0" && 
    !price.toLowerCase().includes("free")
  );
};

// Helper function to sort categories by user interest priority and count
const sortCategoriesByPriorityAndCount = (
  categoryFilterCounts: Record<string, number>,
  userInterests: string[]
): Record<string, number> => {
  const categoryArray = Object.entries(categoryFilterCounts).map(([category, count]) => ({
    category,
    count,
    matchesInterest: userInterests.some(interest => 
      interest.toLowerCase() === category.toLowerCase()
    )
  }));

  const sortedCategories = categoryArray.sort((a, b) => {
    if (a.matchesInterest && !b.matchesInterest) return -1;
    if (!a.matchesInterest && b.matchesInterest) return 1;
    return b.count - a.count;
  });

  const orderedCounts: Record<string, number> = {};
  sortedCategories.forEach(({ category, count }) => {
    orderedCounts[category] = count;
  });

  return orderedCounts;
};

// Badge Container component (same as EventCallout)
interface BadgeContainerProps {
  isNow: boolean;
  matchesUserInterests: boolean;
  isSaved: boolean;
}

const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
  isNow, 
  matchesUserInterests, 
  isSaved 
}) => {
  if (!isNow && !matchesUserInterests && !isSaved) return null;
  
  const activeCount = (isNow ? 1 : 0) + (matchesUserInterests ? 1 : 0) + (isSaved ? 1 : 0);
  const multipleActive = activeCount > 1;
  
  return (
    <View style={styles.badgeContainer}>
      {isNow && (
        <View style={[styles.nowBadge, multipleActive && styles.compactBadge]}>
          <Text style={styles.nowBadgeText}>NOW</Text>
        </View>
      )}
      
      {matchesUserInterests && (
        <View style={[
          styles.forYouBadge, 
          multipleActive && styles.compactBadge,
          (multipleActive) && styles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="thumb-up" 
            size={12} 
            color="#FFFFFF" 
          />
          {(!multipleActive || (!isNow && activeCount === 2)) && (
            <Text style={styles.badgeText}>For You</Text>
          )}
        </View>
      )}
      
      {isSaved && (
        <View style={[
          styles.savedBadge, 
          multipleActive && styles.compactBadge,
          multipleActive && styles.iconOnlyBadge
        ]}>
          <MaterialIcons 
            name="star" 
            size={12} 
            color={multipleActive ? "#FFFFFF" : "#000000"} 
          />
          {!multipleActive && (
            <Text style={styles.savedBadgeText}>Saved</Text>
          )}
        </View>
      )}
    </View>
  );
};

// EventListItem component with analytics (converted to hero image layout)
interface EventListItemProps {
  event: Event;
  onPress: () => void;
  onImagePress: (imageUrl: string, event: Event) => void;
  isSaved: boolean;
  matchesUserInterests: boolean;
  isGuest: boolean;
  analytics: any; // Analytics hook - RE-ENABLED
  isFirstItem?: boolean; // NEW: Tutorial awareness only for first item
}


const EventListItem: React.FC<EventListItemProps> = ({ 
  event, 
  onPress, 
  onImagePress,
  isSaved,
  matchesUserInterests,
  isGuest,
  analytics,
  isFirstItem = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(isSaved);
  const [isToggling, setIsToggling] = useState(false);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [isHeroLikeToggling, setIsHeroLikeToggling] = useState(false);
  const eventIdString = String(event.id);
  type UserPrefsState = {
  savedEvents: string[];
  interests: string[];
  favoriteVenues: string[];
  likedEvents: string[];
  interestedEvents: string[];
};
const savedEvents = useUserPrefsStore((s: UserPrefsState) => s.savedEvents);
const userInterests = useUserPrefsStore((s: UserPrefsState) => s.interests);
const favoriteVenues = useUserPrefsStore((s: UserPrefsState) => s.favoriteVenues);

  const likedEvents = useUserPrefsStore((s: UserPrefsState) => s.likedEvents);
  const isHeroLiked = likedEvents.includes(eventIdString);
  const interestedEvents = useUserPrefsStore((s: UserPrefsState) => s.interestedEvents);
  const isInterested = interestedEvents.includes(eventIdString);
  const [isInterestedToggling, setIsInterestedToggling] = useState(false);
  const setUserPrefs = useUserPrefsStore.getState().setAll;
  
  // Tutorial awareness - only for first item
  const tutorialRef = useRef<View>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (!isFirstItem) return; // Only first item participates in tutorial
    
    let lastMeasurement: any = null;
    let measurementCount = 0;
    
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightSpecialsListExplanation || false;
      if (globalFlag !== isHighlighted) {
        setIsHighlighted(globalFlag);
      }
      if (globalFlag && tutorialRef.current) {
        tutorialRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          // Add stability check to prevent measurement spam
          const currentMeasurement = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
          
          if (!lastMeasurement || 
              Math.abs(currentMeasurement.x - lastMeasurement.x) > 2 ||
              Math.abs(currentMeasurement.y - lastMeasurement.y) > 2 ||
              Math.abs(currentMeasurement.width - lastMeasurement.width) > 2 ||
              Math.abs(currentMeasurement.height - lastMeasurement.height) > 2) {
            
            lastMeasurement = currentMeasurement;
            measurementCount++;
            
            // Only log first few measurements to prevent spam
            if (measurementCount <= 3) {
              console.log('Tutorial: Measured first specials card:', currentMeasurement);
            }
            
            (global as any).specialsListExplanationLayout = currentMeasurement;
          }
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isHighlighted, isFirstItem]);

  useEffect(() => {
    if (isFirstItem && isHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(pulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isHighlighted, isFirstItem]);

  const tutorialHighlightStyle = {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 15,
    borderWidth: 3,
    borderColor: '#FF8C42',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    transform: [{ scale: pulseAnim }],
  };
  
  useEffect(() => {
    setBookmarked(isSaved);
  }, [isSaved]);
  
  useEffect(() => {
    setAddressExpanded(false);
  }, [event.id]);
  
  const timeStatus = getEventTimeStatus(event);
  const hasVenueAddress = Boolean(event.address?.trim());
  const handleVenuePress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (!hasVenueAddress) return;
    setAddressExpanded(prev => !prev);
  };

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

  const handleHeroLikePress = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    analytics.trackUserAction('like_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      liked: isHeroLiked,
      is_guest: isGuest,
      interaction_blocked: isGuest,
    });

    if (isGuest || isHeroLikeToggling) {
      if (isGuest) {
        console.log('[GuestLimitation] Like blocked - premium feature for registered users only');
      }
      return;
    }

    const startTime = Date.now();
    setIsHeroLikeToggling(true);
    const previousLikedEvents = [...likedEvents];
    const nextLikedEvents = isHeroLiked
      ? previousLikedEvents.filter((id) => id !== eventIdString)
      : [...previousLikedEvents, eventIdString];

    setUserPrefs({ likedEvents: nextLikedEvents });

    try {
      const baseLikes = event.likes !== undefined && event.likes !== null ? Number(event.likes) : 0;
      const result = await userService.toggleEventLike(event.id, {
        type: event.type,
        source: 'list',
        referrer: '/specials',
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
          : Math.max(0, (heroLikeLiveValue ?? baseLikes) + (result.liked ? 1 : -1));
      setEventLikeCount(event.id, nextCount);

      analytics.trackUserAction('like_success', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        venue_name: event.venue,
        liked: result.liked,
        response_time_ms: Date.now() - startTime,
      });
    } catch (error) {
      setUserPrefs({ likedEvents: previousLikedEvents });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update like';
      analytics.trackError('like_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_like',
      });
      console.error('Error toggling like:', error);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsHeroLikeToggling(false);
    }
  };

  
  // ===============================================================
  // ANALYTICS-ENHANCED ACTION HANDLERS (Special-specific)
  // ===============================================================

  const handleInterestedPress = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    analytics.trackUserAction('interested_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      interested: isInterested,
      is_guest: isGuest,
      interaction_blocked: isGuest,
    });

    if (isGuest || isInterestedToggling) {
      if (isGuest) {
        console.log('[GuestLimitation] Interested blocked - premium feature for registered users only');
      }
      return;
    }

    const startTime = Date.now();
    setIsInterestedToggling(true);
    const previousInterestedEvents = [...interestedEvents];
    const willBeInterested = !isInterested;
    const nextInterestedEvents = willBeInterested
      ? [...previousInterestedEvents, eventIdString]
      : previousInterestedEvents.filter((id) => id !== eventIdString);

    // Optimistic UI update
    setUserPrefs({ interestedEvents: nextInterestedEvents });

    try {
      const baseInterested = facebookUsersResponded;
      const result = await userService.toggleEventInterested(event.id, {
        type: 'special',
        source: 'list',
        referrer: '/specials',
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

      analytics.trackUserAction('interested_success', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        venue_name: event.venue,
        interested: result.interested,
        response_time_ms: Date.now() - startTime,
      });

      // If marking interested (not unmarking), also open calendar
      if (result.interested) {
        try {
          await addToCalendar({
            title: event.title,
            startDate: combineDateAndTime(event.startDate, event.startTime),
            endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
            location: `${event.venue}, ${event.address}`,
            notes: event.description,
          });

          analytics.trackUserAction('calendar_add_success', {
            event_id: event.id.toString(),
            event_type: 'special',
            special_category: event.category,
            venue_name: event.venue,
            response_time_ms: Date.now() - startTime,
          });
        } catch (calendarError) {
          console.error('Failed to add to calendar after marking interested:', calendarError);
        }
      }
    } catch (error) {
      // Rollback optimistic update
      setUserPrefs({ interestedEvents: previousInterestedEvents });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update interested';
      analytics.trackError('interested_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_interested',
      });
      console.error('Error toggling interested:', error);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsInterestedToggling(false);
    }
  };

  const handleAddToCalendar = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    // Track calendar interaction for specials
    analytics.trackUserAction('calendar_add_attempt', {
      event_id: event.id.toString(),
      event_type: 'special', // Always special in this component
      special_category: event.category,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });

    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return;
    }

    // If not already interested, use interested flow (which also opens calendar)
    if (!isInterested) {
      return handleInterestedPress(e);
    }

    // Already interested - just open calendar without incrementing count
    try {
      const startTime = Date.now();

      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });

      // Track successful calendar addition for special
      analytics.trackUserAction('calendar_add_success', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        venue_name: event.venue,
        response_time_ms: Date.now() - startTime
      });

      // Track special-specific conversion
      analytics.trackConversion('special_calendar_addition', {
        content_id: event.id.toString(),
        content_type: 'special',
        special_category: event.category,
        value: 1
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics.trackError('special_calendar_add_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'add_special_to_calendar'
      });
      console.error('Failed to add special to calendar', error);
    }
  };
  
  const handleShare = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    // Track share interaction for specials
    analytics.trackUserAction('share_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });

    if (isGuest) {
      console.log('[GuestLimitation] Share blocked - premium feature for registered users only');
      return;
    }

    try {
      const startTime = Date.now();

      try {
        amplitudeTrack('share_tapped', {
          event_id: String(event.id),
          content_type: 'special',
          source: 'list',
          referrer_screen: '/specials',
          channel: 'system',
        });
      } catch {}

      const sharePayload = buildGathrSharePayload(event);

      const shareResult = await Share.share({
        message: sharePayload.message,
        title: sharePayload.title,
        url: sharePayload.url, // iOS only - shows as link preview
      });

      // Only increment count if user actually shared (not cancelled)
      if (shareResult.action === Share.sharedAction) {
        // Increment share count in Firestore
        const baseShares = heroShareValueFromEvent;
        const incrementResult = await userService.incrementEventShare(event.id, {
          type: 'special',
          source: 'list',
          referrer: '/specials',
          venue: event?.venue,
          category: event?.category,
          baseShares,
        });

        if (incrementResult.success) {
          // Update local store with new count
          setEventShareCount(event.id, incrementResult.count);
        }

        // Track successful special share
        analytics.trackUserAction('share_success', {
          event_id: event.id.toString(),
          event_type: 'special',
          special_category: event.category,
          venue_name: event.venue,
          response_time_ms: Date.now() - startTime,
          new_share_count: incrementResult.count
        });

        // Track special-specific conversion
        analytics.trackConversion('special_share', {
          content_id: event.id.toString(),
          content_type: 'special',
          special_category: event.category,
          value: 1
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'User did not share') {
        analytics.trackError('special_share_failed', errorMessage, {
          event_id: event.id.toString(),
          user_action: 'share_special'
        });
      }
      console.error('Error sharing special', error);
    }
  };
  
  const handleTickets = (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Track ticket interaction for specials
    analytics.trackUserAction('ticket_link_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      has_valid_url: isValidTicketUrl(ticketUrl),
      ticket_price: event.ticketPrice,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
      return;
    }
    
    if (isValidTicketUrl(ticketUrl)) {
      // Track successful special ticket link opening
      analytics.trackUserAction('ticket_link_opened', {
        event_id: event.id.toString(),
        event_type: 'special',
        special_category: event.category,
        ticket_price: event.ticketPrice,
        venue_name: event.venue
      });
      
      // Track special-specific conversion
      analytics.trackConversion('special_ticket_engagement', {
        content_id: event.id.toString(),
        content_type: 'special',
        special_category: event.category,
        value: isPaidEvent(event.ticketPrice) ? 1 : 0.5
      });
      
      Linking.openURL(ticketUrl);
    }
  };
  
  const toggleBookmark = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    // Track bookmark interaction for specials
    analytics.trackUserAction('bookmark_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      current_bookmark_status: bookmarked,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Bookmark blocked - premium feature for registered users only');
      return;
    }
    
    if (isToggling) return;
    
    try {
      setIsToggling(true);
      const startTime = Date.now();
      const previousState = bookmarked;
      
      // Optimistic UI update
      setBookmarked(!bookmarked);
      
const result = await userService.toggleSavedEvent(event.id, {
  type: 'special',
  source: 'list',
  referrer: '/specials',
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

      
      if (!result.success) {
        // Revert UI state if operation failed
        setBookmarked(bookmarked);
        
        analytics.trackError('special_bookmark_failed', result.message || 'Failed to update bookmark', {
          event_id: event.id.toString(),
          user_action: 'toggle_special_bookmark'
        });
        
        Alert.alert('Error', result.message || 'Failed to update saved special');
      } else {
        // Track successful special bookmark toggle
        analytics.trackUserAction('bookmark_success', {
          event_id: event.id.toString(),
          event_type: 'special',
          special_category: event.category,
          new_bookmark_status: !previousState,
          venue_name: event.venue,
          response_time_ms: Date.now() - startTime
        });
        
        // Track special-specific conversion
        analytics.trackConversion('special_save', {
          content_id: event.id.toString(),
          content_type: 'special',
          special_category: event.category,
          value: !previousState ? 1 : -1
        });
      }
    } catch (error) {
      setBookmarked(bookmarked);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics.trackError('special_bookmark_error', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_special_bookmark'
      });
      
      console.error('Error toggling saved special:', error);
      Alert.alert('Error', 'Failed to update saved special');
    } finally {
      setIsToggling(false);
    }
  };
  
  // Rest of the component logic (same as events but for specials)
  const hasTicketLink = isValidTicketUrl(event.ticketLinkEvents) || 
                        isValidTicketUrl(event.ticketLinkPosts);
  const paid = isPaidEvent(event.ticketPrice);
  
   const safeNumberToString = (value: any): string => {
    if (value === undefined || value === null) return '';
    return String(value);
  };

  const isGreaterThanZero = (value: any): boolean => {
    if (value === undefined || value === null) return false;
    const num = parseInt(String(value), 10);
    return !isNaN(num) && num > 0;
  };

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

  // Live interested count (combined with Facebook usersResponded)
  const interestedLiveValue = useEventInterestedCount(event.id);
  const facebookUsersResponded = event.usersResponded !== undefined && event.usersResponded !== null
    ? Number(event.usersResponded)
    : 0;
  const interestedValue = interestedLiveValue != null ? interestedLiveValue : 0;
  const combinedInterestedValue = facebookUsersResponded + interestedValue;
  const interestedText = combinedInterestedValue > 0 ? safeNumberToString(combinedInterestedValue) : '';

  const heroEngagementMetrics = [
    { key: 'likes', icon: 'thumb-up', value: heroLikeText },
    { key: 'shares', icon: 'share', value: heroShareText },
    { key: 'interested', icon: 'person', value: interestedText },
  ].filter(Boolean) as { key: string; icon: 'thumb-up' | 'share' | 'person'; value: string }[];
  // Always show overlay - share button should always be visible
  const showHeroEngagementOverlay = true;
  const showBuyTicketsButton = hasTicketLink && paid;
  const showRegisterButton = hasTicketLink && !paid && event.ticketPrice;
  const showTicketedEventBadge = hasTicketLink && 
                                !showBuyTicketsButton && 
                                !showRegisterButton;
  
  const formatFullDateTime = (): string => {
    let dateTimeStr = formatEventDateTime(event.startDate, event.startTime, event);
    
    if (event.endTime && event.endTime !== event.startTime) {
      dateTimeStr += ` to ${formatTime(event.endTime)}`;
      
      if (event.endDate && event.endDate !== event.startDate) {
        dateTimeStr += `, ${format(parseISO(event.endDate), 'MMM d')}`;
      }
    }
    
    return dateTimeStr;
  };
  
  return (
    <Animated.View style={isFirstItem && isHighlighted ? tutorialHighlightStyle : {}}>
      <TouchableOpacity 
        ref={tutorialRef as any}
        style={[
          styles.eventCard,
          timeStatus === 'now' && styles.nowEventCard,
          matchesUserInterests && styles.interestMatchCard,
          isSaved && styles.savedCard
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
      <View style={[
        styles.cardIndicator, 
        { backgroundColor: getCategoryColor(event.category) }
      ]} />
      
      {/* Hero Image Section - NEW LAYOUT */}
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
            
            {/* Badge container positioned at top right of hero image */}
            <BadgeContainer
              isNow={timeStatus === 'now'}
              matchesUserInterests={matchesUserInterests}
              isSaved={isSaved}
            />

            {/* Venue profile picture with favorite heart - top left */}
            <View style={styles.venueProfileOverlay}>
              <View style={styles.venueProfileImageContainer}>
                <FallbackImage
                  imageUrl={event.profileUrl}
                  category={event.category}
                  type={event.type}
                  style={styles.venueProfileImageSmall}
                  fallbackType="profile"
                  resizeMode="cover"
                />
                <View style={styles.venueFavoriteButtonOverlay}>
                  <VenueFavoriteButton
                    locationKey={createLocationKeyFromEvent(event)}
                    venueName={event.venue}
                    size={12}
                    source="specials_tab"
                    style={styles.venueFavoriteButtonSmall}
                  />
                </View>
              </View>
            </View>

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
                  const iconColor = isLikeMetric && isHeroLiked
                    ? BRAND.primaryDark
                    : isInterestedMetric && isInterested
                    ? '#34A853'
                    : '#333333';
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
      
      {/* Content Section - Now below the hero image */}
      <View style={styles.contentSection}>
        <Text 
          style={styles.cardTitle} 
          numberOfLines={2}
          adjustsFontSizeToFit={false}
        >
          {event.title}
        </Text>
        
        <View style={styles.venueContainer}>
          <TouchableOpacity
            style={[
              styles.venueRow,
              hasVenueAddress && styles.venueRowInteractive
            ]}
            onPress={handleVenuePress}
            activeOpacity={hasVenueAddress ? 0.7 : 1}
          >
            <MaterialIcons name="place" size={14} color="#666666" />
            <Text 
              style={[
                styles.venueText,
                hasVenueAddress && styles.venueTextActive
              ]} 
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
            >
              {event.venue}
            </Text>
            {hasVenueAddress && (
              <MaterialIcons
                name={addressExpanded ? 'expand-less' : 'expand-more'}
                size={18}
                color="#666666"
                style={styles.venueChevron}
              />
            )}
          </TouchableOpacity>
          {hasVenueAddress && addressExpanded && (
            <Text 
              style={styles.addressText} 
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.8}
            >
              {event.address}
            </Text>
          )}
        </View>
        
        <View style={styles.dateTimeRow}>
        <MaterialIcons name="access-time" size={14} color="#666666" />
        {(() => {
          const base = formatEventDateTime(event.startDate, event.startTime, event);
                      
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

          // Use existing timeStatus from the component scope
          // Use existing timeStatus from the component scope
          const showRange = (timeStatus === 'now' || timeStatus === 'today' || timeStatus === 'future') && !!rangeOrUndefined;

          const endDateSuffix =
            showRange && isFutureDate(event.endDate) ? ` • (Until ${formatEndDateLabel(event.endDate!)})` : '';

          const display = showRange
            ? `${label} • ${s}${e ? ` – ${e}` : ''}${endDateSuffix}`
            : labelWithTime;


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

              
        {/* Legacy engagement row removed to rely on hero-image badges */}
      </View>
      
      {/* Description section - Full width with content limitation */}
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
        
        {event.description && event.description.length > 80 && (
          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
              
              // Track special description expansion
              analytics.trackUserAction('description_expand', {
                event_id: event.id.toString(),
                event_type: 'special',
                expanded: !expanded,
                description_length: event.description.length
              });
            }}
            style={styles.readMoreButton}
          >
            <Text style={styles.readMoreText}>
              {expanded ? "Show less" : "Read more"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      {/* Bottom action section */}
      <View style={styles.cardBottomRow}>
        <View style={styles.leftSection}>
          <View style={[
            styles.categoryButton2,
            { backgroundColor: getCategoryColor(event.category) }
          ]}>
            <Text style={styles.categoryText}>{event.category}</Text>
          </View>
          
          {showTicketedEventBadge && (
            <View style={styles.ticketedEventBadge}>
              <Text style={styles.ticketedEventText}>Ticketed Event</Text>
            </View>
          )}
          
          {event.ticketPrice && 
           event.ticketPrice !== 'N/A' && 
           event.ticketPrice !== "0" &&
           event.ticketPrice !== "Ticketed Event" &&
           !(event.ticketPrice.toLowerCase() === "free" && showRegisterButton) && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.ticketPrice}</Text>
            </View>
          )}
          
          {showBuyTicketsButton && (
            <TouchableOpacity 
              style={[
                styles.buyTicketsButton,
                isGuest && styles.disabledPremiumButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.premiumButtonContent}>
                <Text style={[
                  styles.buyTicketsText,
                  isGuest && styles.disabledPremiumButtonText
                ]}>
                  Buy Tickets
                </Text>
                {isGuest && (
                  <MaterialIcons name="lock" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          )}

          {showRegisterButton && (
            <TouchableOpacity 
              style={[
                styles.registerButton,
                isGuest && styles.disabledPremiumButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.premiumButtonContent}>
                <Text style={[
                  styles.registerButtonText,
                  isGuest && styles.disabledPremiumButtonText
                ]}>
                  Register
                </Text>
                {isGuest && (
                  <MaterialIcons name="lock" size={12} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Action buttons with circular backgrounds - locked for guests */}
        <View style={styles.rightSection}>
          <TouchableOpacity 
            style={[
              styles.quickActionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={handleAddToCalendar}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonCircle}>
              <MaterialIcons 
                name="event" 
                size={22} 
                color={isGuest ? "#CCCCCC" : "#666666"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <MaterialIcons name="lock" size={8} color="#333333" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.quickActionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={toggleBookmark}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest || isToggling}
          >
            <View style={styles.actionButtonCircle}>
              <MaterialIcons 
                name={bookmarked ? "star" : "star-outline"} 
                size={22} 
                color={isGuest ? "#CCCCCC" : bookmarked ? "#FFD700" : "#666666"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <MaterialIcons name="lock" size={8} color="#333333" />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Memoize EventListItem to prevent re-renders when props don't change
const MemoizedEventListItem = React.memo(EventListItem, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.matchesUserInterests === nextProps.matchesUserInterests &&
    prevProps.isSaved === nextProps.isSaved &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.isFirstItem === nextProps.isFirstItem
  );
});

// Main Specials Screen component
function SpecialsScreen() {

  
  // ===============================================================
  // ANALYTICS INTEGRATION - RE-ENABLED
  // ===============================================================
  const analytics = useAnalytics();

  // 🔔 If registration begins, close any open overlays (details sheet, image lightbox)
  const overlayCloseSignal = useGuestLimitationStore(s => s.overlayCloseSignal);
  useEffect(() => {
    try {
      if (typeof handleCloseDetails === 'function') {
        handleCloseDetails();
      } else {
        setDetailsVisible?.(false);
        setSelectedEvent?.(null);
      }
    } catch {}
    try {
      if (typeof handleModalClose === 'function') {
        handleModalClose();
      } else {
        setSelectedImageData?.(null);
      }
    } catch {}
  }, [overlayCloseSignal]);

  
  
  // Track screen focus for session analytics - RE-ENABLED
  // Deferred with InteractionManager to not block tab switch
  useFocusEffect(
    useCallback(() => {
      const startTime = Date.now();

      InteractionManager.runAfterInteractions(() => {
        analytics.trackScreenView('specials', {
          content_type: 'special_list',
          user_type: isGuest ? 'guest' : 'registered'
        });
      });

      // Return cleanup function to track time spent
      return () => {
        const timeSpent = Date.now() - startTime;
        InteractionManager.runAfterInteractions(() => {
          analytics.trackEngagementDepth('specials', timeSpent, {
            interactions: 0,
            featuresUsed: ['special_list']
          });
        });
      };
    }, []) // Keep dependency array empty - this prevents the infinite loop
  );

  // Tutorial auto-advancement detection - deferred with InteractionManager
  useFocusEffect(
    useCallback(() => {
      InteractionManager.runAfterInteractions(() => {
        console.log('🔍 SPECIALS SCREEN: Screen focused, checking for tutorial');
        if ((global as any).onSpecialsScreenNavigated) {
          console.log('🔍 SPECIALS SCREEN: Calling tutorial advancement');
          (global as any).onSpecialsScreenNavigated();
        }
      });
    }, [])
  );

    // Read saved events and interests from the centralized cache (hydrated at login)
  type UserPrefsState = {
  savedEvents: string[];
  interests: string[];
  favoriteVenues: string[];
  likedEvents: string[];
  };
  const savedEvents = useUserPrefsStore((s: UserPrefsState) => s.savedEvents);
  const userInterests = useUserPrefsStore((s: UserPrefsState) => s.interests);
  const favoriteVenues = useUserPrefsStore((s: UserPrefsState) => s.favoriteVenues);

  // Guest limitation setup
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();

  // Store integration - individual selectors to prevent infinite loops
  // (Combined object selectors with shallow cause getSnapshot caching issues)
  const events = useMapStore((state) => state.events);
  const filteredEvents = useMapStore((state) => state.filteredEvents);
  const viewportEvents = useMapStore((state) => state.viewportEvents);
  const outsideViewportEvents = useMapStore((state) => state.outsideViewportEvents);
  const viewportMetadata = useMapStore((state) => state.viewportMetadata);
  const isLoading = useMapStore((state) => state.isLoading);
  const error = useMapStore((state) => state.error);
  const fetchEvents = useMapStore((state) => state.fetchEvents);
  const fetchEventDetails = useMapStore((state) => state.fetchEventDetails);
  const setTypeFilters = useMapStore((state) => state.setTypeFilters);
  const categories = useMapStore((state) => state.categories);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const userLocation = useMapStore((state) => state.userLocation);
  const getTimeFilterCounts = useMapStore((state) => state.getTimeFilterCounts);
  const getCategoryFilterCounts = useMapStore((state) => state.getCategoryFilterCounts);
  const scrollTriggers = useMapStore((state) => state.scrollTriggers);
  const isHeaderSearchActive = useMapStore((state) => state.isHeaderSearchActive);
  const setHeaderSearchActive = useMapStore((state) => state.setHeaderSearchActive);

  // --- Prefetch confirmation (specials) ---
  // Logs once on mount if cache already warm, and whenever events change.
  useEffect(() => {
    const specialsCount = events.filter(e => e.type === 'special').length;
    if (events.length > 0 && specialsCount > 0) {
      console.log(`[SpecialsScreen] Using preloaded specials from store: ${specialsCount}`);
    }
  }, [events]);

  // Memoized event lookup Map for O(1) access instead of O(n) find
  const eventLookupMap = useMemo(() => {
    const map = new Map<string, Event>();
    events.forEach(event => {
      map.set(String(event.id), event);
    });
    return map;
  }, [events]);

  // Helper function to get updated event data from store - now O(1)
  const getUpdatedEvent = useCallback((eventId: string | number) => {
    return eventLookupMap.get(String(eventId));
  }, [eventLookupMap]);

  // State management
  const [scrollY] = useState(new Animated.Value(0));
  const [headerHeight, setHeaderHeight] = useState(0);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  
  // Back to top button state
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopOpacity = useRef(new Animated.Value(0)).current;
  
  // Performance tracking for specials
  const [listLoadTime, setListLoadTime] = useState<number | null>(null);
  const [scrollStartTime, setScrollStartTime] = useState<number | null>(null);

  // Scroll to top functionality
  useEffect(() => {
    if (scrollTriggers.specials > 0) {
      console.log('[SpecialsScreen] Scroll trigger detected, scrolling to top');
      
      // Track scroll to top interaction for specials
      analytics.trackUserAction('scroll_to_top', {
        screen: 'specials',
        trigger_source: 'tab_double_tap'
      });
      
      flatListRef.current?.scrollToOffset({ 
        animated: true, 
        offset: 0 
      });
    }
  }, [scrollTriggers.specials]); // Remove analytics from dependency array

  // Screen focus detection and tab interaction tracking
  // Deferred with InteractionManager to not block tab switch
  useFocusEffect(
    React.useCallback(() => {
      InteractionManager.runAfterInteractions(() => {
        console.log('[GuestLimitation] Specials screen gained focus');

        if (isGuest) {
          console.log('[GuestLimitation] Tracking Specials tab selection for guest');
          trackTabSelect('specials');
        }
      });
    }, [isGuest])
  );
  
  // Native ads setup
  const adFrequency = 4;
  const totalEventCount = events.length;
  const calculatedAdCount = Math.ceil(totalEventCount / adFrequency);
  const minAdCount = 2;
  const maxAdCount = 10;
  const adCount = Math.max(minAdCount, Math.min(calculatedAdCount, maxAdCount));
  const nativeAds = useNativeAds(adCount, 'specials');
  
  // UI state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const detailsAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [showBanner, setShowBanner] = useState(false);
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
  } | null>(null);
  


  // Tutorial awareness for specials list
  const tutorialSpecialsListRef = useRef<View>(null);
  const specialsListPulseAnim = useRef(new Animated.Value(1)).current;
  const [specialsListHighlighted, setSpecialsListHighlighted] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightSpecialsListExplanation || false;
      if (globalFlag !== specialsListHighlighted) {
        setSpecialsListHighlighted(globalFlag);
      }
      if (globalFlag && tutorialSpecialsListRef.current) {
        tutorialSpecialsListRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          (global as any).specialsListExplanationLayout = { x, y, width, height };
          console.log('Tutorial: Measured specials list:', { x, y, width, height });
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [specialsListHighlighted]);

  useEffect(() => {
    if (specialsListHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(specialsListPulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(specialsListPulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      specialsListPulseAnim.stopAnimation();
      specialsListPulseAnim.setValue(1);
    }
  }, [specialsListHighlighted]);

  // Tutorial awareness for specials filters
  const specialsFiltersRef = useRef<View>(null);
  const specialsFiltersPulseAnim = useRef(new Animated.Value(1)).current;
  const [specialsFiltersHighlighted, setSpecialsFiltersHighlighted] = useState(false);

  useEffect(() => {
    let lastMeasurement: any = null;
    let measurementCount = 0;
    
    const interval = setInterval(() => {
      const globalFlag = (global as any).tutorialHighlightSpecialsFilters || false;
      if (globalFlag !== specialsFiltersHighlighted) {
        setSpecialsFiltersHighlighted(globalFlag);
      }
      if (globalFlag && specialsFiltersRef.current) {
        specialsFiltersRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          // Add stability check to prevent measurement spam
          const currentMeasurement = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
          
          if (!lastMeasurement || 
              Math.abs(currentMeasurement.x - lastMeasurement.x) > 2 ||
              Math.abs(currentMeasurement.y - lastMeasurement.y) > 2 ||
              Math.abs(currentMeasurement.width - lastMeasurement.width) > 2 ||
              Math.abs(currentMeasurement.height - lastMeasurement.height) > 2) {
            
            lastMeasurement = currentMeasurement;
            measurementCount++;
            
            // Only log first few measurements to prevent spam
            if (measurementCount <= 3) {
              console.log('Tutorial: Measured specials filters:', currentMeasurement);
            }
            
            (global as any).specialsFiltersLayout = currentMeasurement;
          }
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [specialsFiltersHighlighted]);

  useEffect(() => {
    if (specialsFiltersHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(specialsFiltersPulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(specialsFiltersPulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      specialsFiltersPulseAnim.stopAnimation();
      specialsFiltersPulseAnim.setValue(1);
    }
  }, [specialsFiltersHighlighted]);
  
  // Removed local fetching/listening of user prefs.
  // Now sourced from useUserPrefsStore (hydrated at login via AuthProvider).
  
  // Banner animation
  useEffect(() => {
    if (userInterests.length > 0) {
      setShowBanner(true);
      fadeAnim.setValue(1);
      
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true
        }).start(() => setShowBanner(false));
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [userInterests, filterCriteria]);
  
  // Removed Firebase listener - now handled centrally in AuthProvider.
  
  // Fetch specials data - deferred to not block initial render
  useEffect(() => {
    if (events.length === 0) {
      // Defer fetch to next tick so it doesn't block touch interactions
      setTimeout(() => {
        const startTime = Date.now();
        setListLoadTime(startTime);

        fetchEvents().then(() => {
          const loadTime = Date.now() - startTime;
          analytics.trackPerformance('specials_list_load', loadTime, {
            specials_count: events.filter(e => e.type === 'special').length,
            content_type: 'specials'
          });
          setListLoadTime(loadTime);
        }).catch((error) => {
          analytics.trackError('specials_list_load_failed', error.message, {
            user_action: 'fetch_specials'
          });
        });
      }, 0);
    }
  }, [events, fetchEvents]); // Remove analytics from dependency array
  
// NEW: Fetch enhanced details for specials that haven't been processed yet
useEffect(() => {
  if (events.length > 0) {
    // Defer heavy filtering to not block render
    setTimeout(() => {
      const specialIds = events
        .filter(event => event.type === 'special')
        .filter(event => {
          const hasBeenEnhanced = event.hasOwnProperty('fullDescription') ||
                                  event.hasOwnProperty('ticketLinkPosts') ||
                                  event.hasOwnProperty('ticketLinkEvents');
          return !hasBeenEnhanced;
        })
        .map(event => event.id);

      if (specialIds.length > 0) {
        fetchEventDetails(specialIds);
      }
    }, 0);
  }
}, [events.length]); // Trigger when events count changes
  
  // ===============================================================
  // ANALYTICS-ENHANCED FILTER HANDLERS (Special-specific)
  // ===============================================================
  
  const handleTimeFilterChange = (filter: TimeFilterType) => {
    console.log(`[GuestLimitation] Time filter click: ${filter}`);
    
    const filterChangeStartTime = Date.now();
    const previousFilter = filterCriteria.specialFilters.timeFilter;
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Filter interaction blocked - allowing action but prompt should show');
    }
    
    const newFilter = filterCriteria.specialFilters.timeFilter === filter 
      ? TimeFilterType.ALL 
      : filter;
    
    console.log(`Changing time filter from ${filterCriteria.specialFilters.timeFilter} to: ${newFilter}`);
    
    setTypeFilters('special', { timeFilter: newFilter });
    
    // Track special-specific filter effectiveness
    setTimeout(() => {
      const filterChangeTime = Date.now() - filterChangeStartTime;
      const timeFilterCounts = getTimeFilterCounts('special');
      
      analytics.trackEventFilter('time', newFilter, {
        previous_filter: previousFilter,
        result_count: timeFilterCounts[newFilter] || 0,
        filter_change_time_ms: filterChangeTime,
        content_type: 'specials', // Special-specific
        is_guest: isGuest
      });
      
      // Track special filter effectiveness
      analytics.trackUserAction('special_filter_effectiveness', {
        filter_type: 'time',
        filter_value: newFilter,
        result_count: timeFilterCounts[newFilter] || 0,
        response_time_ms: filterChangeTime
      });
    }, 100);
  };

  const handleSavedFilterToggle = () => {
    console.log('[GuestLimitation] Saved filter click');
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Saved filter interaction blocked - allowing action but prompt should show');
    }
    
    const currentlyFiltering = filterCriteria.specialFilters.savedOnly === true;
    const newSavedFilter = !currentlyFiltering;
    
    // Track special saved filter usage
    analytics.trackEventFilter('saved', newSavedFilter.toString(), {
      previous_value: currentlyFiltering.toString(),
      saved_specials_count: savedEvents.length,
      content_type: 'specials',
      is_guest: isGuest
    });
    
    setTypeFilters('special', { savedOnly: newSavedFilter });
  };

  const handleCategoryClearFilter = () => {
    console.log('[GuestLimitation] Category clear filter click');
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category clear filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track special category filter clear
    analytics.trackEventFilter('category', 'clear', {
      previous_category: filterCriteria.specialFilters.category || 'none',
      content_type: 'specials',
      is_guest: isGuest
    });
    
    setTypeFilters('special', { category: undefined });
  };

  const handleCategorySelect = (category: string) => {
    console.log(`[GuestLimitation] Category filter click: ${category}`);
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track special category filter selection with effectiveness metrics
    setTimeout(() => {
      const categoryFilterCounts = getCategoryFilterCounts('special');
      
      analytics.trackEventFilter('category', category, {
        result_count: categoryFilterCounts[category] || 0,
        user_has_interest: userInterests.includes(category),
        content_type: 'specials',
        is_guest: isGuest
      });
    }, 100);
  };

  // Get dynamic filter counts
  const timeFilterCounts = getTimeFilterCounts('special');
  const categoryFilterCounts = getCategoryFilterCounts('special');
  
  // Helper functions
  const matchesUserInterests = (event: Event): boolean => {
    if (!userInterests || userInterests.length === 0) return false;
    return userInterests.some(interest => 
      interest.toLowerCase() === event.category.toLowerCase()
    );
  };
  
  const isEventSaved = (event: Event): boolean => {
    if (!savedEvents || savedEvents.length === 0) return false;
    return savedEvents.includes(event.id.toString());
  };

  // ===============================================================
  // ANALYTICS-ENHANCED EVENT HANDLERS (Special-specific)
  // ===============================================================
  
  const handleEventPress = (event: Event) => {
    console.log(`[GuestLimitation] Special press: ${event.title}`);
    
    // Track special discovery and interaction
    const specialDiscoveryData = {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      venue_name: event.venue,
      discovery_method: 'list_view',
      matches_user_interests: matchesUserInterests(event),
      is_saved: isEventSaved(event),
      time_status: getEventTimeStatus(event),
      has_ticket_price: !!event.ticketPrice,
      is_guest: isGuest,
      list_position: [...sortedViewportSpecials, ...sortedOutsideViewportSpecials].findIndex(e => e.id === event.id) + 1,
      total_list_items: sortedViewportSpecials.length + sortedOutsideViewportSpecials.length
    };
    
    // Track special view
    analytics.trackEventViewWithContext(specialDiscoveryData);
    
    // Track special-specific content discovery
    analytics.trackUserAction('special_discovery', {
      ...specialDiscoveryData,
      discovery_source: 'specials_list'
    });
    
    if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
      console.log('[GuestLimitation] Special click interaction blocked - allowing action but prompt should show');
    }
    
    const imageUrl = event.imageUrl || event.profileUrl;
    
    if (imageUrl) {
      console.log('CARD PRESSED - Opening lightbox for:', imageUrl);
      handleImagePress(imageUrl, event);
    } else {
      setSelectedEvent(event);
      setDetailsVisible(true);
      
      Animated.spring(detailsAnimation, {
        toValue: 0,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
    }
  };

  const handleImagePress = (imageUrl: string, event: Event) => {
    console.log(`[GuestLimitation] Image press: ${event.title}`);
    
    // Track special image interaction
    analytics.trackUserAction('special_image_view', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      image_type: event.imageUrl ? 'post_image' : 'profile_image',
      discovery_method: 'list_view',
      is_guest: isGuest
    });
    
    if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
      console.log('[GuestLimitation] Image click interaction blocked - allowing action but prompt should show');
    }
    
    setSelectedImageData({ imageUrl, event });
  };

  // ===============================================================
  // ENHANCED SCROLL HANDLER WITH SPECIAL-SPECIFIC ANALYTICS
  // ===============================================================
  
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: false,
      listener: (event: any) => {
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const scrollDiff = currentScrollY - lastScrollY.current;
        
        // Track scroll start for engagement metrics
        if (!scrollStartTime && currentScrollY > 0) {
          setScrollStartTime(Date.now());
        }
        
        // Track scroll interaction for guests
        if (isGuest && currentScrollY > 0) {
          trackScrollInteraction('specials');
        }
        
        // Back to top button visibility logic
        const shouldShowBackToTop = currentScrollY > SCREEN_HEIGHT;
        if (shouldShowBackToTop !== showBackToTop) {
          setShowBackToTop(shouldShowBackToTop);
          Animated.timing(backToTopOpacity, {
            toValue: shouldShowBackToTop ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
        
        // Track scroll depth for special-specific engagement analytics
        const contentHeight = (sortedViewportSpecials.length + sortedOutsideViewportSpecials.length) * 200;
        const scrollPercentage = Math.floor((currentScrollY / contentHeight) * 100);
        
        if (scrollPercentage > 0 && scrollPercentage % 25 === 0) {
          analytics.trackUserAction('special_scroll_depth', {
            screen: 'specials',
            scroll_percentage: scrollPercentage,
            content_type: 'specials_list',
            scroll_direction: scrollDiff > 0 ? 'down' : 'up'
          });
        }
        
        // Header collapse animation
        if (headerHeight > 0 && Math.abs(scrollDiff) > 5) {
          if (scrollDiff > 0 && currentScrollY > 50 && !isHeaderCollapsed) {
            setIsHeaderCollapsed(true);
            Animated.timing(headerTranslateY, {
              toValue: -headerHeight,
              duration: 300,
              useNativeDriver: true,
            }).start();
          } else if (scrollDiff < 0 && isHeaderCollapsed) {
            setIsHeaderCollapsed(false);
            Animated.timing(headerTranslateY, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }).start();
          }
        }
        
        lastScrollY.current = currentScrollY;
      },
    }
  );

  // Handle back to top button press
  const handleBackToTop = () => {
    analytics?.trackUserAction('back_to_top_pressed', {
      screen: 'specials',
      scroll_position: lastScrollY.current
    });
    
    flatListRef.current?.scrollToOffset({ 
      animated: true, 
      offset: 0 
    });
  };

  // Filter viewport specials
  const filteredViewportSpecials = useMemo(() => {
    let filtered = viewportEvents.filter(event => event.type === 'special');

    if (filterCriteria.specialFilters.savedOnly) {
      filtered = filtered.filter(e => isEventSaved(e));
    }

    filtered = filtered.filter(e => doesEventMatchTypeFilters(e, filterCriteria.specialFilters));

    return filtered;
  }, [viewportEvents, filterCriteria, savedEvents]);

  // Filter outside-viewport specials
  const filteredOutsideViewportSpecials = useMemo(() => {
    let filtered = outsideViewportEvents.filter(event => event.type === 'special');

    if (filterCriteria.specialFilters.savedOnly) {
      filtered = filtered.filter(e => isEventSaved(e));
    }

    filtered = filtered.filter(e => doesEventMatchTypeFilters(e, filterCriteria.specialFilters));

    return filtered;
  }, [outsideViewportEvents, filterCriteria, savedEvents]);

  // Enhanced sorting with special-specific analytics tracking
  const sortAndPrioritizeSpecials = (specials: Event[]): Event[] => {
    const sortStartTime = Date.now();
    
    const specialsWithScores = specials.map(special => {
      const isSaved = isEventSaved(special);
      const timeStatus = getEventTimeStatus(special);
      const matchesInterest = matchesUserInterests(special);

      // Check if special is from a favorite venue
      const specialLocationKey = createLocationKeyFromEvent(special);
      const isFromFavoriteVenue = favoriteVenues.includes(specialLocationKey);

      const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
      const baseScore = BASE_SCORES[scoreCategory][timeStatus];

      let proximityMultiplier = 1.0;
      let distance = Infinity;

      if (userLocation) {
        distance = calculateDistance(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          special.latitude,
          special.longitude
        );

        for (const band of DISTANCE_BANDS) {
          if (distance <= band.maxDistance) {
            proximityMultiplier = band.multiplier;
            break;
          }
        }
      }

      const engagementTierPoints = calculateEngagementTier(special);
      // Add favorite venue bonus to composite score
      const favoriteVenueBonus = isFromFavoriteVenue ? FAVORITE_VENUE_BONUS : 0;
      const compositeScore = (baseScore * proximityMultiplier) + engagementTierPoints + favoriteVenueBonus;
      
      // DEBUG: Log details for ALL specials to compare scoring
     // if (true) {
     //   console.log(`[DEBUG] ${special.title} Scoring:`, {
     //     title: special.title,
     //     venue: special.venue,
     //     isSaved,
     //     timeStatus,
      //    matchesInterest,
     //     baseScore,
    //      coordinates: { lat: special.latitude, lng: special.longitude },
    //      distance: distance.toFixed(0) + 'm',
    //      proximityMultiplier,
    //      engagementTierPoints,
    //      compositeScore: compositeScore.toFixed(1),
    //      userLocation: userLocation ? `${userLocation.coords.latitude.toFixed(4)}, ${userLocation.coords.longitude.toFixed(4)}` : 'null'
    //    });
    //  }
      
     
      return {
        event: special,
        isSaved,
        isFromFavoriteVenue,
        timeStatus,
        compositeScore,
        distance
      };
    });
    
    // Group and sort (same logic as events)
    const savedNowSpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'now'
    );
    const savedTodaySpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'today'
    );
    const savedFutureSpecials = specialsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'future'
    );
    const unsavedSpecials = specialsWithScores.filter(item => !item.isSaved);
    
    [savedNowSpecials, savedTodaySpecials, savedFutureSpecials, unsavedSpecials].forEach(group => {
      group.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) {
          return b.compositeScore - a.compositeScore;
        }
        return a.distance - b.distance;
      });
    });
    
    const sortedSpecials = [
      ...savedNowSpecials.map(item => item.event),
      ...savedTodaySpecials.map(item => item.event),
      ...savedFutureSpecials.map(item => item.event),
      ...unsavedSpecials.map(item => item.event)
    ];

    // DEBUG: Log the first 3 events to see ranking
   // console.log('[DEBUG] Top 3 Specials Ranking:', sortedSpecials.slice(0, 3).map((event, index) => ({
   //   position: index + 1,
   //   title: event.title,
   //   venue: event.venue,
   //   isSaved: isEventSaved(event),
   //   matchesInterest: matchesUserInterests(event)
   // })));
    
    // Track special sorting performance
    const sortTime = Date.now() - sortStartTime;
    analytics.trackPerformance('specials_sort', sortTime, {
      specials_count: specials.length,
      sort_time_ms: sortTime,
      has_user_location: !!userLocation,
      user_interests_count: userInterests.length
    });
    
    return sortedSpecials;
  };

  // Apply priority sorting to viewport section (small, sorts immediately)
  const sortedViewportSpecials = useMemo(() => {
    return sortAndPrioritizeSpecials(filteredViewportSpecials);
  }, [filteredViewportSpecials, userLocation, savedEvents, favoriteVenues]);

  // Lazy-sort outside-viewport specials: only sort what we need for display
  // This prevents sorting hundreds of specials when FlatList only shows 10 initially
  const sortedOutsideViewportSpecials = useMemo(() => {
    // Only sort up to what we're displaying + one batch ahead for smooth scrolling
    const maxToSort = outsideViewportLoadCount + 20; // loadMoreBatchSize buffer
    if (filteredOutsideViewportSpecials.length <= maxToSort) {
      // Small list, sort all of it
      return sortAndPrioritizeSpecials(filteredOutsideViewportSpecials);
    }
    // Large list: sort only what we need
    const specialsToSort = filteredOutsideViewportSpecials.slice(0, maxToSort);
    return sortAndPrioritizeSpecials(specialsToSort);
  }, [filteredOutsideViewportSpecials, outsideViewportLoadCount, userLocation, savedEvents, favoriteVenues]);

  // State for pagination of outside-viewport specials
  const [outsideViewportLoadCount, setOutsideViewportLoadCount] = useState(10);
  const loadMoreBatchSize = 20;

  // Create specials with ads list
  type SpecialListItem = {
    type: 'special';
    data: Event;
  };

  type DividerItem = {
    type: 'divider';
    data: {
      message: string;
      count: number;
    };
  };

  type AdListItem = {
    type: 'ad';
    data: {
      ad: any;
      loading: boolean;
      key: string;
      allowMedia: boolean;
    };
  };
  
  type ListItem = SpecialListItem | DividerItem | AdListItem;

  const getAdListKey = useCallback(
    (entry: { ad: any; loading: boolean }, occurrenceIndex: number) => {
      const ad = entry.ad;
      const headline = typeof ad?.headline === 'string' ? ad.headline : 'none';
      const advertiser = typeof ad?.advertiser === 'string' ? ad.advertiser : 'none';
      const body = typeof ad?.body === 'string' ? ad.body : 'none';
      return `ad-${occurrenceIndex}-${headline}-${advertiser}-${body}`
        .toLowerCase()
        .replace(/\s+/g, '-');
    },
    []
  );

  const getAdSignature = useCallback((entry: { ad: any; loading: boolean }) => {
    const ad = entry.ad;
    const headline = typeof ad?.headline === 'string' ? ad.headline : 'none';
    const advertiser = typeof ad?.advertiser === 'string' ? ad.advertiser : 'none';
    const body = typeof ad?.body === 'string' ? ad.body : 'none';
    return `${headline}::${advertiser}::${body}`.toLowerCase().trim();
  }, []);
  
  const specialsWithAds = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    const adFrequency = 4;
    let adIndex = 0;
    const adOccurrenceCounts = new Map<string, number>();

    // Add viewport specials with ads
    sortedViewportSpecials.forEach((special, index) => {
      result.push({ type: 'special', data: special });

      // Insert ad every 4 specials
      if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
        const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
        if (validAds.length > 0) {
          const selectedAd = validAds[adIndex % validAds.length];
          const adSignature = getAdSignature(selectedAd);
          const nextOccurrence = (adOccurrenceCounts.get(adSignature) ?? 0) + 1;
          adOccurrenceCounts.set(adSignature, nextOccurrence);
          result.push({
            type: 'ad',
            data: {
              ...selectedAd,
              key: getAdListKey(selectedAd, adIndex),
              allowMedia: nextOccurrence === 1,
            }
          });
          adIndex++;
        }
      }
    });

    // Add divider if outside-viewport specials exist
    // Use filteredOutsideViewportSpecials.length for accurate total count
    if (filteredOutsideViewportSpecials.length > 0) {
      result.push({
        type: 'divider',
        data: {
          message: 'Specials outside your current map view',
          count: filteredOutsideViewportSpecials.length
        }
      });
    }

    // Add outside-viewport specials (paginated) with ads interspersed
    const outsideViewportToShow = sortedOutsideViewportSpecials.slice(0, outsideViewportLoadCount);
    outsideViewportToShow.forEach((special, index) => {
      result.push({ type: 'special', data: special });

      // Continue inserting ads every 4 specials in outside-viewport section
      if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
        const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
        if (validAds.length > 0) {
          const selectedAd = validAds[adIndex % validAds.length];
          const adSignature = getAdSignature(selectedAd);
          const nextOccurrence = (adOccurrenceCounts.get(adSignature) ?? 0) + 1;
          adOccurrenceCounts.set(adSignature, nextOccurrence);
          result.push({
            type: 'ad',
            data: {
              ...selectedAd,
              key: getAdListKey(selectedAd, adIndex),
              allowMedia: nextOccurrence === 1,
            }
          });
          adIndex++;
        }
      }
    });

    // Low-count fallback for viewport section
    if (sortedViewportSpecials.length > 0 && sortedViewportSpecials.length < adFrequency && nativeAds.length > 0 && sortedOutsideViewportSpecials.length === 0) {
      const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
      if (validAds.length > 0) {
        const selectedAd = validAds[0];
        const adSignature = getAdSignature(selectedAd);
        const nextOccurrence = (adOccurrenceCounts.get(adSignature) ?? 0) + 1;
        adOccurrenceCounts.set(adSignature, nextOccurrence);
        result.push({
          type: 'ad',
          data: {
            ...selectedAd,
            key: getAdListKey(selectedAd, adIndex),
            allowMedia: nextOccurrence === 1,
          }
        });
      }
    }

    return result;
  }, [getAdListKey, getAdSignature, sortedViewportSpecials, sortedOutsideViewportSpecials, filteredOutsideViewportSpecials.length, nativeAds, outsideViewportLoadCount]);

  // Pre-compute lookup Sets for O(1) access during render
  const interestMatchSet = useMemo(() => {
    if (!userInterests || userInterests.length === 0) return new Set<string>();
    const lowerInterests = userInterests.map(i => i.toLowerCase());
    const matchingIds = new Set<string>();
    specialsWithAds.forEach(item => {
      if (item.type === 'special' && lowerInterests.includes(item.data.category.toLowerCase())) {
        matchingIds.add(String(item.data.id));
      }
    });
    return matchingIds;
  }, [specialsWithAds, userInterests]);

  const savedEventSet = useMemo(() => {
    return new Set(savedEvents || []);
  }, [savedEvents]);

  // Find first special index once instead of O(n) for each item
  const firstSpecialIndex = useMemo(() => {
    return specialsWithAds.findIndex(item => item.type === 'special');
  }, [specialsWithAds]);

  // Memoized FlatList callbacks to prevent unnecessary re-renders
  const keyExtractor = useCallback((item: any, index: number) => {
    if (item.type === 'special') return `special-${item.data.id}`;
    if (item.type === 'ad') return item.data.key;
    if (item.type === 'divider') return `divider-${index}`;
    return `item-${index}`;
  }, []);

  const listEmptyComponent = useMemo(() => (
    <View style={styles.emptyContainer}>
      <Text style={styles.statusText}>
        No specials match your current filters
      </Text>
    </View>
  ), []);

  const handleEndReached = useCallback(() => {
    handleLoadMoreOutsideViewport();
    analytics.trackUserAction('specials_list_end_reached', {
      screen: 'specials',
      total_items: specialsWithAds.length,
      scroll_engagement: 'high'
    });
  }, [specialsWithAds.length, analytics, handleLoadMoreOutsideViewport]);

  const contentContainerStyleMemo = useMemo(() => [
    styles.listContent,
    { paddingTop: Math.max(headerHeight, 120) + (showBanner ? 35 : 0) + 8 }
  ], [headerHeight, showBanner]);

  // Track special priority effectiveness
  useEffect(() => {
    if (sortedViewportSpecials.length > 0) {
      const topSpecials = sortedViewportSpecials.slice(0, 10);
      const interestMatches = topSpecials.filter(e => matchesUserInterests(e)).length;
      const savedSpecialsInTop = topSpecials.filter(e => isEventSaved(e)).length;

      analytics.trackUserAction('special_priority_effectiveness', {
        top_10_interest_matches: interestMatches,
        top_10_saved_specials: savedSpecialsInTop,
        viewport_specials: sortedViewportSpecials.length,
        outside_viewport_specials: sortedOutsideViewportSpecials.length,
        total_specials: sortedViewportSpecials.length + sortedOutsideViewportSpecials.length,
        user_interests_count: userInterests.length,
        personalization_score: (interestMatches + savedSpecialsInTop) / 10
      });
    }
  }, [sortedViewportSpecials, sortedOutsideViewportSpecials, userInterests, savedEvents]); // Remove analytics from dependency array
  
  // Close special details
  const handleCloseDetails = () => {
    Animated.spring(detailsAnimation, {
      toValue: SCREEN_HEIGHT,
      useNativeDriver: true,
      friction: 8,
      tension: 40
    }).start(() => {
      setDetailsVisible(false);
      setSelectedEvent(null);
    });
  };
  
  // Handle modal close
  const handleModalClose = () => {
    setSelectedImageData(null);
  };
  
  // Loading state
  if (isLoading && events.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={BRAND.primary} />
        <Text style={styles.statusText}>Loading specials...</Text>
      </View>
    );
  }
  
  // Error state
  if (error) {
    // Track special error state
    analytics.trackError('specials_list_error', error, {
      screen: 'specials',
      user_action: 'view_specials_list'
    });

    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  // Divider component
  const DividerComponent: React.FC<{ message: string; count: number }> = ({ message, count }) => {
    return (
      <View style={styles.viewportDivider}>
        <View style={styles.dividerLine} />
        <View style={styles.dividerTextContainer}>
          <MaterialIcons name="location-off" size={18} color="#999" />
          <Text style={styles.dividerText}>
            {message} ({count})
          </Text>
        </View>
        <View style={styles.dividerLine} />
      </View>
    );
  };

  // Handle loading more outside-viewport specials
  const handleLoadMoreOutsideViewport = useCallback(() => {
    setOutsideViewportLoadCount(prev => prev + loadMoreBatchSize);
  }, []);

  return (
    <View style={styles.container}>
      {isHeaderSearchActive && (
        <Pressable
          onPress={() => { setHeaderSearchActive(false); Keyboard.dismiss(); }}
          style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}
        />
      )}
      {/* Collapsible Header */}
      <Animated.View 
        style={[
          styles.collapsibleHeader,
          { transform: [{ translateY: headerTranslateY }] }
        ]}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          console.log('Header height measured:', height);
          setHeaderHeight(height + 5);
        }}
      >
{/* Filtering section */}
<Animated.View 
  style={[
    specialsFiltersHighlighted ? {
      // iOS: shadow* used. Android: elevation used. Both need a SOLID background for perf.
      // Using an opaque color prevents the Android "shadow cannot be calculated efficiently" warning
      // and reduces overdraw/jank during mount/scroll.
      shadowColor: '#FF6B35',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 12,
      elevation: 15,
      borderWidth: 3,
      borderColor: '#FF8C42',
      borderRadius: 12,
      backgroundColor: '#FFFFFF', // ← was rgba(255,255,255,0.95)
      transform: [{ scale: specialsFiltersPulseAnim }],
    } : {}
  ]}

        >
          <View 
            ref={specialsFiltersRef}
            style={styles.filtersContainer}
            onLayout={() => {
              // Immediate measurement for tutorial
              if ((global as any).tutorialHighlightSpecialsFilters && specialsFiltersRef.current) {
                specialsFiltersRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                  (global as any).specialsFiltersLayout = { x, y, width, height };
                });
              }
            }}
          >
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.filterSectionTitle}>When</Text>
              <TouchableOpacity 
                onPress={() => handleTimeFilterChange(TimeFilterType.ALL)}
                style={styles.filterClearButton}
              >
                <Text style={styles.clearButtonText}>
                  {filterCriteria.specialFilters.timeFilter === TimeFilterType.ALL ? "Showing All" : "Show All"}
                </Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.timeFilterContainer}
              contentContainerStyle={styles.timeFilterContentContainer}
            >
              <TouchableOpacity
                style={[
                  styles.timeFilterPill,
                  styles.timeFilterPillNow,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterPill
                ]}
                onPress={() => handleTimeFilterChange(TimeFilterType.NOW)}
              >
                <MaterialIcons 
                  name="access-time" 
                  size={14} 
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW ? '#FFFFFF' : '#666666'} 
                  style={styles.timeFilterIcon}
                />
                <Text style={[
                  styles.timeFilterText,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterText
                ]}>
                  Happening Now ({timeFilterCounts[TimeFilterType.NOW]})
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.timeFilterPill,
                  styles.timeFilterPillToday,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterPill
                ]}
                onPress={() => handleTimeFilterChange(TimeFilterType.TODAY)}
              >
                <MaterialIcons 
                  name="today" 
                  size={14} 
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY ? '#FFFFFF' : '#666666'} 
                  style={styles.timeFilterIcon}
                />
                <Text style={[
                  styles.timeFilterText,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterText
                ]}>
                  Today ({timeFilterCounts[TimeFilterType.TODAY]})
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.timeFilterPill,
                  styles.timeFilterPillTomorrow,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.TOMORROW && styles.activeTimeFilterPill
                ]}
                onPress={() => handleTimeFilterChange(TimeFilterType.TOMORROW)}
              >
                <MaterialIcons 
                  name="wb-sunny" 
                  size={14} 
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.TOMORROW ? '#FFFFFF' : '#666666'} 
                  style={styles.timeFilterIcon}
                />
                <Text style={[
                  styles.timeFilterText,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.TOMORROW && styles.activeTimeFilterText
                ]}>
                  Tomorrow ({timeFilterCounts[TimeFilterType.TOMORROW]})
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.timeFilterPill,
                  styles.timeFilterPillUpcoming,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterPill
                ]}
                onPress={() => handleTimeFilterChange(TimeFilterType.UPCOMING)}
              >
                <MaterialIcons 
                  name="event" 
                  size={14} 
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING ? '#FFFFFF' : '#666666'} 
                  style={styles.timeFilterIcon}
                />
                <Text style={[
                  styles.timeFilterText,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterText
                ]}>
                  Upcoming ({timeFilterCounts[TimeFilterType.UPCOMING]})
                </Text>
              </TouchableOpacity>
            </ScrollView>
            
            <View style={styles.filterDivider} />
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.filterSectionTitle}>Category</Text>
              <TouchableOpacity 
                onPress={handleCategoryClearFilter}
                style={styles.filterClearButton}
              >
                <Text style={styles.clearButtonText}>
                  {filterCriteria.specialFilters.category === undefined ? "Showing All" : "Show All"}
                </Text>
              </TouchableOpacity>
            </View>
            
            {(() => {
              const sortedCounts = sortCategoriesByPriorityAndCount(categoryFilterCounts, userInterests);
              
              return (
                <CategoryFilterOptions 
                  type="special" 
                  counts={sortedCounts}
                  onCategorySelect={handleCategorySelect}
                />
              );
            })()}
          </View>
        </Animated.View>
      </Animated.View>
      
      {/* User preferences banner */}
      {showBanner && userInterests.length > 0 && (
        <Animated.View style={[
          styles.preferencesBar, 
          { 
            opacity: fadeAnim,
            top: Math.max(headerHeight, 120)
          }
        ]}>
          <Text style={styles.preferencesText}>
            Prioritizing specials by your interests
          </Text>
        </Animated.View>
      )}
         
      {/* Specials list with ads */}
      <FlatList
        ref={flatListRef}
        data={specialsWithAds}
        keyExtractor={keyExtractor}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={contentContainerStyleMemo}
        renderItem={({ item, index }) => {
          if (item.type === 'divider') {
            return <DividerComponent message={item.data.message} count={item.data.count} />;
          }

          if (item.type === 'ad') {
            return (
              <View style={styles.adContainer}>
                {SPECIALS_NATIVE_AD_PLACEHOLDER_DEBUG ? (
                  <View style={styles.placeholderAdCard}>
                    <View style={styles.placeholderAdBadge}>
                      <Text style={styles.placeholderAdBadgeText}>Sponsored</Text>
                    </View>
                    <View style={styles.placeholderAdContent}>
                      <Text style={styles.placeholderAdTitle}>Specials Ad Placeholder</Text>
                      <Text style={styles.placeholderAdBody}>
                        Native ad view disabled here for preview isolation.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <FullSizeSdkAdCard
                    key={item.data.key}
                    nativeAd={item.data.ad}
                    loading={item.data.loading}
                    allowMedia={item.data.allowMedia}
                  />
                )}
              </View>
            );
          }

          // item.type === 'special'
          // Use pre-computed firstSpecialIndex (O(1)) instead of slice+filter (O(n))
          const isFirstSpecialItem = index === firstSpecialIndex;
          const specialId = String(item.data.id);
          const specialData = getUpdatedEvent(item.data.id) || item.data;

          return (
            <MemoizedEventListItem
              event={specialData}
              onPress={() => handleEventPress(specialData)}
              onImagePress={handleImagePress}
              isSaved={savedEventSet.has(specialId)}
              matchesUserInterests={interestMatchSet.has(specialId)}
              isGuest={isGuest}
              analytics={analytics}
              isFirstItem={isFirstSpecialItem}
            />
          );
        }}
        ListEmptyComponent={listEmptyComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        // Performance optimizations for large lists
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />

      {/* Special details bottom sheet */}
      {detailsVisible && selectedEvent && (
        <Animated.View 
          style={[
            styles.detailsContainer, 
            { transform: [{ translateY: detailsAnimation }] }
          ]}
        >
          <View style={styles.detailsHeader}>
            <View style={styles.headerHandle} />
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={handleCloseDetails}
            >
              <MaterialIcons name="close" size={24} color="#666666" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.detailsContent}>
            <Text style={styles.detailsTitle}>{selectedEvent.title}</Text>
          </View>
        </Animated.View>
      )}
      
      {/* Image Lightbox */}
      {selectedImageData && (
        <Modal
          transparent={true}
          visible={!!selectedImageData}
          animationType="fade"
          onRequestClose={handleModalClose}
          statusBarTranslucent={true}
        >
          <EventImageLightbox
            imageUrl={selectedImageData.imageUrl}
            event={selectedImageData.event}
            onClose={handleModalClose}
          />
        </Modal>
      )}

      {/* Back to top button */}
      {showBackToTop && (
        <Animated.View
          style={[
            styles.backToTopButton,
            {
              opacity: backToTopOpacity,
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
              size={24} 
              color="#FFFFFF" 
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Guest limitation registration prompt */}
      {isGuest && <RegistrationPrompt />}
    </View>
  );
}

// Styles - Updated with hero image layout
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 3,
  },
  collapsibleHeader: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  listContent: {
    paddingVertical: 16,
    paddingTop: 0,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 12,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#E94E77',
    textAlign: 'center',
  },
  adContainer: {
    height: FULL_SIZE_SDK_AD_ROW_HEIGHT,
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    marginBottom: 12, // Changed from borderBottomWidth to margin
    overflow: 'hidden',
  },
  placeholderAdCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
  },
  placeholderAdBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F97316',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  placeholderAdBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  placeholderAdContent: {
    gap: 6,
  },
  placeholderAdTitle: {
    color: '#9A3412',
    fontSize: 16,
    fontWeight: '700',
  },
  placeholderAdBody: {
    color: '#7C2D12',
    fontSize: 14,
    lineHeight: 20,
  },
  preferencesBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#F5F9FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 6,
    borderBottomColor: '#E8E8E8',
    zIndex: 15,
    elevation: 15,
  },
  preferencesText: {
    fontSize: 14,
    color: BRAND.primary,
    textAlign: 'center',
  },
  filtersContainer: {
    backgroundColor: '#F8F8F8',
    paddingTop: 1,
    paddingBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 1,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
  },
  filterClearButton: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  clearButtonText: {
    fontSize: 11,
    color: BRAND.primary,
    fontWeight: '500',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 1,
  },
  timeFilterContainer: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  timeFilterContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  timeFilterPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeFilterPillNow: {
    marginRight: 6,
  },
  timeFilterPillToday: {
    marginRight: 6,
  },
  timeFilterPillTomorrow: {
    marginRight: 6,
  },
  timeFilterPillUpcoming: {
    marginRight: 6,
  },
  timeFilterIcon: {
    marginRight: 4,
  },
  activeTimeFilterPill: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  activeSavedFilterPill: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  timeFilterText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  activeTimeFilterText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  // Updated card styles - Hero image layout
  eventCard: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 0,
    overflow: 'hidden',
    position: 'relative',
    // NEW: Rounded border around each card
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    marginHorizontal: 2, // Add side margins so border is visible
    marginRight: 4,
    marginBottom: 4, // Replace bottom border with margin
    // NEW: Add subtle shadow to match hero image effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  nowEventCard: {
    borderLeftColor: '#34A853',
    borderLeftWidth: 4,
    backgroundColor: '#FAFFF9',
  },
  interestMatchCard: {
    borderLeftColor: BRAND.primary,
    borderLeftWidth: 4,
    backgroundColor: '#F5F9FF',
  },
  savedCard: {
    borderLeftColor: '#FFD700',
    borderLeftWidth: 4,
    backgroundColor: '#FFFBEB',
  },
  cardIndicator: {
    width: 3,
    height: '100%',
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  badgeContainer: {
    position: 'absolute',
    top: 5,
    right: 5,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  nowBadge: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
  },
  forYouBadge: {
    backgroundColor: BRAND.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactBadge: {
    marginLeft: 3,
  },
  iconOnlyBadge: {
    paddingHorizontal: 5,
  },
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
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  // NEW: Hero Image Section (replaces old cardTopSection)
  heroImageSection: {
    width: '100%',
    position: 'relative', // For proper badge positioning
    paddingHorizontal: 0, // Add horizontal padding so image isn't full width
    paddingBottom: 16, // Add space below image
    // Create strong "window frame" shadow effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  // Add new style for image container background
  heroImageContainer: {
    backgroundColor: '#F8F8F8', // Subtle background behind the image
    borderRadius: 16, // Slightly larger radius than image
    padding: 0, // Creates visible background border
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  heroImage: {
    width: '100%',
    height: 300, // Reduced from 200px to be less imposing
    backgroundColor: '#F0F0F0',
    borderRadius: 12, // Add rounded corners like other cards
    // Strong border to create "photo frame" effect
    borderWidth: 3,
    borderColor: '#FFFFFF',
    // Enhanced shadow for 3D "pop out" effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
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
  heroEngagementBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
  },
  // Venue profile picture overlay - top left of hero image
  venueProfileOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
  },
  venueProfileImageContainer: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  venueProfileImageSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  venueFavoriteButtonOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    zIndex: 11,
  },
  venueFavoriteButtonSmall: {
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  // Content Section - Now below the hero image (updated from old contentSection)
  contentSection: {
    paddingHorizontal: 16, // Horizontal padding for edge spacing
    paddingVertical: 12,
    paddingTop: 4, // Reduced since we have spacing from heroImageSection
    paddingBottom: 8, // Reduced to closer connect with description
  },
  // Added new description section that takes full width
  descriptionSection: {
    paddingHorizontal: 16, // Match horizontal padding with top section
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 4,
  },
  venueContainer: {
    marginBottom: 4,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  venueRowInteractive: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    borderRadius: 6,
  },
  venueText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    marginRight: 6,
    flexShrink: 1,
    flexGrow: 0,
  },
  venueTextActive: {
    color: BRAND.primaryDark,
  },
  addressText: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 18,
    marginTop: 2,
  },
  venueChevron: {
    marginLeft: 2,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateTimeText: {
    fontSize: 13,
    color: '#666666',
    marginLeft: 4,
    flex: 1,
  },
  // (remove these three style entries entirely—no replacement needed)
  cardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
  },
  linkText: {
    color: BRAND.primary,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  readMoreButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  readMoreText: {
    color: BRAND.primary,
    fontWeight: '500',
    fontSize: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
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
  categoryButton2: { 
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  ticketedEventBadge: {
    backgroundColor: '#F0F8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: BRAND.primary,
  },
  ticketedEventText: {
    color: BRAND.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  priceTag: {
    backgroundColor: '#FFF0F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  priceText: {
    color: BRAND.accent,
    fontSize: 12,
    fontWeight: '500',
  },
  buyTicketsButton: {
    backgroundColor: BRAND.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
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
  actionButtonCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  detailsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    height: SCREEN_HEIGHT * 0.8,
    zIndex: 5,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    position: 'relative',
  },
  headerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
  },
  closeButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    padding: 5,
  },
  detailsContent: {
    flex: 1,
    padding: 16,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333333',
    marginBottom: 10,
  },
  backToTopButton: {
    position: 'absolute',
    bottom: 15, // Positioned above the tab bar
    alignSelf: 'center',
    zIndex: 1000,
  },
  backToTopButtonInner: {
    backgroundColor: 'rgba(30, 144, 255, 0.9)', // Semi-transparent
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  viewportDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    paddingHorizontal: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  dividerText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
    heroEngagementBadgeLiked: {
    borderColor: BRAND.primary,
    backgroundColor: '#EBF4FF',
  },
  heroEngagementBadgeInterested: {
    borderColor: '#34A853',
    backgroundColor: '#E8F5E9',
  },

});

export default SpecialsScreen;
