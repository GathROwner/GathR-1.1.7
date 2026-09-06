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
  Linking,
  GestureResponderEvent,
  TextInput,
  Alert,
  Keyboard,
  Pressable,
  InteractionManager,
  Platform,
  useColorScheme
} from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import FallbackImage from '../../components/common/FallbackImage';
import TicketCtaPill from '../../components/common/TicketCtaPill';
import EventActionLinkPill from '../../components/common/EventActionLinkPill';
import FamilyFriendlyBadge from '../../components/common/FamilyFriendlyBadge';
import { EventTimingBadge } from '../../components/common/EventTimingBadge';
import { EventTimingSummaryText } from '../../components/common/EventTimingSummaryText';
import { EventSeriesContextLine } from '../../components/common/EventSeriesContextLine';
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
import { AdColors } from '../../constants/AdTheme';

// Import utilities
import {
  getEventTimeStatus,
  getEventDisplayUntilDate,
} from '../../utils/dateUtils';
import { getEventSeriesContext } from '../../utils/eventSeries';
import { addEventToCalendarWithTiming } from '../../utils/calendarUtils';
import { buildGathrSharePayload } from '../../utils/shareUtils';
import { getTicketUrl, normalizeTicketUrl } from '../../utils/ticketUrls';
import { getPrimaryNonTicketAction } from '../../utils/eventActionLinks';
import { publishTutorialMeasurement } from '../../utils/tutorialReadiness';

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
import {
  calculateDistance,
  createEventTimeContext,
  doesEventMatchTypeFilters,
  getEventTimeStatusFast,
} from '../../store/mapStore';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { areEventIdsEquivalent } from '../../lib/api/firestoreEvents';
import { doesEventMatchAnyInterest } from '../../utils/familyFriendly';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';
import { getEventScheduleState } from '../../utils/eventTiming';

// Import for loading native ads
import useNativeAds from '../../hooks/useNativeAds';
import { measureListTabStage } from '../../utils/listTabPerfTrace';
import { runAfterTabPaint } from '../../utils/tabFocusEffects';
import {
  markTabFirstAdLayout,
  markTabFirstListItemLayout,
  markTabFlatListLayout,
  markTabFocus,
  markTabListDataReady,
  markTabListPropsReady,
  markTabRootLayout,
  markTabScreenRenderCommit,
  markTabScreenRenderStart,
} from '../../utils/tabSwitchTrace';

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
const COLLAPSIBLE_HEADER_TOP_MARGIN = 3;
const ENABLE_SORT_PERFORMANCE_ANALYTICS = false;
const LIST_LIVE_COUNT_LISTENER_DELAY_MS = 1500;
const ANDROID_SPECIALS_FILTERS_VISIBLE_TOP_TRIM = 36;
const ANDROID_SPECIALS_FILTERS_VISIBLE_TOP_PAD = 15;
const ANDROID_SPECIALS_FILTERS_VISIBLE_BOTTOM_PAD = 0;
const INITIAL_FILTER_HEADER_HEIGHT = 195;

function isFutureDate(dateStr?: string) {
  if (!dateStr) return false;
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d > today;
  } catch {
    return false;
  }
}

function formatEndDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  let label = d.toLocaleDateString(undefined, opts);
  if (d.getFullYear() !== now.getFullYear()) label += `, ${d.getFullYear()}`;
  return label;
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

const hasDisplayableTicketPrice = (price?: string): boolean =>
  Boolean(price && price !== 'N/A' && normalizeTicketUrl(price) === '');

// Helper function to check if an event is paid
const isPaidEvent = (price?: string): boolean => {
  if (normalizeTicketUrl(price)) {
    return false;
  }

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
  isSharedByUser?: boolean;
}

const BadgeContainer: React.FC<BadgeContainerProps> = ({ 
  isNow, 
  matchesUserInterests, 
  isSaved,
  isSharedByUser = false,
}) => {
  if (!isNow && !matchesUserInterests && !isSaved && !isSharedByUser) return null;
  
  const activeCount = (isNow ? 1 : 0) + (matchesUserInterests ? 1 : 0) + (isSaved ? 1 : 0) + (isSharedByUser ? 1 : 0);
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
          {(!multipleActive || (!isNow && activeCount === 2 && !isSharedByUser)) && (
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

      {isSharedByUser && (
        <View style={[
          styles.sharedByUserBadge,
          multipleActive && styles.compactBadge,
        ]}>
          <MaterialIcons
            name="share"
            size={12}
            color="#FFFFFF"
          />
          <Text style={styles.badgeText}>Shared by you</Text>
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
  useEventTimingMinute();
  const timingState = getEventScheduleState(event);
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
  const [isHighlighted, setIsHighlighted] = useState(false);

  useEffect(() => {
    if (!isFirstItem) return;
    const syncHighlight = (stepId: string | null) => {
      setIsHighlighted(stepId === 'specials-list-explanation');
    };
    syncHighlight(useTutorialUiStore.getState().currentStepId);
    return useTutorialUiStore.subscribe((state) => syncHighlight(state.currentStepId));
  }, [isFirstItem]);

  useEffect(() => {
    if (!isFirstItem || !isHighlighted) return;
    
    const measure = () => {
      tutorialRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
        const measurement = { x, y, width, height };
        (global as any).specialsListExplanationLayout = measurement;
        publishTutorialMeasurement('specialsListExplanationLayout', measurement);
      });
    };
    const animationFrame = requestAnimationFrame(measure);
    const interval = setInterval(measure, 80);
    const timeout = setTimeout(() => clearInterval(interval), 1800);

    return () => {
      cancelAnimationFrame(animationFrame);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isHighlighted, isFirstItem]);
  
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
    if (!event.id || isGuest) return;

    let started = false;
    let cancelled = false;
    let startTimer: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      startTimer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        started = true;
        startEventLikesListener(event.id);
        startEventSharesListener(event.id);
        startEventInterestedListener(event.id);
      }, LIST_LIVE_COUNT_LISTENER_DELAY_MS);
    });

    return () => {
      cancelled = true;
      task.cancel?.();
      if (startTimer) {
        clearTimeout(startTimer);
      }
      if (started) {
        stopEventLikesListener(event.id);
        stopEventSharesListener(event.id);
        stopEventInterestedListener(event.id);
      }
    };
  }, [event.id, isGuest]);

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
          const calendarAdded = await addEventToCalendarWithTiming(event, `${event.venue}, ${event.address}`);
          if (!calendarAdded) return;

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

      const calendarAdded = await addEventToCalendarWithTiming(event, `${event.venue}, ${event.address}`);
      if (!calendarAdded) return;

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
    
    const ticketUrl = getTicketUrl(event);
    
    // Track ticket interaction for specials
    analytics.trackUserAction('ticket_link_attempt', {
      event_id: event.id.toString(),
      event_type: 'special',
      special_category: event.category,
      has_valid_url: Boolean(ticketUrl),
      ticket_price: event.ticketPrice,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });
    
    if (isGuest) {
      console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
      return;
    }
    
    if (ticketUrl) {
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

  const nonTicketAction = getPrimaryNonTicketAction(event);
  const handleNonTicketAction = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (isGuest || !nonTicketAction) return;
    analytics?.trackUserAction('event_action_link_opened', {
      event_id: event.id.toString(),
      event_type: event.type,
      action_role: nonTicketAction.role,
      venue_name: event.venue,
    });
    Linking.openURL(nonTicketAction.url);
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
  const hasTicketLink = Boolean(getTicketUrl(event));
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
  const showRegisterButton = hasTicketLink && !paid;
  return (
    <View>
      <TouchableOpacity 
        ref={tutorialRef as any}
        style={[styles.eventCard, timingState.muted && styles.mutedEventCard]}
        onPress={onPress}
        activeOpacity={0.7}
      >
      {/* Hero Image Section - NEW LAYOUT */}
      <View style={styles.heroImageSection}>
        <View style={styles.heroImageContainer}>
          <View>
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
              item={event}
                resizeMode="cover"
              />
            </TouchableOpacity>
            
            {/* Badge container positioned at top right of hero image */}
            <BadgeContainer
              isNow={timeStatus === 'now'}
              matchesUserInterests={matchesUserInterests}
              isSaved={isSaved}
              isSharedByUser={event.sharedEventProvenance?.sharedByCurrentUser === true}
            />

            {/* Venue identity and address disclosure - top left */}
            <View style={styles.venueIdentityOverlay}>
              <View style={styles.venueIdentityPill}>
                <View style={styles.venueProfileImageContainer}>
                  <FallbackImage
                    imageUrl={event.profileUrl}
                    category={event.category}
                    type={event.type}
                    style={styles.venueProfileImageSmall}
                    fallbackType="profile"
                    item={event}
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
                <GestureScrollView
                  horizontal
                  nestedScrollEnabled
                  bounces={false}
                  showsHorizontalScrollIndicator={false}
                  overScrollMode="never"
                  style={styles.venueIdentityNameScroll}
                  contentContainerStyle={styles.venueIdentityNameScrollContent}
                >
                  <Text
                    style={styles.venueIdentityText}
                    numberOfLines={1}
                    accessibilityLabel={event.venue}
                  >
                    {event.venue}
                  </Text>
                </GestureScrollView>
                {hasVenueAddress && (
                  <TouchableOpacity
                    style={styles.venueIdentityChevronButton}
                    onPress={handleVenuePress}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={addressExpanded ? 'Hide venue address' : 'Show venue address'}
                  >
                    <MaterialIcons
                      name={addressExpanded ? 'expand-less' : 'expand-more'}
                      size={18}
                      color="#FFFFFF"
                    />
                  </TouchableOpacity>
                )}
              </View>
              {hasVenueAddress && addressExpanded && (
                <View style={styles.venueAddressOverlay}>
                  <MaterialIcons name="place" size={13} color="#FFFFFF" />
                  <Text style={styles.venueAddressOverlayText} numberOfLines={2}>
                    {event.address}
                  </Text>
                </View>
              )}
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

          </View>
        </View>
      </View>
      
      {/* Content hierarchy: time, title, then description */}
      <View style={styles.contentSection}>
        <View style={styles.dateTimeRow}>
        <MaterialIcons name="access-time" size={14} color={BRAND.primaryDark} />
        {(() => {
          const seriesContext = getEventSeriesContext(event);
          const displayUntilDate = seriesContext ? undefined : getEventDisplayUntilDate(event);
          const endDateSuffix =
            isFutureDate(displayUntilDate) ? ` • (Until ${formatEndDateLabel(displayUntilDate!)})` : '';
            return (
              <>
                <EventTimingSummaryText
                  event={event}
                  suffix={endDateSuffix}
                  style={styles.dateTimeText}
                  numberOfLines={2}
                  adjustsFontSizeToFit={true}
                  minimumFontScale={0.75}
                />
                <EventTimingBadge event={event} compact style={styles.timingBadge} />
              </>
            );
          })()}
        </View>

        <EventSeriesContextLine event={event} containerStyle={styles.seriesContextLine} />

        <Text
          style={styles.cardTitle}
          numberOfLines={2}
          adjustsFontSizeToFit={false}
        >
          {event.title}
        </Text>

              
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
          <FamilyFriendlyBadge event={event} />
          <View style={[
            styles.categoryButton2,
            { backgroundColor: getCategoryColor(event.category) }
          ]}>
            <Text style={styles.categoryText}>{event.category}</Text>
          </View>
          
          {hasDisplayableTicketPrice(event.ticketPrice) &&
           event.ticketPrice !== "0" &&
           event.ticketPrice !== "Ticketed Event" &&
           !showBuyTicketsButton &&
           !(event.ticketPrice.toLowerCase() === "free" && showRegisterButton) && (
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{event.ticketPrice}</Text>
            </View>
          )}
          
          {showBuyTicketsButton && (
            <TicketCtaPill
              disabled={isGuest}
              onPress={handleTickets}
              price={event.ticketPrice}
              style={styles.ticketCtaPill}
            />
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

          {!hasTicketLink && nonTicketAction && (
            <EventActionLinkPill
              disabled={isGuest}
              label={nonTicketAction.label}
              onPress={handleNonTicketAction}
              role={nonTicketAction.role}
              style={styles.ticketCtaPill}
            />
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
    </View>
  );
};

// Memoize EventListItem to prevent re-renders when props don't change
const MemoizedEventListItem = React.memo(EventListItem, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.familyFriendlyScore === nextProps.event.familyFriendlyScore &&
    prevProps.matchesUserInterests === nextProps.matchesUserInterests &&
    prevProps.isSaved === nextProps.isSaved &&
    prevProps.isGuest === nextProps.isGuest &&
    prevProps.isFirstItem === nextProps.isFirstItem
  );
});

// Main Specials Screen component
function SpecialsScreen() {
  const adColors = AdColors[useColorScheme() ?? 'light'];
  markTabScreenRenderStart('specials');

  
  // ===============================================================
  // ANALYTICS INTEGRATION - RE-ENABLED
  // ===============================================================
  const analytics = useAnalytics();
  useEffect(() => {
    markTabScreenRenderCommit('specials');
  });

  useFocusEffect(
    useCallback(() => {
      markTabFocus('specials');
    }, [])
  );
  const handleRootLayout = useCallback(() => {
    markTabRootLayout('specials');
  }, []);
  const isFocusedContentReady = true;

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
      const cancelScreenView = runAfterTabPaint(() => {
        analytics.trackScreenView('specials', {
          content_type: 'special_list',
          user_type: isGuest ? 'guest' : 'registered'
        });
      });

      // Return cleanup function to track time spent
      return () => {
        cancelScreenView();
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
      return runAfterTabPaint(() => {
        if ((global as any).onSpecialsScreenNavigated) {
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
  const viewportEvents = useMapStore((state) => state.viewportEvents);
  const outsideViewportEvents = useMapStore((state) => state.outsideViewportEvents);
  const isLoading = useMapStore((state) => state.isLoading);
  const error = useMapStore((state) => state.error);
  const fetchEvents = useMapStore((state) => state.fetchEvents);
  const fetchEventDetails = useMapStore((state) => state.fetchEventDetails);
  const setTypeFilters = useMapStore((state) => state.setTypeFilters);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const userLocation = useMapStore((state) => state.userLocation);
  const getTimeFilterCounts = useMapStore((state) => state.getTimeFilterCounts);
  const getCategoryFilterCounts = useMapStore((state) => state.getCategoryFilterCounts);
  const scrollTriggers = useMapStore((state) => state.scrollTriggers);
  const isHeaderSearchActive = useMapStore((state) => state.isHeaderSearchActive);
  const setHeaderSearchActive = useMapStore((state) => state.setHeaderSearchActive);

  // Memoized event lookup Map for O(1) access instead of O(n) find.
  // Build it after the tab shell has painted so first focus stays responsive.
  const eventLookupMap = useMemo(() => {
    if (!isFocusedContentReady) {
      return new Map<string, Event>();
    }

    const map = new Map<string, Event>();
    events.forEach(event => {
      map.set(String(event.id), event);
    });
    return map;
  }, [events, isFocusedContentReady]);

  const getUpdatedEvent = useCallback((eventId: string | number) => {
    return eventLookupMap.get(String(eventId));
  }, [eventLookupMap]);

  // State management
  const [scrollY] = useState(new Animated.Value(0));
  const [headerHeight, setHeaderHeight] = useState(INITIAL_FILTER_HEADER_HEIGHT);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const handleFlatListLayout = useCallback(() => {
    markTabFlatListLayout('specials');
  }, []);
  const handleFirstListItemLayout = useCallback(() => {
    markTabFirstListItemLayout('specials');
  }, []);
  const handleFirstAdLayout = useCallback(() => {
    markTabFirstAdLayout('specials');
  }, []);
  
  // Back to top button state
  const [showBackToTop, setShowBackToTop] = useState(false);
  const backToTopOpacity = useRef(new Animated.Value(0)).current;
  
  // Performance tracking for specials
  const [listLoadTime, setListLoadTime] = useState<number | null>(null);
  const [scrollStartTime, setScrollStartTime] = useState<number | null>(null);
  const collapsibleHeaderTop = COLLAPSIBLE_HEADER_TOP_MARGIN;
  const effectiveHeaderStackHeight = collapsibleHeaderTop + Math.max(headerHeight, 120);

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
      return runAfterTabPaint(() => {
        if (__DEV__) {
          console.log('[GuestLimitation] Specials screen gained focus');
        }

        if (isGuest) {
          if (__DEV__) {
            console.log('[GuestLimitation] Tracking Specials tab selection for guest');
          }
          trackTabSelect('specials');
        }
      });
    }, [isGuest])
  );
  
  // UI state
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const detailsAnimation = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [showBanner, setShowBanner] = useState(false);
  const tutorialVisible = useTutorialUiStore((state) => state.isVisible);
  const [selectedImageData, setSelectedImageData] = useState<{
    imageUrl: string;
    event: Event;
  } | null>(null);
  


  // Tutorial awareness for specials filters
  const specialsFiltersRef = useRef<View>(null);
  const [specialsFiltersHighlighted, setSpecialsFiltersHighlighted] = useState(false);
  const specialsFiltersHighlightActiveRef = useRef(false);

  const measureVisibleSpecialsFiltersLayout = useCallback((
    x: number,
    y: number,
    width: number,
    height: number,
    measuredAt = Date.now()
  ) => {
    const topTrim = Platform.OS === 'android'
      ? Math.min(ANDROID_SPECIALS_FILTERS_VISIBLE_TOP_TRIM, Math.max(0, height - 1))
      : 0;
    const topPad = Platform.OS === 'android' ? ANDROID_SPECIALS_FILTERS_VISIBLE_TOP_PAD : 0;
    const bottomPad = Platform.OS === 'android' ? ANDROID_SPECIALS_FILTERS_VISIBLE_BOTTOM_PAD : 0;

    return {
      x: Math.round(x),
      y: Math.round(y + topTrim - topPad),
      width: Math.round(width),
      height: Math.round(Math.max(1, height + topPad + bottomPad)),
      measuredAt
    };
  }, []);

  const publishSpecialsFiltersMeasurement = useCallback((attempt = 0) => {
    if (!specialsFiltersHighlightActiveRef.current) return;
    const target = specialsFiltersRef.current;
    if (!target) {
      if (attempt < 3) {
        setTimeout(() => publishSpecialsFiltersMeasurement(attempt + 1), 120);
      }
      return;
    }

    requestAnimationFrame(() => {
      target.measureInWindow((x: number, y: number, width: number, height: number) => {
        if (width <= 0 || height <= 0) {
          if (attempt < 3) {
            setTimeout(() => publishSpecialsFiltersMeasurement(attempt + 1), 120);
          }
          return;
        }

        const measuredAt = Date.now();
        const measurement = measureVisibleSpecialsFiltersLayout(x, y, width, height, measuredAt);
        const g: any = global as any;
        g.specialsFiltersLayout = measurement;
        g.specialsFiltersLayoutMeasuredAt = measuredAt;
        publishTutorialMeasurement('specialsFiltersLayout', measurement, measuredAt);
      });
    });
  }, [measureVisibleSpecialsFiltersLayout]);

  useEffect(() => {
    const syncHighlight = (stepId: string | null) => {
      const highlighted = stepId === 'specials-filters';
      specialsFiltersHighlightActiveRef.current = highlighted;
      setSpecialsFiltersHighlighted(highlighted);
    };
    syncHighlight(useTutorialUiStore.getState().currentStepId);
    return useTutorialUiStore.subscribe((state) => syncHighlight(state.currentStepId));
  }, []);

  useEffect(() => {
    const setHighlighted = (highlighted: boolean) => {
      specialsFiltersHighlightActiveRef.current = highlighted;
      setSpecialsFiltersHighlighted(highlighted);
    };
    (global as any).setTutorialSpecialsFiltersHighlighted = setHighlighted;
    return () => {
      if ((global as any).setTutorialSpecialsFiltersHighlighted === setHighlighted) {
        delete (global as any).setTutorialSpecialsFiltersHighlighted;
      }
    };
  }, []);

  useEffect(() => {
    (global as any).requestTutorialSpecialsFiltersMeasurement = publishSpecialsFiltersMeasurement;
    return () => {
      if ((global as any).requestTutorialSpecialsFiltersMeasurement === publishSpecialsFiltersMeasurement) {
        delete (global as any).requestTutorialSpecialsFiltersMeasurement;
      }
    };
  }, [publishSpecialsFiltersMeasurement]);

  useEffect(() => {
    if (!specialsFiltersHighlighted) {
      specialsFiltersHighlightActiveRef.current = false;
      delete (global as any).specialsFiltersLayout;
      return;
    }

    specialsFiltersHighlightActiveRef.current = true;
    publishSpecialsFiltersMeasurement();
  }, [publishSpecialsFiltersMeasurement, specialsFiltersHighlighted]);

  // Removed local fetching/listening of user prefs.
  // Now sourced from useUserPrefsStore (hydrated at login via AuthProvider).
  
  // Banner animation
  useEffect(() => {
    if (tutorialVisible) {
      fadeAnim.stopAnimation();
      fadeAnim.setValue(0);
      setShowBanner(false);
      return;
    }

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
  }, [fadeAnim, filterCriteria, tutorialVisible, userInterests]);
  
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
        .filter(event => event.sharedEventProvenance?.sharedByCurrentUser !== true)
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
  const timeFilterCounts = isFocusedContentReady
    ? measureListTabStage('specials', 'time_filter_counts', {}, () => getTimeFilterCounts('special'))
    : {
        [TimeFilterType.ALL]: 0,
        [TimeFilterType.NOW]: 0,
        [TimeFilterType.TODAY]: 0,
        [TimeFilterType.TOMORROW]: 0,
        [TimeFilterType.UPCOMING]: 0,
      };
  const categoryFilterCounts = isFocusedContentReady
    ? measureListTabStage('specials', 'category_filter_counts', {}, () => getCategoryFilterCounts('special'))
    : {};

  const savedEventSet = useMemo(() => {
    return new Set(savedEvents || []);
  }, [savedEvents]);

  const userInterestLowerSet = useMemo(() => {
    return new Set((userInterests || []).map(interest => interest.toLowerCase()));
  }, [userInterests]);

  const favoriteVenueSet = useMemo(() => {
    return new Set(favoriteVenues || []);
  }, [favoriteVenues]);

  const eventTimeContextMinute = Math.floor(Date.now() / 60000);
  const eventTimeContext = useMemo(() => {
    return createEventTimeContext();
  }, [eventTimeContextMinute]);
  
  // Helper functions
  const matchesUserInterests = (event: Event): boolean => {
    if (userInterestLowerSet.size === 0) return false;
    return doesEventMatchAnyInterest(event, userInterestLowerSet);
  };
  
  const isEventSaved = (event: Event): boolean => {
    if (savedEventSet.size === 0) return false;
    return savedEventSet.has(event.id.toString());
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
    return measureListTabStage('specials', 'filter_viewport', {
      inputCount: viewportEvents.length,
      ready: isFocusedContentReady,
    }, () => {
      if (!isFocusedContentReady) {
        markTabListDataReady('specials', {
          ready: false,
          itemCount: 0,
        });
        return [];
      }

      const filtered: Event[] = [];

      for (const event of viewportEvents) {
        if (event.type !== 'special') {
          continue;
        }

        if (filterCriteria.specialFilters.savedOnly && !isEventSaved(event)) {
          continue;
        }

        if (!doesEventMatchTypeFilters(event, filterCriteria.specialFilters, eventTimeContext)) {
          continue;
        }

        filtered.push(event);
      }

      return filtered;
    });
  }, [isFocusedContentReady, viewportEvents, filterCriteria, savedEventSet, eventTimeContext]);

  // Filter outside-viewport specials
  const filteredOutsideViewportSpecials = useMemo(() => {
    return measureListTabStage('specials', 'filter_outside_viewport', {
      inputCount: outsideViewportEvents.length,
      ready: isFocusedContentReady,
    }, () => {
      if (!isFocusedContentReady) {
        return [];
      }

      const filtered: Event[] = [];

      for (const event of outsideViewportEvents) {
        if (event.type !== 'special') {
          continue;
        }

        if (filterCriteria.specialFilters.savedOnly && !isEventSaved(event)) {
          continue;
        }

        if (!doesEventMatchTypeFilters(event, filterCriteria.specialFilters, eventTimeContext)) {
          continue;
        }

        filtered.push(event);
      }

      return filtered;
    });
  }, [isFocusedContentReady, outsideViewportEvents, filterCriteria, savedEventSet, eventTimeContext]);

  // Enhanced sorting with special-specific analytics tracking
  const sortAndPrioritizeSpecials = (specials: Event[]): Event[] => {
    const sortStartTime = Date.now();

    type ScoredSpecial = {
      event: Event;
      isSaved: boolean;
      isFromFavoriteVenue: boolean;
      timeStatus: 'now' | 'today' | 'future' | 'past';
      compositeScore: number;
      distance: number;
    };

    const savedNowSpecials: ScoredSpecial[] = [];
    const savedTodaySpecials: ScoredSpecial[] = [];
    const savedFutureSpecials: ScoredSpecial[] = [];
    const unsavedSpecials: ScoredSpecial[] = [];

    for (const special of specials) {
      const isSaved = isEventSaved(special);
      const timeStatus = getEventTimeStatusFast(special, eventTimeContext);
      const matchesInterest = matchesUserInterests(special);

      // Check if special is from a favorite venue
      const specialLocationKey = createLocationKeyFromEvent(special);
      const isFromFavoriteVenue = favoriteVenueSet.has(specialLocationKey);

      const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
      const baseScore = timeStatus === 'past' ? 0 : BASE_SCORES[scoreCategory][timeStatus];

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
      
     
      const scoredSpecial = {
        event: special,
        isSaved,
        isFromFavoriteVenue,
        timeStatus,
        compositeScore,
        distance
      };

      if (!isSaved) {
        unsavedSpecials.push(scoredSpecial);
      } else if (timeStatus === 'now') {
        savedNowSpecials.push(scoredSpecial);
      } else if (timeStatus === 'today') {
        savedTodaySpecials.push(scoredSpecial);
      } else {
        savedFutureSpecials.push(scoredSpecial);
      }
    }

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
    
    if (ENABLE_SORT_PERFORMANCE_ANALYTICS) {
      const sortTime = Date.now() - sortStartTime;
      requestAnimationFrame(() => {
        analytics.trackPerformance('specials_sort', sortTime, {
          specials_count: specials.length,
          sort_time_ms: sortTime,
          has_user_location: !!userLocation,
          user_interests_count: userInterests.length
        });
      });
    }
    
    return sortedSpecials;
  };

  // Apply priority sorting to viewport section (small, sorts immediately)
  const sortedViewportSpecials = useMemo(() => {
    return measureListTabStage('specials', 'sort_viewport', {
      inputCount: filteredViewportSpecials.length,
    }, () => sortAndPrioritizeSpecials(filteredViewportSpecials));
  }, [filteredViewportSpecials, userLocation, savedEventSet, favoriteVenueSet, userInterestLowerSet, eventTimeContext]);

  // State for pagination of outside-viewport specials
  const [outsideViewportLoadCount, setOutsideViewportLoadCount] = useState(10);
  const loadMoreBatchSize = 20;

  const handleLoadMoreOutsideViewport = useCallback(() => {
    setOutsideViewportLoadCount(prev => prev + loadMoreBatchSize);
  }, []);

  // Lazy-sort outside-viewport specials: only sort what we need for display
  // This prevents sorting hundreds of specials when FlatList only shows 10 initially
  const sortedOutsideViewportSpecials = useMemo(() => {
    return measureListTabStage('specials', 'sort_outside_viewport', {
      inputCount: filteredOutsideViewportSpecials.length,
      outsideViewportLoadCount,
    }, () => {
      // Only sort up to what we're displaying + one batch ahead for smooth scrolling
      const maxToSort = outsideViewportLoadCount + 20; // loadMoreBatchSize buffer
      if (filteredOutsideViewportSpecials.length <= maxToSort) {
        // Small list, sort all of it
        return sortAndPrioritizeSpecials(filteredOutsideViewportSpecials);
      }
      // Large list: sort only what we need
      const specialsToSort = filteredOutsideViewportSpecials.slice(0, maxToSort);
      return sortAndPrioritizeSpecials(specialsToSort);
    });
  }, [filteredOutsideViewportSpecials, outsideViewportLoadCount, userLocation, savedEventSet, favoriteVenueSet, userInterestLowerSet, eventTimeContext]);

  // Request one distinct NativeAd instance for every placement in the currently
  // exposed page. The target grows with pagination instead of stopping at four.
  const displayedOutsideViewportSpecialCount = Math.min(
    sortedOutsideViewportSpecials.length,
    outsideViewportLoadCount
  );
  const regularSpecialAdPlacements =
    Math.floor(sortedViewportSpecials.length / 4) +
    Math.floor(displayedOutsideViewportSpecialCount / 4);
  const lowCountSpecialAdPlacement =
    sortedViewportSpecials.length > 0 &&
    sortedViewportSpecials.length < 4 &&
    displayedOutsideViewportSpecialCount === 0
      ? 1
      : 0;
  const adCount = Math.max(2, regularSpecialAdPlacements + lowCountSpecialAdPlacement);
  const nativeAds = useNativeAds(adCount, 'specials');

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

  const specialsWithAds = useMemo<ListItem[]>(() => {
    return measureListTabStage('specials', 'build_list_with_ads', {
      ready: isFocusedContentReady,
      viewportCount: sortedViewportSpecials.length,
      outsideViewportCount: sortedOutsideViewportSpecials.length,
      nativeAdsCount: nativeAds.length,
    }, () => {
      if (!isFocusedContentReady) {
        return [];
      }

      const result: ListItem[] = [];
      const adFrequency = 4;
      let adIndex = 0;
      const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);

    // Add viewport specials with ads
    sortedViewportSpecials.forEach((special, index) => {
      result.push({ type: 'special', data: special });

      // Insert ad every 4 specials
      if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
        const selectedAd = validAds[adIndex];
        if (selectedAd) {
          result.push({
            type: 'ad',
            data: {
              ...selectedAd,
              key: getAdListKey(selectedAd, adIndex),
              allowMedia: true,
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
        const selectedAd = validAds[adIndex];
        if (selectedAd) {
          result.push({
            type: 'ad',
            data: {
              ...selectedAd,
              key: getAdListKey(selectedAd, adIndex),
              allowMedia: true,
            }
          });
          adIndex++;
        }
      }
    });

    // Low-count fallback for viewport section
    if (sortedViewportSpecials.length > 0 && sortedViewportSpecials.length < adFrequency && nativeAds.length > 0 && sortedOutsideViewportSpecials.length === 0) {
      const selectedAd = validAds[0];
      if (selectedAd) {
        result.push({
          type: 'ad',
          data: {
            ...selectedAd,
            key: getAdListKey(selectedAd, adIndex),
            allowMedia: true,
          }
        });
      }
    }

      markTabListDataReady('specials', {
        ready: true,
        itemCount: result.length,
        viewportCount: sortedViewportSpecials.length,
        outsideViewportCount: sortedOutsideViewportSpecials.length,
        nativeAdsCount: nativeAds.length,
      });

      return result;
    });
  }, [getAdListKey, isFocusedContentReady, sortedViewportSpecials, sortedOutsideViewportSpecials, filteredOutsideViewportSpecials.length, nativeAds, outsideViewportLoadCount]);

  // Pre-compute lookup Sets for O(1) access during render
  const interestMatchSet = useMemo(() => {
    return measureListTabStage('specials', 'interest_match_set', {
      inputCount: specialsWithAds.length,
      interestCount: userInterestLowerSet.size,
    }, () => {
      if (userInterestLowerSet.size === 0) return new Set<string>();
      const matchingIds = new Set<string>();
      specialsWithAds.forEach(item => {
        if (item.type === 'special' && doesEventMatchAnyInterest(item.data, userInterestLowerSet)) {
          matchingIds.add(String(item.data.id));
        }
      });
      return matchingIds;
    });
  }, [specialsWithAds, userInterestLowerSet]);

  // Find first special index once instead of O(n) for each item
  const firstSpecialIndex = useMemo(() => {
    return specialsWithAds.findIndex(item => item.type === 'special');
  }, [specialsWithAds]);
  const firstAdIndex = useMemo(() => {
    return specialsWithAds.findIndex(item => item.type === 'ad');
  }, [specialsWithAds]);

  markTabListPropsReady('specials', {
    itemCount: specialsWithAds.length,
    firstSpecialIndex,
    firstAdIndex,
  });

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
    { paddingTop: effectiveHeaderStackHeight + (showBanner ? 35 : 0) + 8 }
  ], [effectiveHeaderStackHeight, showBanner]);

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

  return (
    <View style={styles.container} onLayout={handleRootLayout}>
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
          { top: collapsibleHeaderTop },
          { transform: [{ translateY: headerTranslateY }] }
        ]}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height + 5;
          setHeaderHeight((previousHeight) =>
            Math.abs(previousHeight - nextHeight) > 1 ? nextHeight : previousHeight
          );
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
      backgroundColor: '#0B0D10',
    } : {}
  ]}

        >
          <View 
            ref={specialsFiltersRef}
            style={styles.filtersContainer}
            onLayout={() => {
              if (specialsFiltersHighlighted) {
                publishSpecialsFiltersMeasurement();
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
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW ? '#FFFFFF' : '#D5DAE2'}
                  style={styles.timeFilterIcon}
                />
                <Text style={[
                  styles.timeFilterText,
                  filterCriteria.specialFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterText
                ]}>
                  Now ({timeFilterCounts[TimeFilterType.NOW]})
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
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.TODAY ? '#FFFFFF' : '#D5DAE2'}
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
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.TOMORROW ? '#FFFFFF' : '#D5DAE2'}
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
                  color={filterCriteria.specialFilters.timeFilter === TimeFilterType.UPCOMING ? '#FFFFFF' : '#D5DAE2'}
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
                  appearance="dark"
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
            top: effectiveHeaderStackHeight
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
        style={styles.eventList}
        data={isFocusedContentReady ? specialsWithAds : []}
        keyExtractor={keyExtractor}
        onScroll={handleScroll}
        onLayout={handleFlatListLayout}
        scrollEventThrottle={16}
        contentContainerStyle={contentContainerStyleMemo}
        renderItem={({ item, index }) => {
          if (item.type === 'divider') {
            const divider = <DividerComponent message={item.data.message} count={item.data.count} />;
            return index === 0 ? (
              <View onLayout={handleFirstListItemLayout}>{divider}</View>
            ) : divider;
          }

          if (item.type === 'ad') {
            return (
              <View
                style={[
                  styles.adContainer,
                  { backgroundColor: adColors.cardBackground },
                ]}
                onLayout={() => {
                  if (index === 0) {
                    handleFirstListItemLayout();
                  }
                  if (index === firstAdIndex) {
                    handleFirstAdLayout();
                  }
                }}
              >
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
          const specialListItem = (
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

          return index === 0 ? (
            <View onLayout={handleFirstListItemLayout}>{specialListItem}</View>
          ) : specialListItem;
        }}
        ListEmptyComponent={isFocusedContentReady ? listEmptyComponent : null}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        // Performance optimizations for large lists
        removeClippedSubviews={true}
        maxToRenderPerBatch={1}
        windowSize={3}
        initialNumToRender={1}
        updateCellsBatchingPeriod={80}
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
    backgroundColor: '#0B0D10',
    paddingTop: 3,
    // Keep the collapsible filter overlay clipped to the scene so it can tuck
    // under the navigator header instead of visually painting over it on iOS.
    overflow: 'hidden',
  },
  collapsibleHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#0B0D10',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
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
    paddingBottom: 16,
  },
  eventList: {
    backgroundColor: '#0B0D10',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#C5CAD3',
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
    marginBottom: 12, // Changed from borderBottomWidth to margin
    borderRadius: 16,
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
    backgroundColor: '#161A20',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F36',
    zIndex: 15,
    elevation: 15,
  },
  preferencesText: {
    fontSize: 14,
    color: '#64B5F6',
    fontWeight: '500',
    textAlign: 'center',
  },
  filtersContainer: {
    backgroundColor: '#0B0D10',
    paddingTop: 2,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2F36',
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
    color: '#F2F4F7',
  },
  filterClearButton: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  clearButtonText: {
    fontSize: 11,
    color: '#64B5F6',
    fontWeight: '500',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#2A2F36',
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
    backgroundColor: '#1A1D22',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#343941',
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.28,
      shadowRadius: 2,
    }),
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
    color: '#F2F4F7',
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
    borderWidth: 1,
    borderColor: '#DDE1E7',
    marginHorizontal: 6,
    marginBottom: 10,
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
    }),
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
  sharedByUserBadge: {
    backgroundColor: BRAND.primary,
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
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    }),
  },
  // Add new style for image container background
  heroImageContainer: {
    backgroundColor: '#F8F8F8', // Subtle background behind the image
    borderRadius: 16, // Slightly larger radius than image
    padding: 0, // Creates visible background border
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
    }),
  },
  heroImage: {
    width: '100%',
    height: 300, // Reduced from 200px to be less imposing
    backgroundColor: '#F0F0F0',
    borderRadius: 12, // Add rounded corners like other cards
    // Strong border to create "photo frame" effect
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    }),
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
  // Venue identity overlay - top left of hero image
  venueIdentityOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: '72%',
    zIndex: 10,
  },
  venueIdentityPill: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(18, 18, 18, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  venueProfileImageContainer: {
    position: 'relative',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'android' ? {
      elevation: 0,
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    }),
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
  venueIdentityText: {
    fontSize: 13,
    lineHeight: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    flexShrink: 0,
  },
  venueIdentityNameScroll: {
    flex: 1,
    marginLeft: 8,
  },
  venueIdentityNameScrollContent: {
    alignItems: 'center',
    paddingRight: 4,
  },
  venueIdentityChevronButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  venueAddressOverlay: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(18, 18, 18, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  venueAddressOverlayText: {
    flexShrink: 1,
    marginLeft: 5,
    fontSize: 11,
    lineHeight: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  // Content Section - Now below the hero image (updated from old contentSection)
  contentSection: {
    paddingHorizontal: 16, // Horizontal padding for edge spacing
    paddingTop: 2,
    paddingBottom: 6,
  },
  // Added new description section that takes full width
  descriptionSection: {
    paddingHorizontal: 16, // Match horizontal padding with top section
    paddingBottom: 10,
  },
  cardTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: '#222222',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  dateTimeText: {
    fontSize: 12,
    color: BRAND.primaryDark,
    marginLeft: 4,
    flex: 1,
    fontWeight: '600',
  },
  seriesContextLine: {
    marginBottom: 4,
    marginTop: -2,
  },
  mutedEventCard: {
    opacity: 0.68,
  },
  timingBadge: {
    marginLeft: 6,
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
  ticketCtaPill: {
    marginRight: 8,
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
    backgroundColor: '#3A3E45',
  },
  dividerTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  dividerText: {
    fontSize: 14,
    color: '#AEB4BE',
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
