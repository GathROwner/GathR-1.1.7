import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  ActivityIndicator, 
  TouchableOpacity, 
  Image, 
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
  Pressable
} from 'react-native';
import { usePathname } from 'expo-router';

import { MaterialIcons } from '@expo/vector-icons';
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
import NativeAdComponent from '../../components/ads/NativeAdComponent';

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
import { buildGathrShareUrl } from '../../utils/shareUtils';

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
import { calculateDistance } from '../../store/mapStore';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { areEventIdsEquivalent } from '../../lib/api/firestoreEvents';

// Import for loading native ads
import useNativeAds from '../../hooks/useNativeAds';

//import for updating events list based on updating firebase user interests .. Firebase listener
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

// ===============================================================
// ANALYTICS IMPORT - RE-ENABLED
// ===============================================================
import useAnalytics from '../../hooks/useAnalytics';
import nativeAnalytics from '@react-native-firebase/analytics';
import firebase from '@react-native-firebase/app';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';


// Constants
const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

type UserPrefsState = {
  interests: string[];
  savedEvents: string[];
  favoriteVenues: string[];
  likedEvents: string[];
  interestedEvents: string[];
};

// --- Local helper to derive label/start/end from the already-formatted strings ---
// Returns { label } (base without trailing " at <start>" if present),
// { start }, { end }, and { labelWithTime } (original base).
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dateStr}T00:00:00`);
  return !isNaN(d.getTime()) && d.getTime() > today.getTime();
}

function formatEndDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  let label = d.toLocaleDateString(undefined, opts);
  if (d.getFullYear() !== now.getFullYear()) label += `, ${d.getFullYear()}`;
  return label;
}



// Define brand colors for consistency with profile page
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

// Helper function to get color for event category
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return BRAND.primary;
    case 'comedy show': return BRAND.primary;
    case 'cabaret': return BRAND.primary;
    case 'sports': return BRAND.primary;
    case 'meeting': return BRAND.primary;
    case 'family friendly': return BRAND.primary;
    case 'gatherings & parties': return BRAND.primary;
    default: return BRAND.primary;
  }
};

// Helper function to validate a ticket URL
const isValidTicketUrl = (url?: string): boolean => {
  return Boolean(url && url !== "N/A" && url !== "" && url.includes("http"));
};

// Helper function to check if an event is paid
const isPaidEvent = (price?: string): boolean => {
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

// Badge Container component
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

// EventListItem component
interface EventListItemProps {
  event: Event;
  onPress: () => void;
  onImagePress: (imageUrl: string, event: Event) => void;
  matchesUserInterests: boolean;
  isSaved: boolean;
  isGuest: boolean;
  analytics: any; // Analytics hook - TEMPORARILY DISABLED
  isFirstItem?: boolean; // NEW: Tutorial awareness only for first item
}

const EventListItem: React.FC<EventListItemProps> = ({ 
  event, 
  onPress, 
  onImagePress, 
  matchesUserInterests, 
  isSaved,
  isGuest,
  analytics,
  isFirstItem = false
}) => {
  const [expanded, setExpanded] = useState(false);
  const [bookmarked, setBookmarked] = useState(isSaved);
  const [isToggling, setIsToggling] = useState(false);
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [isHeroLikeToggling, setIsHeroLikeToggling] = useState(false);
  const [isInterestedToggling, setIsInterestedToggling] = useState(false);
  const eventIdString = String(event.id);
  const likedEvents = useUserPrefsStore((s: UserPrefsState) => s.likedEvents);
  const interestedEvents = useUserPrefsStore((s: UserPrefsState) => s.interestedEvents);
  const isHeroLiked = likedEvents.includes(eventIdString);
  const isInterested = interestedEvents.includes(eventIdString);
  const setUserPrefs = useUserPrefsStore.getState().setAll;

  // Tutorial awareness - only for first item
  const tutorialRef = useRef<View>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isHighlighted, setIsHighlighted] = useState(false);

  // Tutorial measurement stability control (first card only)
  const hasMeasuredRef = useRef(false);
  const lastLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const stableCountRef = useRef(0);
  const startTsRef = useRef<number | null>(null);

  /*
    EVENTS → "Feed explanation" spotlight measurement
    Goals:
      • Keep polling while the tutorial sets up (flag may turn ON after a delay).
      • Once ON, keep measuring until either:
          a) layout is stable for a few reads AND we're past the manager’s draw delay, or
          b) we hit a generous time cap (accounts for banner collapse / image loads).
      • If the list jumps UP (preferences banner collapses), reset stabilization/timer
        so we finalize on the post-collapse layout.

    Key parameters (tuned empirically):
      • minStableMs = 3400  → don’t finalize before manager’s ~3200ms delay
      • maxMs       = 5200  → hard cap to avoid infinite polling on slow devices
      • jumpUp > 20px       → treat as banner collapse and restart stabilization

    Result:
      • Spotlight uses a fresh, post-banner layout.
      • Interval clears itself — no long-running log spam.
  */
  useEffect(() => {
    if (!isFirstItem) return; // Only first item participates in tutorial

    const interval = setInterval(() => {
      const g: any = global as any;
      const globalFlag = g.tutorialHighlightEventsListExplanation || false;

      // If another instance already finalized, stop quietly to avoid duplicate "FINALIZED" logs
      if (g.eventsListExplanationStable) {
        clearInterval(interval);
        return;
      }

      // Track flag changes locally
      if (globalFlag !== isHighlighted) {
        setIsHighlighted(globalFlag);
        // When highlight turns ON, reset stability trackers & start a short timing window
        if (globalFlag) {
          stableCountRef.current = 0;
          lastLayoutRef.current = null;
          hasMeasuredRef.current = false;
          startTsRef.current = Date.now();
        }
      }

      // If the flag is off, skip measuring but KEEP polling — it may turn on after a delayed setup
      if (!globalFlag) {
        return;
      }

      // Guard: initialize timer if it wasn't set for some reason
      if (startTsRef.current == null) {
        startTsRef.current = Date.now();
      }
      const elapsed = Date.now() - startTsRef.current;
      // Keep measuring well past the manager's 3200ms delay so it consumes a post-banner layout
      const maxMs = 5200; // 5.2s cap = 3.2s delay + banner collapse + buffer
      const minStableMs = 3400; // don't finalize stable before the manager draws

      // Measure while highlighted until layout is stable OR we hit the time cap
      if (tutorialRef.current) {
        tutorialRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          const cur = { x, y, width, height };
          g.eventsListExplanationLayout = cur;

          // Track first measurement
          if (!hasMeasuredRef.current) {
            hasMeasuredRef.current = true;
          }

          // Stability check (a bit looser because card can nudge during image/layout settles)
          const prev = lastLayoutRef.current;
          if (prev) {
            const dx = Math.abs(cur.x - prev.x);
            const dy = Math.abs(cur.y - prev.y);
            const dw = Math.abs(cur.width - prev.width);
            const dh = Math.abs(cur.height - prev.height);

            // If the card jumps UP noticeably, the preferences banner likely collapsed.
            // Reset stabilization & timing so we grab a fresh, post-banner layout.
            if (prev.y - cur.y > 20) {
              stableCountRef.current = 0;
              startTsRef.current = Date.now();
              console.log('Tutorial: Detected banner collapse / list shift; resetting stabilization', { prevY: prev.y, curY: cur.y });
            }

            const isStableNow = dx < 2 && dy < 2 && dw < 2 && dh < 2;
            stableCountRef.current = isStableNow ? (stableCountRef.current + 1) : 0;
          } else {
            stableCountRef.current = 0;
          }
          lastLayoutRef.current = cur;

          // Finalize when either:
          //   • layout is stable AND we’ve passed the minimum settle time (post-manager draw), OR
          //   • we’ve hit the extended time cap but at least one measurement was taken.
          const stable = stableCountRef.current >= 3;
          const timedOut = elapsed >= maxMs;
          const stableLongEnough = stable && elapsed >= minStableMs;

          if (stableLongEnough || (timedOut && hasMeasuredRef.current)) {
            const firstFinalizer = !g.eventsListExplanationStable;
            g.eventsListExplanationStable = true;
            clearInterval(interval);
            if (firstFinalizer) {
              console.log('Tutorial: Event card measurement FINALIZED; polling stopped', { cur, stable, elapsed });
            }
          } else {
            if (Math.random() < 0.1) {
              console.log('Tutorial: Measured first event card:', cur);
            }
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

  useEffect(() => {
    setBookmarked(isSaved);
  }, [isSaved]);

  useEffect(() => {
    setAddressExpanded(false);
  }, [event.id]);
  
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

  const timeStatus = getEventTimeStatus(event);
  const hasVenueAddress = Boolean(event.address?.trim());
  const handleVenuePress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    if (!hasVenueAddress) return;
    setAddressExpanded(prev => !prev);
  };
  
  // ===============================================================
  // ANALYTICS-ENHANCED ACTION HANDLERS
  // ===============================================================
  
  // Get interested count
  const interestedLiveValue = useEventInterestedCount(event.id);
  const interestedValueFromEvent = event.interested !== undefined && event.interested !== null ? Number(event.interested) : 0;
  const interestedValue = interestedLiveValue != null ? interestedLiveValue : interestedValueFromEvent;

  // Combine usersResponded (Facebook) with interested (GathR) for the person icon badge
  const facebookUsersResponded = event.usersResponded !== undefined && event.usersResponded !== null ? Number(event.usersResponded) : 0;
  const combinedInterestedValue = facebookUsersResponded + interestedValue;
  const heroInterestedText = combinedInterestedValue > 0 ? String(combinedInterestedValue) : '';

  const handleInterestedPress = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    if (isGuest) {
      console.log('[GuestLimitation] Interested blocked - premium feature for registered users only');
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
        source: 'list',
        referrer: '/events',
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

        // Track successful calendar addition
        analytics?.trackUserAction('calendar_add_success', {
          event_id: event.id.toString(),
          event_type: event.type,
          event_category: event.category,
          venue_name: event.venue,
        });
      }
    } catch (error) {
      setUserPrefs({ interestedEvents: previousInterestedEvents });
      console.error('Error toggling interested (events list):', error);
    } finally {
      setIsInterestedToggling(false);
    }
  };

  const handleAddToCalendar = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    // Track calendar interaction attempt
    analytics?.trackUserAction('calendar_add_attempt', {
      event_id: event.id.toString(),
      event_type: event.type,
      is_guest: isGuest,
      interaction_blocked: isGuest
    });

    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return;
    }

    // If not already interested, mark as interested (which will also add to calendar)
    if (!isInterested) {
      await handleInterestedPress(e);
      return;
    }

    // Already interested, just add to calendar again
    try {
      const startTime = Date.now();

      await addToCalendar({
        title: event.title,
        startDate: combineDateAndTime(event.startDate, event.startTime),
        endDate: combineDateAndTime(event.endDate || event.startDate, event.endTime || '11:59 PM'),
        location: `${event.venue}, ${event.address}`,
        notes: event.description
      });

      // Track successful calendar addition
      analytics?.trackUserAction('calendar_add_success', {
        event_id: event.id.toString(),
        event_type: event.type,
        event_category: event.category,
        venue_name: event.venue,
        response_time_ms: Date.now() - startTime
      });

      // Track conversion
      analytics?.trackConversion('calendar_addition', {
        content_id: event.id.toString(),
        content_type: 'event',
        value: 1
      });

    } catch (error) {
      // Track calendar error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics?.trackError('calendar_add_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'add_to_calendar'
      });
      console.error('Failed to add event to calendar', error);
    }
  };
  
  const handleShare = async (e: GestureResponderEvent) => {
    e.stopPropagation();

    // Track share interaction attempt
    analytics?.trackUserAction('share_attempt', {
      event_id: event.id.toString(),
      event_type: event.type,
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
          content_type: 'event',
          source: 'list',
          referrer_screen: '/events',
          channel: 'system',
        });
      } catch {}

      const shareUrl = buildGathrShareUrl(event);
      const formattedDate = formatEventDateTime(event.startDate, event.startTime);
      const trimmedDescription = event.description?.trim();
      const descriptor = trimmedDescription ? ` ${trimmedDescription}` : '';
      const shareMessage = [
        `Check out ${event.title} at ${event.venue} on ${formattedDate}.${descriptor}`,
        '',
        `See it on GathR: ${shareUrl}`,
      ].join('\n');

      const shareResult = await Share.share({
        message: shareMessage,
        title: event.title,
      });

      // Only increment count if user actually shared (not cancelled)
      if (shareResult.action === Share.sharedAction) {
        // Increment share count in Firestore
        const baseShares = heroShareValueFromEvent;
        const incrementResult = await userService.incrementEventShare(event.id, {
          type: event.type,
          source: 'list',
          referrer: '/events',
          venue: event?.venue,
          category: event?.category,
          baseShares,
        });

        if (incrementResult.success) {
          // Update local store with new count
          setEventShareCount(event.id, incrementResult.count);
        }

        // Track successful share
        analytics?.trackUserAction('share_success', {
          event_id: event.id.toString(),
          event_type: event.type,
          event_category: event.category,
          venue_name: event.venue,
          response_time_ms: Date.now() - startTime,
          new_share_count: incrementResult.count
        });

        // Track conversion
        analytics?.trackConversion('content_share', {
          content_id: event.id.toString(),
          content_type: 'event',
          value: 1
        });
      }

    } catch (error) {
      // Track share error (user cancelled or error occurred)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage !== 'User did not share') {
        analytics?.trackError('share_failed', errorMessage, {
          event_id: event.id.toString(),
          user_action: 'share_event'
        });
      }
      console.error('Error sharing event', error);
    }
  };
  
  const handleTickets = (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    const ticketUrl = event.ticketLinkEvents || event.ticketLinkPosts;
    
    // Track ticket interaction attempt
    analytics?.trackUserAction('ticket_link_attempt', {
      event_id: event.id.toString(),
      event_type: event.type,
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
      // Track successful ticket link opening
      analytics?.trackUserAction('ticket_link_opened', {
        event_id: event.id.toString(),
        event_type: event.type,
        event_category: event.category,
        ticket_price: event.ticketPrice,
        venue_name: event.venue
      });
      
      // Track conversion
      analytics?.trackConversion('ticket_engagement', {
        content_id: event.id.toString(),
        content_type: 'event',
        value: isPaidEvent(event.ticketPrice) ? 1 : 0.5
      });
      
      Linking.openURL(ticketUrl);
    }
  };
  
  const toggleBookmark = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    
    // Track bookmark interaction attempt
    analytics?.trackUserAction('bookmark_attempt', {
      event_id: event.id.toString(),
      event_type: event.type,
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
  type: 'event',
  source: 'list',
  referrer: '/events',
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
        
        // Track bookmark error
        analytics?.trackError('bookmark_failed', result.message || 'Failed to update bookmark', {
          event_id: event.id.toString(),
          user_action: 'toggle_bookmark'
        });
        
        Alert.alert('Error', result.message || 'Failed to update saved event');
      } else {
        // Track successful bookmark toggle
        analytics?.trackUserAction('bookmark_success', {
          event_id: event.id.toString(),
          event_type: event.type,
          event_category: event.category,
          new_bookmark_status: !previousState,
          venue_name: event.venue,
          response_time_ms: Date.now() - startTime
        });
        
        // Track conversion
        analytics?.trackConversion('content_save', {
          content_id: event.id.toString(),
          content_type: 'event',
          value: !previousState ? 1 : -1 // Positive for save, negative for unsave
        });
      }
    } catch (error) {
      // Revert UI state if operation failed
      setBookmarked(bookmarked);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      analytics?.trackError('bookmark_error', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_bookmark'
      });
      
      console.error('Error toggling saved event:', error);
      Alert.alert('Error', 'Failed to update saved event');
    } finally {
      setIsToggling(false);
    }
  };
  
  // Check if there's a valid ticket URL
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
  const heroLikeValueFromEvent = event.likes !== undefined && event.likes !== null ? Number(event.likes) : 0;
  const heroLikeValue = heroLikeLiveValue != null ? heroLikeLiveValue : heroLikeValueFromEvent;
  const heroLikeText = heroLikeValue > 0 ? safeNumberToString(heroLikeValue) : '';

  // Live share count
  const heroShareLiveValue = useEventShareCount(event.id);
  const heroShareValueFromEvent = event.shares !== undefined && event.shares !== null ? Number(event.shares) : 0;
  const heroShareValue = heroShareLiveValue != null ? heroShareLiveValue : heroShareValueFromEvent;
  const heroShareText = heroShareValue > 0 ? safeNumberToString(heroShareValue) : '';

  const heroEngagementMetrics = [
    { key: 'likes', icon: 'thumb-up', value: heroLikeText },
    { key: 'shares', icon: 'share', value: heroShareText },
    { key: 'interested', icon: 'person', value: heroInterestedText },
  ] as { key: string; icon: 'thumb-up' | 'share' | 'person'; value: string }[];
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

  const handleHeroLikePress = async (e: GestureResponderEvent) => {
    e.stopPropagation();
    analytics?.trackUserAction('like_attempt', {
      event_id: event.id.toString(),
      event_type: event.type,
      liked: isHeroLiked,
      is_guest: isGuest,
      interaction_blocked: isGuest,
    });

    if (isGuest) {
      console.log('[GuestLimitation] Like blocked - premium feature for registered users only');
      return;
    }

    if (isHeroLikeToggling) return;

    const actionStart = Date.now();
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
        source: 'list',
        referrer: '/events',
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

      analytics?.trackUserAction('like_success', {
        event_id: event.id.toString(),
        event_type: event.type,
        event_category: event.category,
        venue_name: event.venue,
        liked: result.liked,
        response_time_ms: Date.now() - actionStart,
      });
    } catch (error) {
      setUserPrefs({ likedEvents: previousLikedEvents });
      const errorMessage = error instanceof Error ? error.message : 'Failed to update like';
      console.error('Error toggling like:', error);
      analytics?.trackError('like_failed', errorMessage, {
        event_id: event.id.toString(),
        user_action: 'toggle_like',
      });
      Alert.alert('Error', errorMessage);
    } finally {
      setIsHeroLikeToggling(false);
    }
  };

  return (
    <Animated.View style={isFirstItem && isHighlighted ? tutorialHighlightStyle : {}}>
      <TouchableOpacity
        ref={tutorialRef}
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
      
      {/* Hero Image Section - NEW */}
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
                    source="events_tab"
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

            // Structured-ish build: derive parts and only append range for now/today
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
      
      {/* Description section - Full width with content limitation */}
      <View style={styles.descriptionSection}>
          <GuestLimitedContent
            contentType="description"
            fullText={event.description || ""}
            maxLength={80}
          >
          <Autolink 
            text={event.description}
            style={styles.cardDescription}
            numberOfLines={expanded ? undefined : 2}
            linkStyle={styles.readMoreText}
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
              
              // Track description expansion
              analytics?.trackUserAction('description_expand', {
                event_id: event.id.toString(),
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

// Main Events Screen component
function EventsScreen() {
  // ===============================================================
  // ANALYTICS INTEGRATION - RE-ENABLED
  // ===============================================================
  const analytics = useAnalytics();

  // 🔔 If registration begins, close any open overlays (details sheet, image lightbox)
  const overlayCloseSignal = useGuestLimitationStore(s => s.overlayCloseSignal);
  useEffect(() => {
    try {
      // Close the bottom sheet if present
      if (typeof handleCloseDetails === 'function') {
        handleCloseDetails();
      } else {
        setDetailsVisible?.(false);
        setSelectedEvent?.(null);
      }
    } catch {}
    try {
      // Close the image lightbox if present
      if (typeof handleModalClose === 'function') {
        handleModalClose();
      } else {
        setSelectedImageData?.(null);
      }
    } catch {}
  }, [overlayCloseSignal]);
  
  // DETAILED FIREBASE DIAGNOSTICS
// DETAILED FIREBASE DIAGNOSTICS
useEffect(() => {
  const diagnoseFirebase = async () => {
    try {
      console.log('🔍 FIREBASE DIAGNOSTICS START');
      
      // Check if Firebase module loads
      console.log('🔍 React Native Firebase app module exists:', !!firebase);
      
      // Check available apps
      console.log('🔍 Available Firebase apps:', firebase.apps.length);
      firebase.apps.forEach((app, index) => {
        console.log(`🔍 App ${index}:`, app.name, app.options.projectId);
      });
      
      // Try to access default app
      try {
        const app = firebase.app();
        console.log('✅ Default app found:', app.options);
      } catch (error) {
        console.log('❌ No default app:', error instanceof Error ? error.message : String(error));
      }
      
      console.log('🔍 FIREBASE DIAGNOSTICS END');
    } catch (error) {
      console.error('❌ Firebase diagnostics failed:', error instanceof Error ? error.message : String(error));
    }
  };
  
  diagnoseFirebase();
}, []);

  // Track screen focus for session analytics - RE-ENABLED
  useFocusEffect(
    useCallback(() => {
      const startTime = Date.now();
      
      analytics.trackScreenView('events', {
        content_type: 'event_list',
        user_type: isGuest ? 'guest' : 'registered'
      });
      
      // Return cleanup function to track time spent
      return () => {
        const timeSpent = Date.now() - startTime;
        analytics.trackEngagementDepth('events', timeSpent, {
          interactions: 0,
          featuresUsed: ['event_list']
        });
      };
    }, []) // Keep dependency array empty - this prevents the infinite loop
  );

  // Tutorial auto-advancement detection
  useFocusEffect(
    useCallback(() => {
      setTimeout(() => {
        console.log('🔍 EVENTS SCREEN: Screen focused, checking for tutorial');
        if ((global as any).onEventsScreenNavigated) {
          console.log('🔍 EVENTS SCREEN: Calling tutorial advancement');
          (global as any).onEventsScreenNavigated();
        }
      }, 100);
    }, [])
  );

  // Guest limitation setup
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();

  // Store integration
  const {
    events,
    filteredEvents,
    viewportEvents,
    outsideViewportEvents,
    viewportMetadata,
    isLoading,
    error,
    fetchEvents,
    fetchEventDetails,
    setTypeFilters,
    categories,
    filterCriteria,
    userLocation,
    getTimeFilterCounts,
    getCategoryFilterCounts,
    scrollTriggers,
    isHeaderSearchActive,
    setHeaderSearchActive
  } = useMapStore();

  // 🔎 Cache usage diagnostics: log whether preloaded events are present on mount
  useEffect(() => {
    const len = Array.isArray(events) ? events.length : 0;
    if (len > 0) {
      console.log('[EventsScreen] Using preloaded events from store:', len);
    } else {
      console.log('[EventsScreen] No preloaded events at mount; will wait for store/update');
    }
  }, []);

  // Helper function to get updated event data from store
  const getUpdatedEvent = (eventId: string | number) => {
    return events.find((candidate) => areEventIdsEquivalent(candidate.id, eventId));
  };

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
  
  // Performance tracking
  const [listLoadTime, setListLoadTime] = useState<number | null>(null);
  const [scrollStartTime, setScrollStartTime] = useState<number | null>(null);

  // Scroll to top functionality
  useEffect(() => {
    if (scrollTriggers.events > 0) {
      console.log('[EventsScreen] Scroll trigger detected, scrolling to top');
      
      // Track scroll to top interaction
      analytics?.trackUserAction('scroll_to_top', {
        screen: 'events',
        trigger_source: 'tab_double_tap'
      });
      
      flatListRef.current?.scrollToOffset({ 
        animated: true, 
        offset: 0 
      });
    }
  }, [scrollTriggers.events]); // Remove analytics from dependency array

  // Screen focus detection and tab interaction tracking
  useFocusEffect(
    React.useCallback(() => {
      console.log('[GuestLimitation] Events screen gained focus');
      
      if (isGuest) {
        console.log('[GuestLimitation] Tracking Events tab selection for guest');
        trackTabSelect('events');
      }
    }, [isGuest])
  );
  
  // Native ads setup
  const adFrequency = 4;
  const totalEventCount = events.length;
  const calculatedAdCount = Math.ceil(totalEventCount / adFrequency);
  const minAdCount = 2;
  const maxAdCount = 10;
  const adCount = Math.max(minAdCount, Math.min(calculatedAdCount, maxAdCount));
  const nativeAds = useNativeAds(adCount, 'events');
  
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
  
  // Read saved events, interests, and favorite venues from the centralized cache
  const savedEvents = useUserPrefsStore((s: UserPrefsState) => s.savedEvents);
  const userInterests = useUserPrefsStore((s: UserPrefsState) => s.interests);
  const favoriteVenues = useUserPrefsStore((s: UserPrefsState) => s.favoriteVenues);
  
  // Tutorial awareness for events filters
  const filtersRef = useRef<View>(null);
  const filtersPulseAnim = useRef(new Animated.Value(1)).current;
  const [filtersHighlighted, setFiltersHighlighted] = useState(false);

  // Tutorial measurement stability control (filters bar)
  const filtersHasMeasuredRef = useRef(false);
  const filtersLastLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const filtersStableCountRef = useRef(0);
  const filtersStartTsRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const g: any = global as any;
      const globalFlag = g.tutorialHighlightEventsFilters || false;

      // If another instance already finalized, stop quietly to avoid duplicate "FINALIZED" logs
      if (g.eventsFiltersStable) {
        clearInterval(interval);
        return;
      }

      // Track flag changes locally
      if (globalFlag !== filtersHighlighted) {
        setFiltersHighlighted(globalFlag);
        // When highlight turns ON, reset stability trackers & start timing window
        if (globalFlag) {
          filtersStableCountRef.current = 0;
          filtersLastLayoutRef.current = null;
          filtersHasMeasuredRef.current = false;
          filtersStartTsRef.current = Date.now();
        }
      }

      // If flag is OFF, skip measuring but KEEP polling (manager may turn it on shortly)
      if (!globalFlag) {
        return;
      }

      // Guard: ensure timer exists
      if (filtersStartTsRef.current == null) {
        filtersStartTsRef.current = Date.now();
      }
      const elapsed = Date.now() - filtersStartTsRef.current!;
      // Small manager delay for this step is ~250ms — give it room + any header/layout nudges
      const maxMs = 2600;      // hard cap (~2.6s) to avoid endless polling
      const minStableMs = 900; // don't finalize too early; wait a bit past the delay

      // Measure until stable OR time-cap
      if (filtersRef.current) {
        filtersRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
          const cur = { x, y, width, height };
          g.eventsFiltersLayout = cur;

          if (!filtersHasMeasuredRef.current) {
            filtersHasMeasuredRef.current = true;
          }

          const prev = filtersLastLayoutRef.current;
          if (prev) {
            const dx = Math.abs(cur.x - prev.x);
            const dy = Math.abs(cur.y - prev.y);
            const dw = Math.abs(cur.width - prev.width);
            const dh = Math.abs(cur.height - prev.height);
            const isStableNow = dx < 2 && dy < 2 && dw < 2 && dh < 2;
            filtersStableCountRef.current = isStableNow ? (filtersStableCountRef.current + 1) : 0;
          } else {
            filtersStableCountRef.current = 0;
          }
          filtersLastLayoutRef.current = cur;

          const stable = filtersStableCountRef.current >= 3;
          const timedOut = elapsed >= maxMs;
          const stableLongEnough = stable && elapsed >= minStableMs;

          if (stableLongEnough || (timedOut && filtersHasMeasuredRef.current)) {
            const firstFinalizer = !g.eventsFiltersStable;
            g.eventsFiltersStable = true;
            clearInterval(interval);
            if (firstFinalizer) {
              console.log('Tutorial: Events filters measurement FINALIZED; polling stopped', { cur, stable, elapsed });
            }
          } else {
            // Sample occasional logs during stabilization
            if (Math.random() < 0.1) {
              console.log('Tutorial: Measured events filters:', cur);
            }
          }
        });
      }
    }, 200);

    return () => clearInterval(interval);
  }, [filtersHighlighted]);

  useEffect(() => {
    if (filtersHighlighted) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(filtersPulseAnim, { toValue: 1.05, useNativeDriver: true, duration: 800 }),
          Animated.timing(filtersPulseAnim, { toValue: 1, useNativeDriver: true, duration: 800 }),
        ])
      ).start();
    } else {
      filtersPulseAnim.stopAnimation();
      filtersPulseAnim.setValue(1);
    }
  }, [filtersHighlighted]);

  
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
  
// NEW: Fetch enhanced details for events that haven't been processed yet
useEffect(() => {
  if (events.length > 0) {
    const eventIds = events
      .filter(event => event.type === 'event')
      .filter(event => {
        // Check if event has been processed by enhancement API
        // Events that have been enhanced will have these properties (even if empty)
        const hasBeenEnhanced = event.hasOwnProperty('fullDescription') || 
                                event.hasOwnProperty('ticketLinkPosts') || 
                                event.hasOwnProperty('ticketLinkEvents');
        
        return !hasBeenEnhanced;
      })
      .map(event => event.id);
    
    if (eventIds.length > 0) {
      console.log('Events tab: Fetching enhanced details for', eventIds.length, 'events');
      fetchEventDetails(eventIds);
    } else {
      console.log('Events tab: All events already have enhanced details, skipping fetch');
    }
  }
}, [events.length]); // Trigger when events count changes
  
  // ===============================================================
  // ANALYTICS-ENHANCED FILTER HANDLERS
  // ===============================================================
  
  const handleTimeFilterChange = (filter: TimeFilterType) => {
    console.log(`[GuestLimitation] Time filter click: ${filter}`);
    
    // Track filter interaction
    const filterChangeStartTime = Date.now();
    const previousFilter = filterCriteria.eventFilters.timeFilter;
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Filter interaction blocked - allowing action but prompt should show');
    }
    
    const newFilter = filterCriteria.eventFilters.timeFilter === filter 
      ? TimeFilterType.ALL 
      : filter;
    
    console.log(`Changing time filter from ${filterCriteria.eventFilters.timeFilter} to: ${newFilter}`);
    
    // Apply filter
    setTypeFilters('event', { timeFilter: newFilter });
    
    // Track filter effectiveness after a brief delay to get updated counts
    setTimeout(() => {
      const filterChangeTime = Date.now() - filterChangeStartTime;
      const timeFilterCounts = getTimeFilterCounts('event');
      
      analytics?.trackEventFilter('time', newFilter, {
        previous_filter: previousFilter,
        result_count: timeFilterCounts[newFilter] || 0,
        filter_change_time_ms: filterChangeTime,
        content_type: 'events',
        is_guest: isGuest
      });
      
      // Track filter effectiveness
      analytics?.trackUserAction('filter_effectiveness', {
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
    
    const currentlyFiltering = filterCriteria.eventFilters.savedOnly === true;
    const newSavedFilter = !currentlyFiltering;
    
    // Track saved filter usage
    analytics?.trackEventFilter('saved', newSavedFilter.toString(), {
      previous_value: currentlyFiltering.toString(),
      saved_events_count: savedEvents.length,
      content_type: 'events',
      is_guest: isGuest
    });
    
    setTypeFilters('event', { savedOnly: newSavedFilter });
  };

  const handleCategoryClearFilter = () => {
    console.log('[GuestLimitation] Category clear filter click');
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category clear filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track category filter clear
    analytics?.trackEventFilter('category', 'clear', {
      previous_category: filterCriteria.eventFilters.category || 'none',
      content_type: 'events',
      is_guest: isGuest
    });
    
    setTypeFilters('event', { category: undefined });
  };

  const handleCategorySelect = (category: string) => {
    console.log(`[GuestLimitation] Category filter click: ${category}`);
    
    if (isGuest && !trackInteraction(InteractionType.LIST_FILTER)) {
      console.log('[GuestLimitation] Category filter interaction blocked - allowing action but prompt should show');
    }
    
    // Track category filter selection with effectiveness metrics
    setTimeout(() => {
      const categoryFilterCounts = getCategoryFilterCounts('event');
      
      analytics?.trackEventFilter('category', category, {
        result_count: categoryFilterCounts[category] || 0,
        user_has_interest: userInterests.includes(category),
        content_type: 'events',
        is_guest: isGuest
      });
    }, 100);
  };

  // ===============================================================
  // ANALYTICS-ENHANCED EVENT HANDLERS
  // ===============================================================
  
  const handleEventPress = (event: Event) => {
    console.log(`[GuestLimitation] Event press: ${event.title}`);
    
    // Track event discovery and interaction
    const eventDiscoveryData = {
      event_id: event.id.toString(),
      event_type: event.type,
      event_category: event.category,
      venue_name: event.venue,
      discovery_method: 'list_view',
      matches_user_interests: matchesUserInterests(event),
      is_saved: isEventSaved(event),
      time_status: getEventTimeStatus(event),
      has_ticket_price: !!event.ticketPrice,
      is_guest: isGuest,
      list_position: [...sortedViewportEvents, ...sortedOutsideViewportEvents].findIndex(e => e.id === event.id) + 1,
      total_list_items: sortedViewportEvents.length + sortedOutsideViewportEvents.length
    };
    
    // Track event view
    analytics?.trackEventViewWithContext(eventDiscoveryData);
    
    // Track content discovery
    analytics?.trackUserAction('content_discovery', {
      ...eventDiscoveryData,
      discovery_source: 'events_list'
    });
    
    if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
      console.log('[GuestLimitation] Event click interaction blocked - allowing action but prompt should show');
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
    
    // Track image interaction
    analytics?.trackUserAction('image_view', {
      event_id: event.id.toString(),
      event_type: event.type,
      image_type: event.imageUrl ? 'post_image' : 'profile_image',
      discovery_method: 'list_view',
      is_guest: isGuest
    });
    
if (isGuest && !trackInteraction(InteractionType.LIST_ITEM_CLICK)) {
  console.log('[GuestLimitation] Image click interaction blocked - allowing action but prompt should show');
}

// DEBUG: compare address in prop vs store before opening lightbox
try {
  const storeEvent = events.find(e => e.id === event.id);
  console.log('[AddressFlow][EventsTab->Lightbox]', {
    id: event.id,
    propAddress: event.address,
    storeAddress: storeEvent?.address,
    propHasCoords: !!(event.latitude != null && event.longitude != null),
    storeHasCoords: !!(storeEvent?.latitude != null && storeEvent?.longitude != null),
  });
} catch {}

setSelectedImageData({ imageUrl, event });

  };

  // Get dynamic filter counts
  const timeFilterCounts = getTimeFilterCounts('event');
  const categoryFilterCounts = getCategoryFilterCounts('event');
  
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
  // ENHANCED SCROLL HANDLER WITH ANALYTICS
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
          trackScrollInteraction('events');
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
        
        // Track scroll depth for engagement analytics (every 25% of content)
        const contentHeight = (sortedViewportEvents.length + sortedOutsideViewportEvents.length) * 200; // Approximate item height
        const scrollPercentage = Math.floor((currentScrollY / contentHeight) * 100);
        
        if (scrollPercentage > 0 && scrollPercentage % 25 === 0) {
          analytics?.trackUserAction('scroll_depth', {
            screen: 'events',
            scroll_percentage: scrollPercentage,
            content_type: 'events_list',
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
      screen: 'events',
      scroll_position: lastScrollY.current
    });
    
    flatListRef.current?.scrollToOffset({ 
      animated: true, 
      offset: 0 
    });
  };

  // Filter viewport events
  const filteredViewportEvents = useMemo(() => {
    let filtered = viewportEvents.filter(event => event.type === 'event');

    if (filterCriteria.eventFilters.savedOnly) {
      filtered = filtered.filter(e => isEventSaved(e));
    }

    const timeFilter = filterCriteria.eventFilters.timeFilter;
    if (timeFilter === 'now') {
      filtered = filtered.filter(e => isEventNow(e.startDate, e.startTime, e.endDate, e.endTime));
    } else if (timeFilter === 'today') {
      filtered = filtered.filter(e => isEventHappeningToday(e));
    }

    // Apply search filter if active
    const searchTerm = filterCriteria.eventFilters.search?.toLowerCase().trim();
    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(searchTerm) ||
        e.description.toLowerCase().includes(searchTerm) ||
        e.venue.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }, [viewportEvents, filterCriteria, savedEvents]);

  // Filter outside-viewport events
  const filteredOutsideViewportEvents = useMemo(() => {
    let filtered = outsideViewportEvents.filter(event => event.type === 'event');

    if (filterCriteria.eventFilters.savedOnly) {
      filtered = filtered.filter(e => isEventSaved(e));
    }

    const timeFilter = filterCriteria.eventFilters.timeFilter;
    if (timeFilter === 'now') {
      filtered = filtered.filter(e => isEventNow(e.startDate, e.startTime, e.endDate, e.endTime));
    } else if (timeFilter === 'today') {
      filtered = filtered.filter(e => isEventHappeningToday(e));
    }

    // Apply search filter if active
    const searchTerm = filterCriteria.eventFilters.search?.toLowerCase().trim();
    if (searchTerm) {
      filtered = filtered.filter(e =>
        e.title.toLowerCase().includes(searchTerm) ||
        e.description.toLowerCase().includes(searchTerm) ||
        e.venue.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }, [outsideViewportEvents, filterCriteria, savedEvents]);

  // Enhanced sorting with analytics tracking
  const sortAndPrioritizeEvents = (events: Event[]): Event[] => {
    const sortStartTime = Date.now();
    
    const eventsWithScores = events.map(event => {
      const isSaved = isEventSaved(event);
      const timeStatus = getEventTimeStatus(event);
      const matchesInterest = matchesUserInterests(event);

      // Check if event is from a favorite venue
      const eventLocationKey = createLocationKeyFromEvent(event);
      const isFromFavoriteVenue = favoriteVenues.includes(eventLocationKey);

      const scoreCategory = matchesInterest ? 'INTEREST_MATCH' : 'NON_INTEREST';
      const baseScore = BASE_SCORES[scoreCategory][timeStatus];

      let proximityMultiplier = 1.0;
      let distance = Infinity;

      if (userLocation) {
        distance = calculateDistance(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          event.latitude,
          event.longitude
        );

        for (const band of DISTANCE_BANDS) {
          if (distance <= band.maxDistance) {
            proximityMultiplier = band.multiplier;
            break;
          }
        }
      }

      const engagementTierPoints = calculateEngagementTier(event);
      // Add favorite venue bonus to composite score
      const favoriteVenueBonus = isFromFavoriteVenue ? FAVORITE_VENUE_BONUS : 0;
      const compositeScore = (baseScore * proximityMultiplier) + engagementTierPoints + favoriteVenueBonus;

      return {
        event,
        isSaved,
        isFromFavoriteVenue,
        timeStatus,
        compositeScore,
        distance
      };
    });
    
    // Group and sort
    const savedNowEvents = eventsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'now'
    );
    const savedTodayEvents = eventsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'today'
    );
    const savedFutureEvents = eventsWithScores.filter(item => 
      item.isSaved && item.timeStatus === 'future'
    );
    const unsavedEvents = eventsWithScores.filter(item => !item.isSaved);
    
    [savedNowEvents, savedTodayEvents, savedFutureEvents, unsavedEvents].forEach(group => {
      group.sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) {
          return b.compositeScore - a.compositeScore;
        }
        return a.distance - b.distance;
      });
    });
    
    const sortedEvents = [
      ...savedNowEvents.map(item => item.event),
      ...savedTodayEvents.map(item => item.event),
      ...savedFutureEvents.map(item => item.event),
      ...unsavedEvents.map(item => item.event)
    ];
    
    // Track sorting performance
    const sortTime = Date.now() - sortStartTime;
    analytics?.trackPerformance('events_sort', sortTime, {
      events_count: events.length,
      sort_time_ms: sortTime,
      has_user_location: !!userLocation,
      user_interests_count: userInterests.length
    });
    
    return sortedEvents;
  };

  // Apply priority sorting to viewport section
  const sortedViewportEvents = useMemo(() => {
    return sortAndPrioritizeEvents(filteredViewportEvents);
  }, [filteredViewportEvents, userLocation, userInterests, savedEvents, favoriteVenues]);

  // Apply priority sorting to outside-viewport section
  const sortedOutsideViewportEvents = useMemo(() => {
    return sortAndPrioritizeEvents(filteredOutsideViewportEvents);
  }, [filteredOutsideViewportEvents, userLocation, userInterests, savedEvents, favoriteVenues]);

  // State for pagination of outside-viewport events
  const [outsideViewportLoadCount, setOutsideViewportLoadCount] = useState(10);
  const loadMoreBatchSize = 20;
  
  // Create events with ads list
  type EventListItem = {
    type: 'event';
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
    };
  };

  type ListItem = EventListItem | DividerItem | AdListItem;
  
  const eventsWithAds = useMemo<ListItem[]>(() => {
    const result: ListItem[] = [];
    const adFrequency = 4;
    let adIndex = 0;

    // Add viewport events with ads
    sortedViewportEvents.forEach((event, index) => {
      result.push({ type: 'event', data: event });

      // Insert ad every 4 events
      if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
        const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
        if (validAds.length > 0) {
          result.push({
            type: 'ad',
            data: validAds[adIndex % validAds.length]
          });
          adIndex++;
        }
      }
    });

    // Add divider if outside-viewport events exist
    if (sortedOutsideViewportEvents.length > 0) {
      result.push({
        type: 'divider',
        data: {
          message: 'Events outside your current map view',
          count: sortedOutsideViewportEvents.length
        }
      });
    }

    // Add outside-viewport events (paginated) with ads interspersed
    const outsideViewportToShow = sortedOutsideViewportEvents.slice(0, outsideViewportLoadCount);
    outsideViewportToShow.forEach((event, index) => {
      result.push({ type: 'event', data: event });

      // Continue inserting ads every 4 events in outside-viewport section
      if ((index + 1) % adFrequency === 0 && nativeAds.length > 0) {
        const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
        if (validAds.length > 0) {
          result.push({
            type: 'ad',
            data: validAds[adIndex % validAds.length]
          });
          adIndex++;
        }
      }
    });

    // Low-count fallback for viewport section: if 1–3 events, append one ad at the end of viewport section
    if (sortedViewportEvents.length > 0 && sortedViewportEvents.length < adFrequency && nativeAds.length > 0 && sortedOutsideViewportEvents.length === 0) {
      const validAds = nativeAds.filter(ad => ad.ad !== null && !ad.loading);
      if (validAds.length > 0) {
        result.push({
          type: 'ad',
          data: validAds[0]
        });
      }
    }

    return result;
  }, [sortedViewportEvents, sortedOutsideViewportEvents, nativeAds, outsideViewportLoadCount]);
  
  // Track priority effectiveness
  useEffect(() => {
    if (sortedViewportEvents.length > 0) {
      const topEvents = sortedViewportEvents.slice(0, 10);
      const interestMatches = topEvents.filter(e => matchesUserInterests(e)).length;
      const savedEventsInTop = topEvents.filter(e => isEventSaved(e)).length;

      analytics?.trackUserAction('priority_effectiveness', {
        top_10_interest_matches: interestMatches,
        top_10_saved_events: savedEventsInTop,
        viewport_events: sortedViewportEvents.length,
        outside_viewport_events: sortedOutsideViewportEvents.length,
        total_events: sortedViewportEvents.length + sortedOutsideViewportEvents.length,
        user_interests_count: userInterests.length,
        personalization_score: (interestMatches + savedEventsInTop) / 10
      });
    }
  }, [sortedViewportEvents, sortedOutsideViewportEvents, userInterests, savedEvents]); // Remove analytics from dependency array
    
  // Close event details
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
        <Text style={styles.statusText}>Loading events...</Text>
      </View>
    );
  }
  
  // Error state
  if (error) {
    // Track error state
    analytics?.trackError('events_list_error', error, {
      screen: 'events',
      user_action: 'view_events_list'
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

  // Handle loading more outside-viewport events
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
            filtersHighlighted ? {
              shadowColor: '#FF6B35',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 12,
              elevation: 15,
              borderWidth: 3,
              borderColor: '#FF8C42',
              borderRadius: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              transform: [{ scale: filtersPulseAnim }],
            } : {}
          ]}
        >
          <View 
            ref={filtersRef}
            style={styles.filtersContainer}
            onLayout={() => {
              // Immediate measurement for tutorial (only if not already finalized/stable)
              const g: any = global as any;
              if (g.tutorialHighlightEventsFilters && !g.eventsFiltersStable && filtersRef.current) {
                filtersRef.current.measureInWindow((x: number, y: number, width: number, height: number) => {
                  g.eventsFiltersLayout = { x, y, width, height };
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
              {filterCriteria.eventFilters.timeFilter === TimeFilterType.ALL ? "Showing All" : "Show All"}
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
              filterCriteria.eventFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.NOW)}
          >
            <MaterialIcons 
              name="access-time" 
              size={14} 
              color={filterCriteria.eventFilters.timeFilter === TimeFilterType.NOW ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.NOW && styles.activeTimeFilterText
            ]}>
              Happening Now ({timeFilterCounts[TimeFilterType.NOW]})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillToday,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.TODAY)}
          >
            <MaterialIcons 
              name="today" 
              size={14} 
              color={filterCriteria.eventFilters.timeFilter === TimeFilterType.TODAY ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.TODAY && styles.activeTimeFilterText
            ]}>
              Today ({timeFilterCounts[TimeFilterType.TODAY]})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillTomorrow,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.TOMORROW && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.TOMORROW)}
          >
            <MaterialIcons 
              name="wb-sunny" 
              size={14} 
              color={filterCriteria.eventFilters.timeFilter === TimeFilterType.TOMORROW ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.TOMORROW && styles.activeTimeFilterText
            ]}>
              Tomorrow ({timeFilterCounts[TimeFilterType.TOMORROW]})
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.timeFilterPill,
              styles.timeFilterPillUpcoming,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterPill
            ]}
            onPress={() => handleTimeFilterChange(TimeFilterType.UPCOMING)}
          >
            <MaterialIcons 
              name="event" 
              size={14} 
              color={filterCriteria.eventFilters.timeFilter === TimeFilterType.UPCOMING ? '#FFFFFF' : '#666666'} 
              style={styles.timeFilterIcon}
            />
            <Text style={[
              styles.timeFilterText,
              filterCriteria.eventFilters.timeFilter === TimeFilterType.UPCOMING && styles.activeTimeFilterText
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
              {filterCriteria.eventFilters.category === undefined ? "Showing All" : "Show All"}
            </Text>
          </TouchableOpacity>
        </View>
        
        {(() => {
          const sortedCounts = sortCategoriesByPriorityAndCount(categoryFilterCounts, userInterests);
          
          return (
            <CategoryFilterOptions 
              type="event" 
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
            Prioritizing events by your interests
          </Text>
        </Animated.View>
      )}
      
      {/* Event list with ads */}
     {/* Event list with ads */}
      <FlatList
          ref={flatListRef}
          data={eventsWithAds}
          keyExtractor={(item, index) => {
            if (item.type === 'event') return `event-${item.data.id}`;
            if (item.type === 'ad') return `ad-${index}`;
            if (item.type === 'divider') return `divider-${index}`;
            return `item-${index}`;
          }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            { 
              paddingTop: Math.max(headerHeight, 120) + (showBanner ? 35 : 0) + 8 // Added +8 for breathing room
            }
          ]}
          renderItem={({ item, index }) => {
            if (item.type === 'divider') {
              return <DividerComponent message={item.data.message} count={item.data.count} />;
            }

            if (item.type === 'ad') {
              return (
                <View style={styles.adContainer}>
                  <NativeAdComponent
                    nativeAd={item.data.ad}
                    loading={item.data.loading}
                  />
                </View>
              );
            }

            // item.type === 'event'
            // Find the index of this event in the original events array to determine if it's first
            const eventIndex = eventsWithAds.slice(0, index + 1).filter(i => i.type === 'event').length - 1;
            const isFirstEventItem = eventIndex === 0;

            return (
              <EventListItem
                event={getUpdatedEvent(item.data.id) || item.data}
                onPress={() => handleEventPress(getUpdatedEvent(item.data.id) || item.data)}
                onImagePress={handleImagePress}
                matchesUserInterests={matchesUserInterests(item.data)}
                isSaved={isEventSaved(item.data)}
                isGuest={isGuest}
                analytics={analytics || {}} // Pass empty object if null
                isFirstItem={isFirstEventItem} // NEW: Only first event gets tutorial
              />
            );
          }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.statusText}>
              No events match your current filters
            </Text>
          </View>
        }
        onEndReached={() => {
          // Load more outside-viewport events
          handleLoadMoreOutsideViewport();

          // Track list end reached for engagement
          analytics?.trackUserAction('list_end_reached', {
            screen: 'events',
            total_items: eventsWithAds.length,
            scroll_engagement: 'high'
          });
        }}
        onEndReachedThreshold={0.5}
      />
      
      
      
      {/* Event details bottom sheet */}
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

// Updated Styles with Hero Image Layout
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
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    marginHorizontal: 12, // Match card spacing
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
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
    flex: 1.4,
  },
  timeFilterPillToday: {
    flex: 0.75,
  },
  timeFilterPillTomorrow: {
    flex: 0.95,
  },
  timeFilterPillUpcoming: {
    flex: 1.05,
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
  // NEW: Updated card styles with framing
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
    borderLeftWidth: 4, // Thick left border instead of full border
    backgroundColor: '#FAFFF9',
  },
  interestMatchCard: {
    borderLeftColor: BRAND.primary,
    borderLeftWidth: 4, // Thick left border instead of full border
    backgroundColor: '#F5F9FF',
  },
  savedCard: {
    borderLeftColor: '#FFD700',
    borderLeftWidth: 4, // Thick left border instead of full border
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
  // NEW: Hero Image Section Styles
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
  heroImageContainer: {
    position: 'relative',
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
    height: 300, // Increased to reveal more vertical area
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
    marginLeft: 2,
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
  // UPDATED: Content section now full-width below image
  contentSection: {
    paddingHorizontal: 16, // Horizontal padding for edge spacing
    paddingVertical: 12,
    paddingTop: 4, // Reduced since we have spacing from heroImageSection
    paddingBottom: 8, // Reduced to closer connect with description
  },
  // NEW: Description section that takes full width
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
  cardDescription: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 18,
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
});

export default EventsScreen;
