import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Share,
  Linking,
  Platform,
  Alert,
  Animated
} from 'react-native';

import { usePathname } from 'expo-router';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { GestureHandlerRootView, PanGestureHandler, ScrollView as GestureScrollView, State } from 'react-native-gesture-handler';

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';


import ImageView from "react-native-image-viewing";
import FallbackImage from '../common/FallbackImage';
import { VenueFavoriteButton } from '../common/VenueFavoriteButton';
import Autolink from 'react-native-autolink';

import type { Event, Venue, Cluster } from '../../types/events';
import { useMapStore } from '../../store/mapStore';
import { addToCalendar } from '../../utils/calendarUtils';
import { isValidImageUrl, getCategoryFallbackImage } from '../../utils/imageUtils';
import {
  formatEventDateTime,
  combineDateAndTime,
  getEventTimeStatus,
  formatTime
} from '../../utils/dateUtils';
import { createLocationKeyFromEvent } from '../../utils/priorityUtils';
import { buildGathrSharePayload } from '../../utils/shareUtils';
import { areEventIdsEquivalent } from '../../lib/api/firestoreEvents';

// Store imports for like/share functionality
import * as userService from '../../services/userService';
import { useUserPrefsStore } from '../../store/userPrefsStore';
import { useEventLikeCount, setEventLikeCount, startEventLikesListener, stopEventLikesListener } from '../../store/eventLikesStore';
import { useEventShareCount, setEventShareCount, startEventSharesListener, stopEventSharesListener } from '../../store/eventSharesStore';
import { useEventInterestedCount, setEventInterestedCount, startEventInterestedListener, stopEventInterestedListener } from '../../store/eventInterestedStore';

// ===============================================================
// GUEST LIMITATION IMPORTS
// ===============================================================
import { useAuth } from '../../contexts/AuthContext';
import { useGuestInteraction } from '../../hooks/useGuestInteraction';
import { InteractionType } from '../../types/guestLimitations';
import { GuestLimitedContent } from '../GuestLimitedContent';
import { LockIcon } from '../LockIcon';
import { RegistrationPrompt } from '../RegistrationPrompt';
import { useGuestLimitationStore } from '../../store/guestLimitationStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- Local helper to derive label/start/end from already-formatted strings ---
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



// Helper function to get color for event category
const getCategoryColor = (category: string): string => {
  switch (category.toLowerCase()) {
    case 'live music': return '#E94E77';
    case 'comedy show': return '#F1984D';
    case 'cabaret': return '#7B68EE';
    case 'sports': return '#4CAF50';
    case 'meeting': return '#2196F3';
    default: return '#757575';
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

// Identify ticket provider from URL host for analytics
const ticketProvider = (url?: string): string => {
  if (!url) return 'unknown';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

    // Known platforms
    if (host.includes('eventbrite')) return 'eventbrite';
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('showpass')) return 'showpass';
    if (host.includes('ticketmaster')) return 'ticketmaster';
    if (host.includes('universe.com')) return 'universe';
    if (host.includes('dice.fm')) return 'dice';
    if (host.includes('bandsintown')) return 'bandsintown';
    if (host.includes('etix')) return 'etix';
    if (host.includes('ticketleap')) return 'ticketleap';

    // Heuristics for unknowns
    const hasTicketyWords = /(ticket|tix|events?)/.test(host);
    const isLikelyVenue = host.split('.').length <= 2 && !hasTicketyWords;

    if (isLikelyVenue) return 'venue';
    if (hasTicketyWords) return 'ticketing';
    return 'other';
  } catch {
    return 'unknown';
  }
};

interface EventImageLightboxProps {
  imageUrl: string;
  event: Event;
  venue?: Venue;
  cluster?: Cluster;
  onClose: () => void;
  // Navigation props for swipe between carousel items
  events?: Event[];
  currentIndex?: number;
  onNavigate?: (index: number) => void;
}

const EventImageLightbox: React.FC<EventImageLightboxProps> = ({
  imageUrl,
  event,
  venue,
  cluster,
  onClose,
  events,
  currentIndex,
  onNavigate,
}) => {
  // Add store subscription to get fresh event data
  const storeEvents = useMapStore((state) => state.events);
  
  // Helper function to get updated event data from store
  const getUpdatedEvent = (eventId: string | number) => {
    return storeEvents.find((candidate) => areEventIdsEquivalent(candidate.id, eventId));
  };


// Use updated event data with fallback to original prop (keep prop fields!)
  const updatedFromStore = getUpdatedEvent(event.id);
  const updatedEvent = { ...event, ...(updatedFromStore || {}) };

// If address is missing, fetch details for this id
  const fetchEventDetails = useMapStore(s => s.fetchEventDetails);

  // Map actions for opening EventCallout from "View Venue" button
  const selectVenues = useMapStore(s => s.selectVenues);
  const selectCluster = useMapStore(s => s.selectCluster);
  const selectVenue = useMapStore(s => s.selectVenue);
  const setSelectedImageData = useMapStore(s => s.setSelectedImageData);

  useEffect(() => {
    if (!updatedEvent?.address) {
      console.log('[AddressFlow][Lightbox] requestingDetails', { id: event.id });
      fetchEventDetails?.([event.id]);
    }
  }, [event.id, updatedEvent?.address]);


// DEBUG: trace address flow into lightbox
try {
  const storeCopy = getUpdatedEvent(event.id);
  console.log('[AddressFlow][Lightbox] prop', {
    id: event.id,
    venue: event.venue,
    address: event.address,
    lat: event.latitude,
    lon: event.longitude,
  });
  console.log('[AddressFlow][Lightbox] store', {
    present: !!storeCopy,
    id: event.id,
    venue: storeCopy?.venue,
    address: storeCopy?.address,
    lat: storeCopy?.latitude,
    lon: storeCopy?.longitude,
  });
  console.log('[AddressFlow][Lightbox] used', {
    id: updatedEvent.id,
    venue: updatedEvent.venue,
    address: updatedEvent.address,
    lat: updatedEvent.latitude,
    lon: updatedEvent.longitude,
  });
} catch {}


  // ===============================================================
  // GUEST LIMITATION SETUP
  // ===============================================================
  const { user } = useAuth();
  const isGuest = !user;
  const { trackInteraction } = useGuestInteraction();

  // ===============================================================
  // STATE - Only what we actually need
  // ===============================================================

  // Like/Share state
  const [isLikeToggling, setIsLikeToggling] = useState(false);
  const eventIdString = String(updatedEvent.id);

  // Get user's liked events from store
  type UserPrefsState = { likedEvents: string[]; setAll: (updates: Partial<UserPrefsState>) => void };
  const likedEvents = useUserPrefsStore((s: UserPrefsState) => s.likedEvents);
  const setUserPrefs = useUserPrefsStore.getState().setAll;
  const isLiked = likedEvents.includes(eventIdString);

  // Live like count
  const likeLiveValue = useEventLikeCount(updatedEvent.id);
  const likeValueFromEvent = updatedEvent.likes !== undefined && updatedEvent.likes !== null ? Number(updatedEvent.likes) : 0;
  const likeValue = likeLiveValue != null ? likeLiveValue : likeValueFromEvent;
  const likeText = likeValue > 0 ? String(likeValue) : '';

  // Live share count
  const shareLiveValue = useEventShareCount(updatedEvent.id);
  const shareValueFromEvent = updatedEvent.shares !== undefined && updatedEvent.shares !== null ? Number(updatedEvent.shares) : 0;
  const shareValue = shareLiveValue != null ? shareLiveValue : shareValueFromEvent;
  const shareText = shareValue > 0 ? String(shareValue) : '';

  // Live interested count (calendar adds)
  const [isInterestedToggling, setIsInterestedToggling] = useState(false);
  type UserPrefsStateWithInterested = { interestedEvents: string[]; setAll: (updates: Partial<UserPrefsStateWithInterested>) => void };
  const interestedEvents = useUserPrefsStore((s: UserPrefsStateWithInterested) => s.interestedEvents);
  const isInterested = interestedEvents.includes(eventIdString);
  const interestedLiveValue = useEventInterestedCount(updatedEvent.id);
  const interestedValueFromEvent = updatedEvent.interested !== undefined && updatedEvent.interested !== null ? Number(updatedEvent.interested) : 0;
  const interestedValue = interestedLiveValue != null ? interestedLiveValue : interestedValueFromEvent;

  // Combine usersResponded (Facebook) with interested (GathR) for the person icon badge
  const facebookUsersResponded = updatedEvent.usersResponded !== undefined && updatedEvent.usersResponded !== null ? Number(updatedEvent.usersResponded) : 0;
  const combinedInterestedValue = facebookUsersResponded + interestedValue;
  const interestedText = combinedInterestedValue > 0 ? String(combinedInterestedValue) : '';

  // Engagement metrics for overlay - always show (share button always visible)
  const showEngagementOverlay = true;

  // State for full-screen image viewer
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  // State to prevent gesture conflicts when image viewer closes
  const [justClosedImageViewer, setJustClosedImageViewer] = useState(false);

  // Track if the thumbnail is using a fallback image (URL failed to load or was missing)
  const [isUsingFallbackImage, setIsUsingFallbackImage] = useState(false);
  
  // Animation values for swipe-to-close
  const translateY = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(1)).current;

  // Animation value for horizontal swipe navigation
  const translateX = useRef(new Animated.Value(0)).current;

  // Refs for gesture handler coordination
  const verticalPanRef = useRef(null);
  const horizontalPanRef = useRef(null);

  // Navigation state
  const canNavigatePrev = events && currentIndex !== undefined && currentIndex > 0;
  const canNavigateNext = events && currentIndex !== undefined && currentIndex < events.length - 1;

  // Refs to track current values for gesture handlers (avoids stale closure)
  const currentIndexRef = useRef(currentIndex);
  const onNavigateRef = useRef(onNavigate);
  const eventsLengthRef = useRef(events?.length ?? 0);

  // Keep refs updated
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    onNavigateRef.current = onNavigate;
    eventsLengthRef.current = events?.length ?? 0;
  }, [currentIndex, onNavigate, events?.length]);

  // Reset fallback state when imageUrl changes (navigating between events)
  useEffect(() => {
    setIsUsingFallbackImage(false);
  }, [imageUrl]);

  // Start/stop like, share, and interested listeners
  useEffect(() => {
    if (!updatedEvent.id) return;
    startEventLikesListener(updatedEvent.id);
    startEventSharesListener(updatedEvent.id);
    startEventInterestedListener(updatedEvent.id);
    return () => {
      stopEventLikesListener(updatedEvent.id);
      stopEventSharesListener(updatedEvent.id);
      stopEventInterestedListener(updatedEvent.id);
    };
  }, [updatedEvent.id]);

  // (read-more removed; description is now scrollable)

// --- description scroll state for fade/affordance ---
const [descLayoutHeight, setDescLayoutHeight] = useState(0);
const [descCanScroll, setDescCanScroll] = useState(false);
const [descAtEnd, setDescAtEnd] = useState(true);
const [descAtTop, setDescAtTop] = useState(true);


  // Gesture-handler setup: scroll in description; swipe-to-close elsewhere
  const descriptionScrollRef = useRef(null);

  const onPanGestureEvent = useRef(
    Animated.event(
      [{ nativeEvent: { translationY: translateY } }],
      {
        useNativeDriver: true,
        listener: (event: { nativeEvent: { translationY: number } }) => {
  const dy = event.nativeEvent.translationY;
  const clamped = Math.max(0, dy); // only downward
  const progress = Math.min(clamped / 150, 1); // same 150px threshold
  backgroundOpacity.setValue(1 - progress * 0.7); // fade to 30%
},

      }
    )
  ).current;

  const onPanStateChange = useRef((
  { nativeEvent }: { nativeEvent: { state: number; translationY: number; velocityY: number } }
) => {

    if (nativeEvent.state === State.END || nativeEvent.state === State.CANCELLED) {
      const { translationY, velocityY } = nativeEvent;
      const shouldClose = translationY > 150 || velocityY > 0.5;
      if (shouldClose) {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(backgroundOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onClose();
        });
      } else {
        Animated.parallel([
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }),
          Animated.timing(backgroundOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }
  }).current;

  // ===============================================================
  // HORIZONTAL SWIPE NAVIGATION HANDLERS
  // ===============================================================

  const onHorizontalPanGestureEvent = useRef(
    Animated.event(
      [{ nativeEvent: { translationX: translateX } }],
      { useNativeDriver: true }
    )
  ).current;

  const onHorizontalPanStateChange = useRef((
    { nativeEvent }: { nativeEvent: { state: number; translationX: number; velocityX: number } }
  ) => {
    if (nativeEvent.state === State.END || nativeEvent.state === State.CANCELLED) {
      const { translationX: tx, velocityX } = nativeEvent;
      const threshold = 50;
      const velocityThreshold = 0.5;

      // Read current values from refs (avoids stale closure)
      const idx = currentIndexRef.current;
      const navigate = onNavigateRef.current;
      const length = eventsLengthRef.current;

      const canGoNext = idx !== undefined && idx < length - 1;
      const canGoPrev = idx !== undefined && idx > 0;

      // Swipe left = go to next (translationX < -threshold)
      if ((tx < -threshold || velocityX < -velocityThreshold) && canGoNext && navigate && idx !== undefined) {
        // Animate out to left, then navigate
        Animated.timing(translateX, {
          toValue: -SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          navigate(idx + 1);
          // Reset position for next event
          translateX.setValue(0);
        });
      }
      // Swipe right = go to previous (translationX > threshold)
      else if ((tx > threshold || velocityX > velocityThreshold) && canGoPrev && navigate && idx !== undefined) {
        // Animate out to right, then navigate
        Animated.timing(translateX, {
          toValue: SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          navigate(idx - 1);
          // Reset position for next event
          translateX.setValue(0);
        });
      }
      // Snap back if not enough movement or at boundary
      else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
      }
    }
  }).current;

  // Check if there's a valid ticket URL
  const hasTicketLink = isValidTicketUrl(updatedEvent.ticketLinkEvents) || 
                        isValidTicketUrl(updatedEvent.ticketLinkPosts);
  
  // Determine if it's a paid event
  const paid = isPaidEvent(updatedEvent.ticketPrice);

// --- event_viewed tracking + dwell timer (fires once per open; logs dismissed on close) ---
const lastTrackedIdRef = useRef<string | number | null>(null);
const viewStartRef = useRef<number | null>(null);
const pathname = usePathname();

// Close if a global overlay-close signal is emitted (react only to *increments*)
const overlayCloseSignal = useGuestLimitationStore?.(s => s.overlayCloseSignal);
const lastOverlayCloseSignalRef = useRef<number | null>(null);

useEffect(() => {
  const last = lastOverlayCloseSignalRef.current;
  const curr = typeof overlayCloseSignal === 'number' ? overlayCloseSignal : null;

  // Only act when the counter *increases* (ignore initial mount even if > 0)
  if (last !== null && curr !== null && curr > last) {
    try {
      onClose?.();
    } catch (e) {
      console.warn('[EventImageLightbox] onClose threw during global overlay close:', e);
    }
  }

  // Update the ref after each render
  lastOverlayCloseSignalRef.current = curr;
}, [overlayCloseSignal]);


// Fire view event on first show of this id
useEffect(() => {
  const id = updatedEvent?.id;
  if (id == null) return;

  // dedupe: only once per open / id
  if (lastTrackedIdRef.current === id) return;

  const route = pathname || '/';
  const source =
    route.includes('map') ? 'map' :
    route.includes('search') ? 'search' :
    'list';

  const isSpecial = updatedEvent?.type === 'special';
  const eventName = isSpecial ? 'special_viewed' : 'event_viewed';

  amplitudeTrack(eventName, {
    event_id: String(id),
    venue_name: updatedEvent?.venue ?? 'unknown',
    category: updatedEvent?.category ?? 'unknown',
    content_type: isSpecial ? 'special' : 'event',
    source,
    referrer_screen: route,
    starts_in_hours_bucket: hoursUntilBucket(updatedEvent?.startDate, updatedEvent?.startTime),
    has_ticket_link: !!hasTicketLink,
  });

  lastTrackedIdRef.current = id;
  viewStartRef.current = Date.now();
}, [updatedEvent?.id, pathname, hasTicketLink]);

// On id change/unmount, log dismissal with duration
useEffect(() => {
  const route = pathname || '/';
  const isSpecial = updatedEvent?.type === 'special';

  return () => {
    const prevId = lastTrackedIdRef.current;
    const start = viewStartRef.current;
    if (prevId == null || start == null) return;

    const duration = Math.max(0, Date.now() - start);

    amplitudeTrack('event_dismissed', {
      event_id: String(prevId),
      content_type: isSpecial ? 'special' : 'event',
      source:
        route.includes('map') ? 'map' :
        route.includes('search') ? 'search' :
        'list',
      referrer_screen: route,
      duration_ms: duration,
    });

    viewStartRef.current = null;
  };
}, [updatedEvent?.id, pathname]);



  // ===============================================================
  // GUEST LIMITATION INTERACTION HANDLERS
  // ===============================================================

  /**
   * Handle image tap to full-screen with guest limitation tracking
   */
  const handleImagePress = () => {
    console.log(`[GuestLimitation] Image tap to full-screen: ${updatedEvent.title}`);

    // Track image tap interaction for guests
    if (isGuest && !trackInteraction(InteractionType.CLUSTER_ITEM_CLICK)) {
      console.log('[GuestLimitation] Image tap interaction blocked - allowing action but prompt should show');
      // Still allow the full-screen image view - the prompt will show over it
    }

    // Proceed with opening full-screen viewer
    setIsImageViewerVisible(true);
  };

  /**
   * Handle like press - BLOCKED for guests (premium feature)
   */
  const handleLikePress = async () => {
    if (isGuest) {
      console.log('[GuestLimitation] Like blocked - premium feature for registered users only');
      return;
    }

    if (isLikeToggling) return;

    setIsLikeToggling(true);
    const previousLikedEvents = [...likedEvents];
    const nextLikedEvents = isLiked
      ? previousLikedEvents.filter((id) => id !== eventIdString)
      : [...previousLikedEvents, eventIdString];

    setUserPrefs({ likedEvents: nextLikedEvents });

    try {
      const baseLikes = likeValueFromEvent;
      const result = await userService.toggleEventLike(updatedEvent.id, {
        type: updatedEvent.type === 'special' ? 'special' : 'event',
        source: 'lightbox',
        referrer: pathname || '/',
        venue: updatedEvent?.venue,
        category: updatedEvent?.category,
        baseLikes,
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to update like');
      }

      const nextCount =
        typeof result.count === 'number'
          ? result.count
          : Math.max(0, likeValue + (result.liked ? 1 : -1));
      setEventLikeCount(updatedEvent.id, nextCount);
    } catch (error) {
      setUserPrefs({ likedEvents: previousLikedEvents });
      console.error('Error toggling like:', error);
    } finally {
      setIsLikeToggling(false);
    }
  };

  /**
   * Handle share - BLOCKED for guests (premium feature)
   */
  const handleShare = async () => {
    if (isGuest) {
      console.log('[GuestLimitation] Share blocked - premium feature for registered users only');
      return;
    }

    // Log BEFORE opening the system share UI
    try {
      const isSpecial = updatedEvent?.type === 'special';
      amplitudeTrack('share_tapped', {
        event_id: String(updatedEvent.id),
        content_type: isSpecial ? 'special' : 'event',
        source: 'lightbox',
        referrer_screen: pathname || '/',
        channel: 'system',
      });
    } catch {}

    // Proceed with share for registered users
    try {
      const sharePayload = buildGathrSharePayload(updatedEvent);

      const shareResult = await Share.share({
        message: sharePayload.message,
        title: sharePayload.title,
        url: sharePayload.url, // iOS only - shows as link preview
      });

      // Only increment count if user actually shared (not cancelled)
      if (shareResult.action === Share.sharedAction) {
        const baseShares = shareValueFromEvent;
        const incrementResult = await userService.incrementEventShare(updatedEvent.id, {
          type: updatedEvent.type === 'special' ? 'special' : 'event',
          source: 'lightbox',
          referrer: pathname || '/',
          venue: updatedEvent?.venue,
          category: updatedEvent?.category,
          baseShares,
        });

        if (incrementResult.success) {
          setEventShareCount(updatedEvent.id, incrementResult.count);
        }
      }
    } catch (error) {
      console.error('Error sharing event', error);
    }
  };

  
  /**
   * Handle interested press - toggles interested state and adds to calendar
   */
  const handleInterestedPress = async () => {
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
      const result = await userService.toggleEventInterested(updatedEvent.id, {
        type: updatedEvent.type,
        source: 'lightbox',
        referrer: pathname || '/',
        venue: updatedEvent?.venue,
        category: updatedEvent?.category,
        baseInterested,
      });

      if (!result.success) {
        throw new Error(result.message || 'Failed to update interested');
      }

      const nextCount =
        typeof result.count === 'number'
          ? result.count
          : Math.max(0, interestedValue + (result.interested ? 1 : -1));
      setEventInterestedCount(updatedEvent.id, nextCount);

      // If marking interested (not unmarking), also open calendar
      if (result.interested) {
        await addToCalendar({
          title: updatedEvent.title,
          startDate: combineDateAndTime(updatedEvent.startDate, updatedEvent.startTime),
          endDate: combineDateAndTime(updatedEvent.endDate || updatedEvent.startDate, updatedEvent.endTime || '11:59 PM'),
          location: `${updatedEvent.venue}, ${updatedEvent.address}`,
          notes: updatedEvent.description
        });
      }
    } catch (error) {
      setUserPrefs({ interestedEvents: previousInterestedEvents });
      console.error('Error toggling interested (lightbox):', error);
    } finally {
      setIsInterestedToggling(false);
    }
  };

  /**
   * Handle add to calendar - BLOCKED for guests (premium feature)
   */
  const handleAddToCalendar = async () => {
    if (isGuest) {
      console.log('[GuestLimitation] Calendar blocked - premium feature for registered users only');
      return; // Always block for guests
    }

    // If not already interested, mark as interested (which will also add to calendar)
    if (!isInterested) {
      await handleInterestedPress();
      return;
    }

    // Already interested, just add to calendar again
    try {
      await addToCalendar({
        title: updatedEvent.title,
        startDate: combineDateAndTime(updatedEvent.startDate, updatedEvent.startTime),
        endDate: combineDateAndTime(updatedEvent.endDate || updatedEvent.startDate, updatedEvent.endTime || '11:59 PM'),
        location: `${updatedEvent.venue}, ${updatedEvent.address}`,
        notes: updatedEvent.description
      });
    } catch (error) {
      console.error('Failed to add event to calendar', error);
    }
  };
  
  /**
   * Handle directions - BLOCKED for guests (premium feature)
   */
const handleDirections = () => {
  if (isGuest) {
    console.log('[GuestLimitation] Directions blocked - premium feature for registered users only');
    return; // Always block for guests
  }

  // Proceed with getting directions for registered users
  const destination = encodeURIComponent(`${updatedEvent.venue}, ${updatedEvent.address}`);
  const url = Platform.select({
    ios: `maps:?q=${destination}`,
    android: `geo:0,0?q=${destination}`,
  });

  // Track before opening (app may background right after)
  try {
    const mapsApp = Platform.OS === 'ios' ? 'apple' : 'google';
    const isSpecial = updatedEvent?.type === 'special';

    amplitudeTrack('directions_opened', {
      event_id: String(updatedEvent.id),
      venue_name: updatedEvent.venue,
      address: updatedEvent.address,
      maps_app: mapsApp,
      source: 'lightbox',
      referrer_screen: (pathname || '/') as string, // uses the const from above
      content_type: isSpecial ? 'special' : 'event',
    });
  } catch {}

  if (url) {
    Linking.openURL(url);
  }
};

  /**
   * Handle view venue - Opens EventCallout with all events at this venue
   */
  const handleViewVenue = () => {
    if (!venue || !cluster) return;

    // Order venues with this venue first
    const otherVenues = cluster.venues.filter((v) => v.locationKey !== venue.locationKey);
    const sortedVenues = [venue, ...otherVenues];

    // Open callout
    selectVenues(sortedVenues);
    selectCluster(cluster);
    selectVenue(venue);

    // Close lightbox (both global state and via onClose callback)
    setSelectedImageData(null);
    onClose();
  };


/**
 * Handle ticket purchase - BLOCKED for guests (premium feature)
 */
const handleTickets = () => {
  if (isGuest) {
    console.log('[GuestLimitation] Tickets blocked - premium feature for registered users only');
    return; // Always block for guests
  }

  // Prefer events link, then fall back to posts link
  const ticketUrl = updatedEvent.ticketLinkEvents || updatedEvent.ticketLinkPosts;

  if (isValidTicketUrl(ticketUrl)) {
    // Track before opening (backgrounding may interrupt)
amplitudeTrack('ticket_link_opened', {
  event_id: String(updatedEvent.id),
  venue_name: updatedEvent.venue,
  provider: ticketProvider(ticketUrl),
  source: 'lightbox',
  referrer_screen: pathname || '/',
});


    Linking.openURL(ticketUrl);
  }
};


  // ===============================================================
  // NON-TRACKED CLOSE HANDLERS (don't track interactions)
  // ===============================================================

  /**
   * Handle close button press - NO interaction tracking
   */
  const handleCloseButton = () => {
    console.log('[GuestLimitation] Close button pressed - no interaction tracking');
    onClose(); // Direct close, no tracking
  };

  /**
   * Handle background tap to close - NO interaction tracking  
   */
  const handleBackgroundClose = () => {
    console.log('[GuestLimitation] Background tap to close - no interaction tracking');
    onClose(); // Direct close, no tracking
  };

  /**
   * Handle full-screen image viewer close - NO interaction tracking
   */
  const handleImageViewerClose = () => {
    console.log('[GuestLimitation] Full-screen image viewer closed - no interaction tracking');
    setIsImageViewerVisible(false);
    // Set cooldown flag to prevent gesture conflicts
    setJustClosedImageViewer(true);
    setTimeout(() => {
      setJustClosedImageViewer(false);
    }, 500); // 500ms cooldown
    // NOTE: No interaction tracking for closing full-screen viewer
  };

  // Determine time status
  const timeStatus = getEventTimeStatus(updatedEvent);
  const isHappeningNow = timeStatus === 'now';

  // Build structured date/time line (mirror Specials card behavior)
  const baseDateText = formatEventDateTime(updatedEvent.startDate, updatedEvent.startTime, updatedEvent);

  const startRaw = updatedEvent?.startTime;
  const endRaw   = updatedEvent?.endTime;

  const start = startRaw && startRaw !== 'N/A' ? formatTime(startRaw) : null;
  const end   = endRaw   && endRaw   !== 'N/A' ? formatTime(endRaw)   : null;

  const range =
    start && end ? `${start} – ${end}` :
    start        ? `${start} – late`  :
    end          ? `until ${end}`     :
                  '';

  const rangeOrUndefined = range && range.trim() ? range : undefined;
  const { label, start: s, end: e, labelWithTime } = partsFrom(baseDateText, rangeOrUndefined);
  const showRange = (timeStatus === 'now' || timeStatus === 'today' || timeStatus === 'future') && !!rangeOrUndefined;
  const endDateSuffix =
    showRange && isFutureDate(updatedEvent.endDate) ? ` • (Until ${formatEndDateLabel(updatedEvent.endDate!)})` : '';
  const dateTimeDisplay = showRange
    ? `${label} • ${s}${e ? ` – ${e}` : ''}${endDateSuffix}`
    : labelWithTime;

  // Prepare images array for the image viewer
  // Use fallback if: URL is invalid OR the thumbnail reported a load error
  const getImagesForViewer = () => {
    // If URL looks valid AND the thumbnail didn't error, use the remote URL
    if (isValidImageUrl(imageUrl) && !isUsingFallbackImage) {
      return [{ uri: imageUrl }];
    }
    // Otherwise use the local fallback asset
    return [getCategoryFallbackImage(updatedEvent.category, updatedEvent.type, 'post')];
  };
  const images = getImagesForViewer();

  function hoursUntilBucket(startDate?: string, startTime?: string) {
  if (!startDate || !startTime) return 'unknown';
  const start = new Date(`${startDate} ${startTime}`);
  const diffHrs = (start.getTime() - Date.now()) / 36e5;
  if (diffHrs <= 1) return '0-1';
  if (diffHrs <= 6) return '1-6';
  if (diffHrs <= 24) return '6-24';
  if (diffHrs <= 72) return '24-72';
  return '72+';
}


  // Check if navigation is enabled
  const navigationEnabled = events && events.length > 1 && onNavigate !== undefined;

  return (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <PanGestureHandler
      ref={verticalPanRef}
      enabled={!isImageViewerVisible && !justClosedImageViewer}
      waitFor={descriptionScrollRef}
      simultaneousHandlers={horizontalPanRef}
      activeOffsetY={10}
      failOffsetX={[-20, 20]}
      onGestureEvent={onPanGestureEvent}
      onHandlerStateChange={onPanStateChange}
    >
      <Animated.View style={styles.container}>

      {/* Background overlay */}
      <Animated.View
        style={[styles.backgroundOverlay, { opacity: backgroundOpacity }]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleBackgroundClose}
        />
      </Animated.View>

      {/* Horizontal swipe handler for navigation */}
      <PanGestureHandler
        ref={horizontalPanRef}
        enabled={navigationEnabled && !isImageViewerVisible && !justClosedImageViewer}
        simultaneousHandlers={verticalPanRef}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-15, 15]}
        onGestureEvent={onHorizontalPanGestureEvent}
        onHandlerStateChange={onHorizontalPanStateChange}
      >
      {/* Content container */}
      <Animated.View
        style={[
          styles.contentContainer,
          { transform: [{ translateY: translateY }, { translateX: translateX }] }
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title} numberOfLines={1}>{updatedEvent.title}</Text>
            <Text style={styles.subtitle}>{updatedEvent.venue}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={handleCloseButton}>
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        
        {/* Tappable Image */}
        <TouchableOpacity onPress={handleImagePress} activeOpacity={0.9} style={styles.imageWrapper}>
          <FallbackImage
            imageUrl={imageUrl}
            category={updatedEvent.category}
            type={updatedEvent.type}
            style={styles.image}
            fallbackType="post"
            resizeMode="contain"
            onFallback={setIsUsingFallbackImage as any}
          />
          {/* Venue profile overlay with favorite heart */}
          <View style={styles.venueProfileOverlay}>
            <View style={styles.venueProfileImageContainer}>
              <FallbackImage
                imageUrl={updatedEvent.profileUrl}
                category={updatedEvent.category}
                type={updatedEvent.type}
                style={styles.venueProfileImageSmall}
                fallbackType="profile"
                resizeMode="cover"
              />
              <View style={styles.venueFavoriteButtonOverlay}>
                <VenueFavoriteButton
                  locationKey={createLocationKeyFromEvent(updatedEvent)}
                  venueName={updatedEvent.venue}
                  size={12}
                  source="event_image_lightbox"
                  style={styles.venueFavoriteButtonSmall}
                />
              </View>
            </View>
          </View>
          {/* Add a subtle zoom icon overlay */}
          <View style={styles.zoomIconOverlay}>
            <MaterialIcons name="zoom-in" size={24} color="rgba(255, 255, 255, 0.8)" />
          </View>

          {/* Engagement overlay - like and share counts */}
          {showEngagementOverlay && (
            <View style={styles.engagementOverlay} pointerEvents="box-none">
              {/* Like badge */}
              <TouchableOpacity
                style={[
                  styles.engagementBadge,
                  isLiked && styles.engagementBadgeLiked,
                ]}
                onPress={handleLikePress}
                disabled={isLikeToggling || isGuest}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name="thumb-up"
                  size={14}
                  color={isLiked ? '#1976D2' : '#333333'}
                />
                {likeText ? (
                  <Text style={styles.engagementBadgeText}>{likeText}</Text>
                ) : null}
              </TouchableOpacity>

              {/* Share badge - always show, clickable */}
              <TouchableOpacity
                style={[styles.engagementBadge, styles.engagementBadgeSpacing]}
                onPress={handleShare}
                disabled={isGuest}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="share" size={14} color="#333333" />
                {shareText ? (
                  <Text style={styles.engagementBadgeText}>{shareText}</Text>
                ) : null}
              </TouchableOpacity>

              {/* Interested badge - calendar adds (uses person icon like usersResponded) */}
              <TouchableOpacity
                style={[
                  styles.engagementBadge,
                  styles.engagementBadgeSpacing,
                  isInterested && styles.engagementBadgeInterested,
                ]}
                onPress={handleInterestedPress}
                disabled={isInterestedToggling || isGuest}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name="person"
                  size={14}
                  color={isInterested ? '#34A853' : '#333333'}
                />
                {interestedText ? (
                  <Text style={styles.engagementBadgeText}>{interestedText}</Text>
                ) : null}
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
        
        {/* Status badges */}
        <View style={styles.badgeContainer}>
          {isHappeningNow && (
            <View style={styles.nowBadge}>
              <Text style={styles.badgeText}>HAPPENING NOW</Text>
            </View>
          )}
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(updatedEvent.category) }]}>
            <Text style={styles.badgeText}>{updatedEvent.category}</Text>
          </View>
          {updatedEvent.ticketPrice && updatedEvent.ticketPrice !== 'N/A' && (
            <View style={styles.priceBadge}>
              <Text style={styles.badgeText}>{updatedEvent.ticketPrice}</Text>
            </View>
          )}
          
          {/* Add ticket/register button near price - grayed out for guests */}
          {hasTicketLink && paid && (
            <TouchableOpacity 
              style={[
                styles.buyTicketsButton,
                isGuest && styles.disabledButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.buttonContent}>
                <Text style={[
                  styles.buyTicketsText,
                  isGuest && styles.disabledButtonText
                ]}>
                  Buy Tickets
                </Text>
                {isGuest && (
                  <View style={styles.buttonLockOverlay}>
                    <MaterialIcons 
                      name="lock" 
                      size={12} 
                      color="#FFFFFF" 
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          
          {hasTicketLink && !paid && (
            <TouchableOpacity 
              style={[
                styles.registerButton,
                isGuest && styles.disabledButton
              ]}
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.buttonContent}>
                <Text style={[
                  styles.registerButtonText,
                  isGuest && styles.disabledButtonText
                ]}>
                  Register
                </Text>
                {isGuest && (
                  <View style={styles.buttonLockOverlay}>
                    <MaterialIcons 
                      name="lock" 
                      size={12} 
                      color="#FFFFFF" 
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Description — scrollable area (blocks swipe-to-close while scrolling) */}
<View style={styles.descriptionContainer}>
  <GestureScrollView
    ref={descriptionScrollRef}
    style={styles.descriptionScroll}
    contentContainerStyle={styles.descriptionContent}
    showsVerticalScrollIndicator={true}
    scrollEventThrottle={16}
    accessibilityHint="Scrollable description. Swipe up to read more."
    onLayout={(e) => {
      const h = e.nativeEvent.layout.height;
      setDescLayoutHeight(h);
    }}
    onContentSizeChange={(_, h) => {
      const can = h > descLayoutHeight;
      setDescCanScroll(can);
      setDescAtEnd(!can || h <= descLayoutHeight);
      setDescAtTop(true);
    }}
    onScroll={(e) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const atEnd = contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
      const atTop = contentOffset.y <= 4;
      setDescAtEnd(atEnd);
      setDescAtTop(atTop);
    }}
  >
    <GuestLimitedContent 
      contentType="description" 
      fullText={updatedEvent.description}
      maxLength={undefined} // show full text in lightbox
    >
      <Autolink 
        text={updatedEvent.description}
        style={styles.description}
        linkStyle={styles.linkText}
        onPress={(url) => {
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
  </GestureScrollView>

  {/* Bottom fade: shows only when there’s more to read and you’re not at the end */}
  {descCanScroll && !descAtEnd && (
    <LinearGradient
  colors={['rgba(36,36,36,0)', 'rgba(36,36,36,0.5)', '#242424']}
  style={styles.descriptionFadeBottom}
  pointerEvents="none"
/>


  )}

  {/* Top fade: optional hint when scrolled down */}
  {descCanScroll && !descAtTop && (
    <LinearGradient
  colors={['#222222', 'rgba(34,34,34,0)']}
  style={styles.descriptionFadeTop}
  pointerEvents="none"
/>


  )}
</View>

                  
        {/* Time and location info */}
        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <MaterialIcons name="access-time" size={20} color="#FFFFFF" />
            <Text style={styles.infoText}>
              {dateTimeDisplay}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <MaterialIcons name="place" size={20} color="#FFFFFF" />
            <Text style={styles.infoText}>{updatedEvent.address}</Text>
          </View>
        </View>
        
        {/* Actions */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              isGuest && styles.disabledActionButton
            ]}
            onPress={handleAddToCalendar}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonContent}>
              <MaterialIcons 
                name="event" 
                size={22} 
                color={isGuest ? "#666666" : "#FFFFFF"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <LockIcon 
                    variant="inline" 
                    size={10} 
                    showText={false}
                  />
                </View>
              )}
            </View>
            <Text style={[
              styles.actionText,
              isGuest && styles.disabledActionText
            ]}>
              Calendar
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.actionButton,
              isGuest && styles.disabledActionButton
            ]} 
            onPress={handleDirections}
            activeOpacity={isGuest ? 1 : 0.7}
            disabled={isGuest}
          >
            <View style={styles.actionButtonContent}>
              <MaterialIcons 
                name="directions" 
                size={22} 
                color={isGuest ? "#666666" : "#FFFFFF"} 
              />
              {isGuest && (
                <View style={styles.lockIconOverlay}>
                  <LockIcon 
                    variant="inline" 
                    size={10} 
                    showText={false}
                  />
                </View>
              )}
            </View>
            <Text style={[
              styles.actionText,
              isGuest && styles.disabledActionText
            ]}>
              Directions
            </Text>
          </TouchableOpacity>
          
          {/* Only add the tickets button to action container if not displayed next to price already */}
          {hasTicketLink && !updatedEvent.ticketPrice && (
            <TouchableOpacity 
              style={[
                styles.actionButton,
                isGuest && styles.disabledActionButton
              ]} 
              onPress={handleTickets}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.actionButtonContent}>
                <MaterialIcons 
                  name="confirmation-number" 
                  size={22} 
                  color={isGuest ? "#666666" : "#FFFFFF"} 
                />
                {isGuest && (
                  <View style={styles.lockIconOverlay}>
                    <LockIcon 
                      variant="inline" 
                      size={10} 
                      showText={false}
                    />
                  </View>
                )}
              </View>
              <Text style={[
                styles.actionText,
                isGuest && styles.disabledActionText
              ]}>
                {paid ? "Tickets" : "Register"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* View Venue Button - Opens EventCallout with all events at venue */}
        {venue && (
          <TouchableOpacity
            style={styles.viewVenueButton}
            onPress={handleViewVenue}
            activeOpacity={0.8}
          >
            <View style={styles.viewVenueContent}>
              <MaterialIcons name="store" size={20} color="#1976D2" />
              <View style={styles.viewVenueTextContainer}>
                <Text style={styles.viewVenueLabel}>View all events at</Text>
                <Text style={styles.viewVenueName} numberOfLines={1}>
                  {venue.venue}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#1976D2" />
            </View>
          </TouchableOpacity>
        )}

        {/* Navigation arrows for swipe between events */}
        {navigationEnabled && (
          <>
            {/* Left arrow - previous event */}
            {canNavigatePrev && (
              <TouchableOpacity
                style={styles.navArrowLeft}
                onPress={() => onNavigate && currentIndex !== undefined && onNavigate(currentIndex - 1)}
                activeOpacity={0.7}
              >
                <View style={styles.navArrowContainer}>
                  <MaterialIcons name="chevron-left" size={32} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
            {/* Right arrow - next event */}
            {canNavigateNext && (
              <TouchableOpacity
                style={styles.navArrowRight}
                onPress={() => onNavigate && currentIndex !== undefined && onNavigate(currentIndex + 1)}
                activeOpacity={0.7}
              >
                <View style={styles.navArrowContainer}>
                  <MaterialIcons name="chevron-right" size={32} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}
            {/* Position indicator */}
            {events && currentIndex !== undefined && (
              <View style={styles.positionIndicator}>
                <Text style={styles.positionText}>
                  {currentIndex + 1} / {events.length}
                </Text>
              </View>
            )}
          </>
        )}
      </Animated.View>
      </PanGestureHandler>

      {/* Full-Screen Image Viewer */}
      <ImageView
        images={images}
        imageIndex={0}
        visible={isImageViewerVisible}
        onRequestClose={handleImageViewerClose}
        backgroundColor="rgba(0, 0, 0, 0.9)"
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        presentationStyle="overFullScreen"
        FooterComponent={() => null}
      />

      {/* =============================================================== */}
      {/* GUEST LIMITATION REGISTRATION PROMPT - ONLY FOR GUESTS */}
      {/* =============================================================== */}
      {isGuest && <RegistrationPrompt />}
      </Animated.View>
    </PanGestureHandler>
  </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  contentContainer: {
    width: SCREEN_WIDTH * 0.96,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: '#222222',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#111111',
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#CCCCCC',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.35, // Fixed height at 35% of screen height
    backgroundColor: '#000000',
  },
  imageWrapper: {
    position: 'relative',
  },
  venueProfileOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 5,
  },
  venueProfileImageContainer: {
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
    zIndex: 6,
  },
  venueFavoriteButtonSmall: {
    padding: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  zoomIconOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  engagementOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    backgroundColor: 'transparent',
    zIndex: 12,
  },
  engagementBadge: {
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
  engagementBadgeSpacing: {
    marginLeft: 4,
  },
  engagementBadgeLiked: {
    borderColor: '#1976D2',
    backgroundColor: '#EBF4FF',
  },
  engagementBadgeInterested: {
    borderColor: '#34A853',
    backgroundColor: '#E8F5E9',
  },
  engagementBadgeText: {
    marginLeft: 4,
    fontSize: 11,
    color: '#333333',
    fontWeight: '500',
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  nowBadge: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 6,
  },
  priceBadge: {
    backgroundColor: '#E94E77',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
    marginRight: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  buyTicketsButton: {
    backgroundColor: '#E94E77',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  buyTicketsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  // Disabled button styles for guests
  disabledButton: {
    backgroundColor: '#666666',
    opacity: 0.6,
  },
  disabledButtonText: {
    color: '#CCCCCC',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonLockOverlay: {
    marginLeft: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 4,
    padding: 2,
  },
  infoContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  descriptionContainer: {
  paddingHorizontal: 16,
  paddingVertical: 0,
  backgroundColor: '#242424',
  position: 'relative',
  borderRadius: 8,
  overflow: 'hidden',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.06)',
},


  descriptionScroll: {   // This is where you chaneg the size of the scrollable container for
  maxHeight: SCREEN_HEIGHT * 0.24, // tighter: keeps time + actions visible
  marginBottom: 8,
},
descriptionContent: {
  paddingBottom: 2
},
descriptionFadeBottom: {
  position: 'absolute',
  left: 16,
  right: 16,
  bottom: 0,
  height: 36,
},
descriptionFadeTop: {
  position: 'absolute',
  left: 16,
  right: 16,
  top: 0,
  height: 36,
},
description: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    color: '#62B5FF',
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  readMoreButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    color: '#62B5FF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionContainer: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  alignItems: 'center',
  paddingVertical: 4, // was 12
  backgroundColor: '#111111',
},


  actionButton: {
  alignItems: 'center',
  padding: 8, // was 10
  position: 'relative',
},

  actionButtonContent: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIconOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 6,
    padding: 1,
  },
  disabledActionButton: {
    opacity: 0.6,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 0,
  },
  disabledActionText: {
    color: '#666666',
  },
  viewVenueButton: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  viewVenueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewVenueTextContainer: {
    flex: 1,
  },
  viewVenueLabel: {
    fontSize: 12,
    color: '#5F6368',
    marginBottom: 2,
  },
  viewVenueName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  // Navigation arrow styles for swipe between events
  navArrowLeft: {
    position: 'absolute',
    left: -8,
    top: '40%',
    zIndex: 10,
  },
  navArrowRight: {
    position: 'absolute',
    right: -8,
    top: '40%',
    zIndex: 10,
  },
  navArrowContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  positionIndicator: {
    position: 'absolute',
    bottom: -30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  positionText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
});

export default EventImageLightbox;
