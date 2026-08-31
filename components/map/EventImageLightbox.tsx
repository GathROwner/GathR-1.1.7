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
  Animated,
  ActivityIndicator,
  Easing,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { usePathname, useRouter } from 'expo-router';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { GestureHandlerRootView, PanGestureHandler, ScrollView as GestureScrollView, State } from 'react-native-gesture-handler';

import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';


import ImageView from "react-native-image-viewing";
import FallbackImage from '../common/FallbackImage';
import GathRShimmerPill from '../common/GathRShimmerPill';
import TicketCtaPill from '../common/TicketCtaPill';
import EventActionLinkPill from '../common/EventActionLinkPill';
import FamilyFriendlyBadge from '../common/FamilyFriendlyBadge';
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
  getEventDisplayUntilDate,
  formatTime
} from '../../utils/dateUtils';
import { createLocationKeyFromEvent } from '../../utils/priorityUtils';
import { buildGathrSharePayload } from '../../utils/shareUtils';
import { getTicketUrl, normalizeTicketUrl } from '../../utils/ticketUrls';
import { getPrimaryNonTicketAction } from '../../utils/eventActionLinks';
import { areEventIdsEquivalent } from '../../lib/api/firestoreEvents';
import {
  getRouteCompactCertaintyLabel,
  getRouteSourceUrl,
  hasDrawableRoute,
} from '../../utils/routeEvent';
import {
  getAreaLocations,
  getAreaLocationsLabel,
  getAreaSourceUrl,
  hasDrawableAreaLocations,
} from '../../utils/areaEvent';
import { getVenueFriendPresence } from '../../utils/friendPresence';
import { formatFriendsHere } from '../../utils/friendDestinations';
import {
  findFriendEventLocation,
  hasExactFriendEventCoordinates,
} from '../../utils/friendEvents';
import {
  formatFriendEventGuestResponse,
  getFriendEventLightboxAction,
} from '../../utils/friendEventLightbox';
import { useSocialStore } from '../../store/socialStore';
import { inviteToFriendEvent, respondToFriendEvent } from '../../services/socialService';
import type { FriendEventRsvp } from '../../types/social';

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
const APP_HEADER_HEIGHT = Platform.OS === 'ios' ? 44 : 56;
const LIGHTBOX_HEADER_SEAM_OVERLAP = Platform.OS === 'ios' ? 5 : 0;

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
  isTrending?: boolean;
  // City-level (festival) event opened from its map marker
  isCityEvent?: boolean;
  // Route events use the existing secondary action slot to reveal the route.
  onShowRoute?: (event: Event) => void;
  // Optional callback when "View Venue" button is clicked
  onViewVenue?: () => void;
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
  isTrending = false,
  isCityEvent = false,
  onShowRoute,
  onViewVenue,
}) => {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { height: windowHeight } = useWindowDimensions();
  const lightboxTop = Math.max(
    0,
    safeAreaInsets.top + APP_HEADER_HEIGHT - LIGHTBOX_HEADER_SEAM_OVERLAP
  );
  const lightboxHeight = Math.max(0, windowHeight - lightboxTop - tabBarHeight);
  const imageHeight = Math.min(windowHeight * 0.35, lightboxHeight * 0.45);
  // Add store subscription to get fresh event data
  const storeEvents = useMapStore((state) => state.events);
  
  // Helper function to get updated event data from store
  const getUpdatedEvent = (eventId: string | number) => {
    return storeEvents.find((candidate) => areEventIdsEquivalent(candidate.id, eventId));
  };


// Use updated event data with fallback to original prop (keep prop fields!)
  const updatedFromStore = getUpdatedEvent(event.id);
  const updatedEvent = { ...event, ...(updatedFromStore || {}) };
  const friendEventId = updatedEvent.friendEvent?.eventId || null;
  const friendEventProjection = useSocialStore((state) => (
    friendEventId
      ? state.friendEvents.find((candidate) => candidate.eventId === friendEventId) ?? null
      : null
  ));
  const friendEventLocation = useSocialStore((state) => (
    friendEventId ? findFriendEventLocation(friendEventId, state.friendEventLocations) : null
  ));
  const socialFriends = useSocialStore((state) => state.friends);
  const isPrivateFriendEvent = Boolean(updatedEvent.friendEvent);
  const privateDirectionsAvailable = !isPrivateFriendEvent || Boolean(
    friendEventProjection
      && hasExactFriendEventCoordinates(friendEventProjection, friendEventLocation)
  );
  const privateCalendarLocation = isPrivateFriendEvent
    ? updatedEvent.address === 'Address shared later'
      ? updatedEvent.venue
      : `${updatedEvent.venue}, ${updatedEvent.address}`
    : `${updatedEvent.venue}, ${updatedEvent.address}`;
  const friendPresence = getVenueFriendPresence(cluster || null, venue || null);
  const [friendListExpanded, setFriendListExpanded] = useState(false);

// If address is missing, fetch details for this id
  const fetchEventDetails = useMapStore(s => s.fetchEventDetails);

  // Map actions for opening EventCallout from "View Venue" button
  const selectVenues = useMapStore(s => s.selectVenues);
  const selectCluster = useMapStore(s => s.selectCluster);
  const selectVenue = useMapStore(s => s.selectVenue);
  const setSelectedImageData = useMapStore(s => s.setSelectedImageData);
  const setPendingRouteEvent = useMapStore(s => s.setPendingRouteEvent);

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
  const [privateRsvpBusy, setPrivateRsvpBusy] = useState<FriendEventRsvp | null>(null);
  const [privateGuestSheetVisible, setPrivateGuestSheetVisible] = useState(false);
  const [privateInviteExpanded, setPrivateInviteExpanded] = useState(false);
  const [privateInviteBusyUid, setPrivateInviteBusyUid] = useState<string | null>(null);
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
  const showEngagementOverlay = !isPrivateFriendEvent;

  // State for full-screen image viewer
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  // State to prevent gesture conflicts when image viewer closes
  const [justClosedImageViewer, setJustClosedImageViewer] = useState(false);

  // Track if the thumbnail is using a fallback image (URL failed to load or was missing)
  const [isUsingFallbackImage, setIsUsingFallbackImage] = useState(false);

  const isReduceMotionEnabled = useReduceMotion();

  // Animation values for swipe-to-close
  const translateY = useRef(new Animated.Value(0)).current;
  const backgroundOpacity = useRef(new Animated.Value(1)).current;

  // Animation value for horizontal swipe navigation
  const translateX = useRef(new Animated.Value(0)).current;

  // Animation values for the Trending badge attention cue
  const trendingShimmerProgress = useRef(new Animated.Value(0)).current;
  const trendingPulseProgress = useRef(new Animated.Value(0)).current;

  // Refs for gesture handler coordination
  const verticalPanRef = useRef(null);
  const horizontalPanRef = useRef(null);

  // Navigation state
  const canNavigatePrev = events && currentIndex !== undefined && currentIndex > 0;
  const canNavigateNext = events && currentIndex !== undefined && currentIndex < events.length - 1;
  const showTrendingOverlay = Boolean(isTrending && events && currentIndex !== undefined);
  const trendingPositionLabel =
    events && currentIndex !== undefined ? `${currentIndex + 1} / ${events.length}` : '';

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

  useEffect(() => {
    const resetTrendingAnimation = () => {
      trendingShimmerProgress.stopAnimation();
      trendingPulseProgress.stopAnimation();
      trendingShimmerProgress.setValue(0);
      trendingPulseProgress.setValue(0);
    };

    resetTrendingAnimation();

    if (!showTrendingOverlay || isReduceMotionEnabled) {
      return;
    }

    const playTrendingCue = () =>
      Animated.sequence([
        Animated.parallel([
          Animated.timing(trendingShimmerProgress, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(trendingPulseProgress, {
            toValue: 1,
            duration: 680,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(trendingShimmerProgress, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
          Animated.timing(trendingPulseProgress, {
            toValue: 0,
            duration: 1,
            useNativeDriver: true,
          }),
        ]),
      ]);

    const trendingAnimation = Animated.sequence([
      Animated.delay(700),
      playTrendingCue(),
      Animated.loop(
        Animated.sequence([
          Animated.delay(3000),
          playTrendingCue(),
        ])
      ),
    ]);

    trendingAnimation.start();

    return () => {
      trendingAnimation.stop();
      resetTrendingAnimation();
    };
  }, [
    currentIndex,
    imageUrl,
    isReduceMotionEnabled,
    showTrendingOverlay,
    trendingPulseProgress,
    trendingShimmerProgress,
    updatedEvent.id,
  ]);

  // Start/stop like, share, and interested listeners
  useEffect(() => {
    if (!updatedEvent.id || isPrivateFriendEvent) return;
    startEventLikesListener(updatedEvent.id);
    startEventSharesListener(updatedEvent.id);
    startEventInterestedListener(updatedEvent.id);
    return () => {
      stopEventLikesListener(updatedEvent.id);
      stopEventSharesListener(updatedEvent.id);
      stopEventInterestedListener(updatedEvent.id);
    };
  }, [isPrivateFriendEvent, updatedEvent.id]);

  // (read-more removed; description is now scrollable)

// --- description scroll state for fade/affordance ---
const [descLayoutHeight, setDescLayoutHeight] = useState(0);
const [descCanScroll, setDescCanScroll] = useState(false);
const [descAtEnd, setDescAtEnd] = useState(true);
const [descAtTop, setDescAtTop] = useState(true);


  // Gesture-handler setup: scroll in description; swipe-to-close elsewhere
  const titleScrollRef = useRef(null);
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
  const hasTicketLink = Boolean(getTicketUrl(updatedEvent));
  const nonTicketAction = getPrimaryNonTicketAction(updatedEvent);
  
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
    if (isGuest || isPrivateFriendEvent) {
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
    if (isGuest || isPrivateFriendEvent) {
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
    if (isGuest || isPrivateFriendEvent) {
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

    if (isPrivateFriendEvent) {
      try {
        await addToCalendar({
          title: updatedEvent.title,
          startDate: combineDateAndTime(updatedEvent.startDate, updatedEvent.startTime),
          endDate: combineDateAndTime(updatedEvent.endDate || updatedEvent.startDate, updatedEvent.endTime || '11:59 PM'),
          location: privateCalendarLocation,
          notes: updatedEvent.description,
        });
      } catch (error) {
        console.error('Failed to add private friend event to calendar', error);
      }
      return;
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

  if (!privateDirectionsAvailable) {
    Alert.alert(
      'Address shared later',
      'Directions will become available when the host shares the exact location.'
    );
    return;
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

  const handleOpenPrivateContext = () => {
    if (!friendEventId) return;

    if (privateLightboxAction.kind === 'manage') {
      // Native modals do not survive an Expo Router screen transition
      // consistently on both platforms. Persist the exact lightbox payload in
      // the map store before opening management so the active surface (or the
      // map-level fallback) can restore it when Back returns.
      setSelectedImageData({
        imageUrl,
        event: updatedEvent,
        venue,
        cluster,
        source: 'friend_event_resume',
      });
      router.push(`/friend-event/${friendEventId}`);
      return;
    }

    if (privateLightboxAction.kind === 'none') return;
    setPrivateInviteExpanded(privateLightboxAction.kind === 'invite');
    setPrivateGuestSheetVisible(true);
  };

  const handlePrivateInvite = async (targetUid: string) => {
    if (!friendEventId || privateInviteBusyUid) return;
    setPrivateInviteBusyUid(targetUid);
    try {
      await inviteToFriendEvent(friendEventId, targetUid);
    } catch (error) {
      console.error('Failed to invite friend from private event lightbox', error);
      Alert.alert('Could not send invitation', 'Please check your connection and try again.');
    } finally {
      setPrivateInviteBusyUid(null);
    }
  };

  const handlePrivateRsvp = async (
    response: Exclude<FriendEventRsvp, 'host' | 'invited'>
  ) => {
    if (!friendEventId || privateRsvpBusy) return;
    setPrivateRsvpBusy(response);
    try {
      await respondToFriendEvent(friendEventId, response);
    } catch (error) {
      console.error('Failed to update private event RSVP', error);
      Alert.alert('Could not update RSVP', 'Please check your connection and try again.');
    } finally {
      setPrivateRsvpBusy(null);
    }
  };

  const routeEvent = updatedEvent.locationScope === 'route';
  const drawableRoute = hasDrawableRoute(updatedEvent);
  const areaLocationsEvent = hasDrawableAreaLocations(updatedEvent);
  const drawableMapExperience = drawableRoute || areaLocationsEvent;
  const routeSourceUrl = getRouteSourceUrl(updatedEvent);
  const mapExperienceSourceUrl = routeEvent
    ? routeSourceUrl
    : getAreaSourceUrl(updatedEvent);
  const handleRouteAction = () => {
    if (drawableMapExperience) {
      amplitudeTrack(routeEvent ? 'route_map_opened' : 'area_locations_map_opened', {
        event_id: String(updatedEvent.id),
        route_status: routeEvent
          ? updatedEvent.routeData?.status || 'unknown'
          : updatedEvent.areaData?.status || 'unknown',
        confirmed_segments: updatedEvent.routeData?.segments?.filter(
          (segment) => segment.certainty === 'confirmed'
        ).length || 0,
        approximate_segments: updatedEvent.routeData?.segments?.filter(
          (segment) => segment.certainty === 'approximate'
        ).length || 0,
        stop_count: routeEvent
          ? updatedEvent.routeData?.stops?.length || 0
          : getAreaLocations(updatedEvent).length,
        navigation_mode: onShowRoute ? 'same_screen' : 'cross_tab',
      });

      if (onShowRoute) {
        onShowRoute(updatedEvent);
        return;
      }

      // Lightboxes also live on Events, Specials, and carousel surfaces. Queue
      // the route before switching tabs so the Map can draw it immediately.
      setPendingRouteEvent(updatedEvent);
      onClose();
      router.push('/(tabs)/map');
      return;
    }

    if (mapExperienceSourceUrl) {
      amplitudeTrack(routeEvent ? 'route_information_opened' : 'area_locations_information_opened', {
        event_id: String(updatedEvent.id),
        route_status: routeEvent
          ? updatedEvent.routeData?.status || 'unknown'
          : updatedEvent.areaData?.status || 'unknown',
      });
      Linking.openURL(mapExperienceSourceUrl);
    }
  };

  /**
   * Handle view venue - Opens EventCallout with all events at this venue
   */
  const handleViewVenue = () => {
    if (!venue || !cluster) return;

    // Call the optional callback (used by InterestsCarousel to record venue interaction)
    onViewVenue?.();

    // Order venues with this venue first
    const otherVenues = cluster.venues.filter((v) => v.locationKey !== venue.locationKey);
    const sortedVenues = [venue, ...otherVenues];

    // Close lightbox (both global state and via onClose callback)
    setSelectedImageData(null);
    onClose();

    // Let the modal host dismiss before mutating the underlying callout tree.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        selectVenues(sortedVenues);
        selectCluster(cluster);
        selectVenue(venue);
      });
    });
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
  const ticketUrl = getTicketUrl(updatedEvent);
  if (ticketUrl) {
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

const handleNonTicketAction = () => {
  if (isGuest || !nonTicketAction) return;
  amplitudeTrack('event_action_link_opened', {
    event_id: String(updatedEvent.id),
    venue_name: updatedEvent.venue,
    action_role: nonTicketAction.role,
    source: 'lightbox',
    referrer_screen: pathname || '/',
  });
  Linking.openURL(nonTicketAction.url);
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
  const displayUntilDate = getEventDisplayUntilDate(updatedEvent);
  const endDateSuffix =
    showRange && isFutureDate(displayUntilDate) ? ` • (Until ${formatEndDateLabel(displayUntilDate!)})` : '';
  const dateTimeDisplay = isHappeningNow
    ? `Now${showRange ? ` • ${s}${e ? ` – ${e}` : ''}${endDateSuffix}` : ''}`
    : showRange
      ? `${label} • ${s}${e ? ` – ${e}` : ''}${endDateSuffix}`
      : labelWithTime;
  const privateOwnRsvp = friendEventProjection?.ownRsvp
    || updatedEvent.friendEvent?.ownRsvp
    || 'invited';
  const privateBadgeLabel = updatedEvent.friendEvent?.viewerRole === 'host'
    ? 'Private · Hosting'
    : privateOwnRsvp === 'going'
      ? 'Private · Going'
      : privateOwnRsvp === 'maybe'
        ? 'Private · Maybe'
        : privateOwnRsvp === 'cant_go'
          ? "Private · Can't go"
          : 'Private · Invited';
  const privateHostName = friendEventProjection?.host.displayName
    || updatedEvent.friendEvent?.hostName
    || 'a friend';
  const privateGuestCount = friendEventProjection
    ? Math.max(friendEventProjection.viewerCount || 0, friendEventProjection.guests.length)
    : 0;
  const privateVisibility = friendEventProjection?.visibility
    || updatedEvent.friendEvent?.visibility;
  const privateAudienceCopy = privateVisibility === 'all_friends'
    ? 'Visible to all friends'
    : 'Selected friends only';
  const privateGuestListVisible = friendEventProjection?.guestListVisible === true;
  const privateCanInvite = friendEventProjection?.viewerRole === 'host'
    || friendEventProjection?.guestInviteMode === 'guests_can_invite';
  const privateLightboxAction = getFriendEventLightboxAction({
    viewerRole: updatedEvent.friendEvent?.viewerRole || 'guest',
    guestListVisible: privateGuestListVisible,
    guestInviteMode: friendEventProjection?.guestInviteMode || 'host_only',
    guestCount: privateGuestCount,
  });
  const invitedPrivateGuestUids = new Set(
    (friendEventProjection?.guests || []).map((guest) => guest.uid)
  );
  const privateInviteCandidates = socialFriends.filter(
    (friend) => !invitedPrivateGuestUids.has(friend.uid)
  );

  // Prepare images array for the image viewer
  // Use fallback if: URL is invalid OR the thumbnail reported a load error
  const getImagesForViewer = () => {
    // If URL looks valid AND the thumbnail didn't error, use the remote URL
    if (isValidImageUrl(imageUrl) && !isUsingFallbackImage) {
      return [{ uri: imageUrl }];
    }
    // Otherwise use the local fallback asset
    return [getCategoryFallbackImage(updatedEvent.category, updatedEvent.type, 'post', updatedEvent)];
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
  const trendingShimmerTranslateX = trendingShimmerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-56, 122],
  });
  const trendingShimmerOpacity = trendingShimmerProgress.interpolate({
    inputRange: [0, 0.18, 0.5, 0.82, 1],
    outputRange: [0, 0.28, 0.78, 0.28, 0],
  });
  const trendingFlameScale = trendingPulseProgress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [1, 1.18, 1],
  });

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
        waitFor={titleScrollRef}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-15, 15]}
        onGestureEvent={onHorizontalPanGestureEvent}
        onHandlerStateChange={onHorizontalPanStateChange}
      >
      {/* Content container */}
      <Animated.View
        testID="event-lightbox-panel"
        style={[
          styles.contentContainer,
          {
            top: lightboxTop,
            bottom: tabBarHeight,
          },
          { transform: [{ translateY: translateY }, { translateX: translateX }] }
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerVenueAvatarContainer}>
            <FallbackImage
              imageUrl={updatedEvent.profileUrl}
              category={updatedEvent.category}
              type={updatedEvent.type}
              style={styles.headerVenueAvatar}
              fallbackType="profile"
              item={updatedEvent}
              resizeMode="cover"
            />
            {(!isPrivateFriendEvent || friendEventProjection?.locationType === 'recognized_venue') && (
              <View style={styles.headerVenueFavoriteOverlay}>
                <VenueFavoriteButton
                  locationKey={createLocationKeyFromEvent(updatedEvent)}
                  venueName={updatedEvent.venue}
                  size={12}
                  source="event_image_lightbox"
                  style={styles.headerVenueFavoriteButton}
                />
              </View>
            )}
          </View>
          <View style={styles.headerTextContainer}>
            <GestureScrollView
              ref={titleScrollRef}
              horizontal
              nestedScrollEnabled
              bounces={false}
              showsHorizontalScrollIndicator={false}
              overScrollMode="never"
              style={styles.titleScroll}
              contentContainerStyle={styles.titleScrollContent}
            >
              <Text
                style={styles.title}
                numberOfLines={1}
                accessibilityLabel={updatedEvent.title}
              >
                {updatedEvent.title}
              </Text>
            </GestureScrollView>
            <Text style={styles.subtitle} numberOfLines={1}>
              {updatedEvent.venue}
            </Text>
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
            style={[styles.image, { height: imageHeight }]}
            fallbackType="post"
            item={updatedEvent}
            resizeMode="contain"
            onFallback={setIsUsingFallbackImage as any}
          />
          {/* Add a subtle zoom icon overlay */}
          <View style={styles.zoomIconOverlay}>
            <MaterialIcons name="zoom-in" size={24} color="rgba(255, 255, 255, 0.8)" />
          </View>

          {showTrendingOverlay && (
            <View style={styles.trendingOverlay} pointerEvents="none">
              <View
                style={[
                  styles.trendingStatusPill,
                  isReduceMotionEnabled && styles.trendingStatusPillReducedMotion,
                ]}
              >
                {isReduceMotionEnabled ? (
                  <View style={styles.trendingReducedMotionGlow} pointerEvents="none" />
                ) : (
                  <Animated.View
                    style={[
                      styles.trendingShimmer,
                      {
                        opacity: trendingShimmerOpacity,
                        transform: [
                          { translateX: trendingShimmerTranslateX },
                          { rotate: '18deg' },
                        ],
                      },
                    ]}
                    pointerEvents="none"
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255, 255, 255, 0)',
                        'rgba(255, 159, 28, 0.62)',
                        'rgba(255, 246, 214, 0.74)',
                        'rgba(255, 159, 28, 0.62)',
                        'rgba(255, 255, 255, 0)',
                      ]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.trendingShimmerGradient}
                    />
                  </Animated.View>
                )}
                <Animated.View
                  style={[
                    styles.trendingFlameIcon,
                    !isReduceMotionEnabled && {
                      transform: [{ scale: trendingFlameScale }],
                    },
                  ]}
                >
                  <MaterialIcons name="local-fire-department" size={15} color="#FF8A00" />
                </Animated.View>
                <Text style={styles.trendingStatusText}>Trending</Text>
              </View>
              <View style={styles.trendingPositionPill}>
                <Text style={styles.trendingPositionText}>{trendingPositionLabel}</Text>
              </View>
            </View>
          )}

          {isCityEvent && !showTrendingOverlay && (
            <View style={styles.trendingOverlay} pointerEvents="none">
              <View style={styles.cityEventStatusPill}>
                <MaterialIcons
                  name={routeEvent ? 'alt-route' : 'festival'}
                  size={15}
                  color="#4E342E"
                />
                <Text style={styles.cityEventStatusText} numberOfLines={1}>
                  {routeEvent
                    ? getRouteCompactCertaintyLabel(updatedEvent.routeData)
                    : areaLocationsEvent
                      ? getAreaLocationsLabel(updatedEvent)
                      : 'Area-wide'}
                </Text>
              </View>
              {events && currentIndex !== undefined && (
                <View style={styles.trendingPositionPill}>
                  <Text style={styles.trendingPositionText}>
                    {`${currentIndex + 1} / ${events.length}`}
                  </Text>
                </View>
              )}
            </View>
          )}

          {navigationEnabled && (
            <>
              {canNavigatePrev && (
                <TouchableOpacity
                  style={styles.navArrowLeft}
                  onPress={() => onNavigate && currentIndex !== undefined && onNavigate(currentIndex - 1)}
                  activeOpacity={0.7}
                >
                  <View style={styles.navArrowContainer}>
                    <MaterialIcons name="chevron-left" size={38} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              )}
              {canNavigateNext && (
                <TouchableOpacity
                  style={styles.navArrowRight}
                  onPress={() => onNavigate && currentIndex !== undefined && onNavigate(currentIndex + 1)}
                  activeOpacity={0.7}
                >
                  <View style={styles.navArrowContainer}>
                    <MaterialIcons name="chevron-right" size={38} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              )}
            </>
          )}

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
              <Text style={styles.badgeText}>Now</Text>
            </View>
          )}
          <FamilyFriendlyBadge event={updatedEvent} />
          <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(updatedEvent.category) }]}>
            <Text style={styles.badgeText}>{updatedEvent.category}</Text>
          </View>
          {updatedEvent.friendEvent && (
            <View style={styles.privateInvitationBadge}>
              <MaterialIcons name="lock" size={12} color="#FFFFFF" />
              <Text style={styles.badgeText}>{privateBadgeLabel}</Text>
            </View>
          )}
          {!isPrivateFriendEvent && hasDisplayableTicketPrice(updatedEvent.ticketPrice) &&
            updatedEvent.ticketPrice !== 'Ticketed Event' &&
            !(hasTicketLink && paid) && (
            <View style={styles.priceBadge}>
              <Text style={styles.badgeText}>{updatedEvent.ticketPrice}</Text>
            </View>
          )}
          
          {/* Add ticket/register button near price - grayed out for guests */}
          {hasTicketLink && paid && (
            <TicketCtaPill
              disabled={isGuest}
              onPress={handleTickets}
              price={updatedEvent.ticketPrice}
              style={styles.ticketCtaPill}
            />
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

        {isPrivateFriendEvent && (
          <View style={styles.privateEventContext}>
            <View style={styles.privateEventContextHeader}>
              <View style={styles.privateEventContextIcon}>
                <MaterialIcons name="lock" size={17} color="#FFFFFF" />
              </View>
              <View style={styles.privateEventContextCopy}>
                <Text style={styles.privateEventContextTitle} numberOfLines={1}>
                  {updatedEvent.friendEvent?.viewerRole === 'host'
                    ? 'Hosted by you'
                    : `Hosted by ${privateHostName}`}
                </Text>
                <Text style={styles.privateEventContextMeta} numberOfLines={2}>
                  {privateAudienceCopy}
                  {privateGuestCount > 0 ? ` · ${privateGuestCount} invited` : ''}
                </Text>
              </View>
              {privateLightboxAction.kind !== 'none' && (
                <TouchableOpacity
                  accessibilityLabel={privateLightboxAction.kind === 'manage'
                    ? 'Manage private event'
                    : privateLightboxAction.label}
                  activeOpacity={0.75}
                  onPress={handleOpenPrivateContext}
                  style={styles.privateEventDetailsButton}
                >
                  <Text style={styles.privateEventDetailsText}>
                    {privateLightboxAction.label}
                  </Text>
                  <MaterialIcons name="chevron-right" size={17} color="#D6BBFB" />
                </TouchableOpacity>
              )}
            </View>

            {updatedEvent.friendEvent?.viewerRole === 'guest' && (
              <View style={styles.privateRsvpRow}>
                {([
                  ['going', 'Going', 'check-circle'],
                  ['maybe', 'Maybe', 'help'],
                  ['cant_go', "Can't go", 'cancel'],
                ] as const).map(([value, label, icon]) => {
                  const selected = privateOwnRsvp === value;
                  const busy = privateRsvpBusy === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      accessibilityLabel={`RSVP ${label}`}
                      accessibilityState={{ selected, busy }}
                      activeOpacity={0.75}
                      disabled={privateRsvpBusy !== null}
                      onPress={() => void handlePrivateRsvp(value)}
                      style={[
                        styles.privateRsvpButton,
                        selected && styles.privateRsvpButtonSelected,
                        privateRsvpBusy !== null && !busy && styles.privateRsvpButtonDimmed,
                      ]}
                    >
                      <MaterialIcons
                        name={busy ? 'hourglass-empty' : icon}
                        size={15}
                        color={selected || busy ? '#FFFFFF' : '#D6BBFB'}
                      />
                      <Text style={[
                        styles.privateRsvpText,
                        (selected || busy) && styles.privateRsvpTextSelected,
                      ]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {friendPresence && (
          <View style={styles.lightboxFriendPresence}>
            <TouchableOpacity
              accessibilityLabel={`${friendPresence.friendCount} friend${friendPresence.friendCount === 1 ? '' : 's'} checked in. ${friendListExpanded ? 'Hide' : 'Show'} who is here.`}
              accessibilityRole="button"
              activeOpacity={0.8}
              onPress={() => setFriendListExpanded((value) => !value)}
              style={styles.lightboxFriendPresenceHeader}
            >
              <View style={styles.lightboxFriendPresenceIcon}>
                <MaterialIcons name="people" size={17} color="#FFFFFF" />
              </View>
              <View style={styles.lightboxFriendPresenceCopy}>
                <Text style={styles.lightboxFriendPresenceTitle} numberOfLines={1}>
                  {formatFriendsHere(friendPresence.friends)}
                </Text>
                <Text style={styles.lightboxFriendPresenceHint} numberOfLines={1}>
                  {friendListExpanded ? 'Hide check-in details' : 'Who’s here'}
                </Text>
              </View>
              <View style={styles.lightboxFriendPresenceCount}>
                <Text style={styles.lightboxFriendPresenceCountText}>{friendPresence.friendCount}</Text>
              </View>
              <MaterialIcons
                name={friendListExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                size={20}
                color="#53389E"
              />
            </TouchableOpacity>
            {friendListExpanded && (
              <GestureScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={friendPresence.friendCount > 3}
                style={styles.lightboxFriendPresenceList}
              >
                {friendPresence.friends.map((friend) => (
                  <View key={friend.ownerUid} style={styles.lightboxFriendPresencePerson}>
                    <View style={styles.lightboxFriendPresenceInitial}>
                      <Text style={styles.lightboxFriendPresenceInitialText}>
                        {(friend.displayName || 'F').trim().slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.lightboxFriendPresencePersonCopy}>
                      <Text style={styles.lightboxFriendPresenceName}>{friend.displayName}</Text>
                      {friend.message ? (
                        <Text style={styles.lightboxFriendPresenceMessage} numberOfLines={1}>
                          {friend.message}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </GestureScrollView>
            )}
          </View>
        )}

        {/* Essential event information */}
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

        {/* Description — fixed flexible area; scrolls internally for long copy */}
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
  colors={['rgba(34,34,34,0)', 'rgba(34,34,34,0.5)', '#222222']}
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
          
          {routeEvent || areaLocationsEvent ? (
            <View style={styles.routeActionSlot}>
              <GathRShimmerPill
                iconName={routeEvent ? 'alt-route' : 'festival'}
                iconSize={20}
                label={routeEvent
                  ? (drawableRoute ? 'Show Route' : 'Route Info')
                  : (areaLocationsEvent ? 'Show Locations' : 'Location Info')}
                onPress={handleRouteAction}
                style={styles.routeActionPill}
                testID="show-route-shimmer-button"
              />
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionButton,
                (isGuest || !privateDirectionsAvailable) && styles.disabledActionButton
              ]}
              onPress={handleDirections}
              activeOpacity={isGuest ? 1 : 0.7}
              disabled={isGuest}
            >
              <View style={styles.actionButtonContent}>
                <MaterialIcons
                  name="directions"
                  size={22}
                  color={isGuest || !privateDirectionsAvailable ? "#666666" : "#FFFFFF"}
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
                (isGuest || !privateDirectionsAvailable) && styles.disabledActionText
              ]}>
                {privateDirectionsAvailable ? 'Directions' : 'Location later'}
              </Text>
            </TouchableOpacity>
          )}
          
          {/* Only add the tickets button to action container if not displayed next to price already */}
          {hasTicketLink && !hasDisplayableTicketPrice(updatedEvent.ticketPrice) && (
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

        {/* Navigation position indicator for non-trending carousels */}
        {navigationEnabled && (
          <>
            {/* Position indicator */}
            {!isTrending && !isCityEvent && events && currentIndex !== undefined && (
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

      <Modal
        animationType="slide"
        onRequestClose={() => setPrivateGuestSheetVisible(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={privateGuestSheetVisible}
      >
        <View style={styles.privateGuestSheetBackdrop}>
          <TouchableOpacity
            accessibilityLabel="Close guest list"
            activeOpacity={1}
            onPress={() => setPrivateGuestSheetVisible(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[
            styles.privateGuestSheet,
            { paddingBottom: Math.max(16, safeAreaInsets.bottom + 8) },
          ]}>
            <View style={styles.privateGuestSheetHandle} />
            <View style={styles.privateGuestSheetHeader}>
              <View style={styles.privateGuestSheetHeaderCopy}>
                <Text style={styles.privateGuestSheetTitle}>
                  {privateGuestListVisible ? `Guests (${privateGuestCount})` : 'Invite a friend'}
                </Text>
                <Text style={styles.privateGuestSheetMeta}>
                  {privateGuestListVisible
                    ? 'Visible to invited guests'
                    : 'The host keeps the guest list private'}
                  {privateCanInvite ? ' · Guest invites allowed' : ''}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Close guest list"
                onPress={() => setPrivateGuestSheetVisible(false)}
                style={styles.privateGuestSheetClose}
              >
                <MaterialIcons name="close" size={22} color="#344054" />
              </TouchableOpacity>
            </View>

            {privateGuestListVisible && (
              <GestureScrollView
                contentContainerStyle={styles.privateGuestListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={(friendEventProjection?.guests.length || 0) > 4}
                style={styles.privateGuestList}
              >
                {(friendEventProjection?.guests || []).map((guest) => (
                  <View key={guest.uid} style={styles.privateGuestRow}>
                    <View style={styles.privateGuestAvatar}>
                      <Text style={styles.privateGuestAvatarText}>
                        {guest.displayName.trim().charAt(0).toUpperCase() || '?'}
                      </Text>
                    </View>
                    <View style={styles.privateGuestCopy}>
                      <Text numberOfLines={1} style={styles.privateGuestName}>
                        {guest.displayName}
                      </Text>
                      <Text style={styles.privateGuestResponse}>
                        {formatFriendEventGuestResponse(guest.response)}
                      </Text>
                    </View>
                  </View>
                ))}
                {(friendEventProjection?.guests.length || 0) === 0 && (
                  <View style={styles.privateGuestEmpty}>
                    <MaterialIcons name="people-outline" size={26} color="#98A2B3" />
                    <Text style={styles.privateGuestEmptyText}>
                      Guest names are not available yet.
                    </Text>
                  </View>
                )}
              </GestureScrollView>
            )}

            {privateCanInvite && (
              <>
                <TouchableOpacity
                  accessibilityLabel="Invite a friend"
                  activeOpacity={0.78}
                  onPress={() => setPrivateInviteExpanded((value) => !value)}
                  style={styles.privateInviteToggle}
                >
                  <View style={styles.privateInviteToggleIcon}>
                    <MaterialIcons name="person-add" size={19} color="#6941C6" />
                  </View>
                  <Text style={styles.privateInviteToggleText}>Invite a friend</Text>
                  <MaterialIcons
                    name={privateInviteExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                    size={21}
                    color="#6941C6"
                  />
                </TouchableOpacity>

                {privateInviteExpanded && (
                  <GestureScrollView
                    contentContainerStyle={styles.privateInviteListContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={privateInviteCandidates.length > 3}
                    style={styles.privateInviteList}
                  >
                    {privateInviteCandidates.map((friend) => {
                      const busy = privateInviteBusyUid === friend.uid;
                      return (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          disabled={privateInviteBusyUid !== null}
                          key={friend.uid}
                          onPress={() => void handlePrivateInvite(friend.uid)}
                          style={styles.privateInviteRow}
                        >
                          <View style={styles.privateGuestAvatar}>
                            <Text style={styles.privateGuestAvatarText}>
                              {friend.displayName.trim().charAt(0).toUpperCase() || '?'}
                            </Text>
                          </View>
                          <View style={styles.privateGuestCopy}>
                            <Text numberOfLines={1} style={styles.privateGuestName}>
                              {friend.displayName}
                            </Text>
                            <Text numberOfLines={1} style={styles.privateGuestResponse}>
                              @{friend.socialHandle}
                            </Text>
                          </View>
                          {busy
                            ? <ActivityIndicator color="#6941C6" size="small" />
                            : <MaterialIcons name="add-circle-outline" size={24} color="#6941C6" />}
                        </TouchableOpacity>
                      );
                    })}
                    {privateInviteCandidates.length === 0 && (
                      <Text style={styles.privateInviteEmptyText}>
                        All of your eligible friends are already invited.
                      </Text>
                    )}
                  </GestureScrollView>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>

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
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#222222',
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
  titleScroll: {
    maxWidth: '100%',
    flexGrow: 0,
    flexShrink: 1,
  },
  titleScrollContent: {
    paddingRight: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flexShrink: 0,
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
    backgroundColor: '#000000',
  },
  imageWrapper: {
    position: 'relative',
  },
  headerVenueAvatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    marginRight: 10,
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.24,
    shadowRadius: 4,
    elevation: 4,
  },
  headerVenueAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerVenueFavoriteOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    zIndex: 6,
  },
  headerVenueFavoriteButton: {
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
  trendingOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 12,
  },
  trendingStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 17, 17, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
    position: 'relative',
  },
  trendingStatusPillReducedMotion: {
    borderColor: 'rgba(255, 138, 0, 0.62)',
  },
  cityEventStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 196, 0, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    maxWidth: 168,
  },
  cityEventStatusText: {
    color: '#4E342E',
    fontSize: 12.5,
    fontWeight: '700',
    marginLeft: 5,
    flexShrink: 1,
  },
  trendingReducedMotionGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 138, 0, 0.16)',
  },
  trendingShimmer: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: 0,
    width: 42,
  },
  trendingShimmerGradient: {
    flex: 1,
  },
  trendingFlameIcon: {
    zIndex: 1,
  },
  trendingStatusText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
    zIndex: 1,
  },
  trendingPositionPill: {
    minHeight: 32,
    marginLeft: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(17, 17, 17, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
  },
  trendingPositionText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
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
  privateInvitationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 6,
    backgroundColor: '#6941C6',
  },
  privateEventContext: {
    marginHorizontal: 16,
    marginBottom: 5,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#7F56D9',
    backgroundColor: '#2D1B4E',
  },
  privateEventContextHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  privateEventContextIcon: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#6941C6',
  },
  privateEventContextCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
  },
  privateEventContextTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '900',
  },
  privateEventContextMeta: {
    marginTop: 1,
    color: '#D6BBFB',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '600',
  },
  privateEventDetailsButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 7,
    paddingLeft: 9,
    paddingRight: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  privateEventDetailsText: {
    color: '#F4EBFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  privateRsvpRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 9,
    paddingBottom: 8,
  },
  privateRsvpButton: {
    flex: 1,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(214, 187, 251, 0.45)',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  privateRsvpButtonSelected: {
    borderColor: '#FFFFFF',
    backgroundColor: '#7F56D9',
  },
  privateRsvpButtonDimmed: {
    opacity: 0.45,
  },
  privateRsvpText: {
    color: '#D6BBFB',
    fontSize: 10.5,
    fontWeight: '800',
  },
  privateRsvpTextSelected: {
    color: '#FFFFFF',
  },
  privateGuestSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.60)',
  },
  privateGuestSheet: {
    maxHeight: '72%',
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F9FAFB',
  },
  privateGuestSheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: 10,
    borderRadius: 2,
    backgroundColor: '#D0D5DD',
  },
  privateGuestSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  privateGuestSheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  privateGuestSheetTitle: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '900',
  },
  privateGuestSheetMeta: {
    marginTop: 2,
    color: '#667085',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  privateGuestSheetClose: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderRadius: 19,
    backgroundColor: '#EAECF0',
  },
  privateGuestList: {
    maxHeight: 224,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  privateGuestListContent: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  privateGuestRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  privateGuestAvatar: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#E9D7FE',
  },
  privateGuestAvatarText: {
    color: '#6941C6',
    fontSize: 13,
    fontWeight: '900',
  },
  privateGuestCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  privateGuestName: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '800',
  },
  privateGuestResponse: {
    marginTop: 1,
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
  },
  privateGuestEmpty: {
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  privateGuestEmptyText: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
  },
  privateInviteToggle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: '#F4EBFF',
  },
  privateInviteToggleIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#E9D7FE',
  },
  privateInviteToggleText: {
    flex: 1,
    marginLeft: 9,
    color: '#53389E',
    fontSize: 13,
    fontWeight: '900',
  },
  privateInviteList: {
    maxHeight: 184,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  privateInviteListContent: {
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  privateInviteRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EAECF0',
  },
  privateInviteEmptyText: {
    paddingHorizontal: 8,
    paddingVertical: 18,
    color: '#667085',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '600',
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
  ticketCtaPill: {
    marginRight: 8,
    marginBottom: 6,
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
  lightboxFriendPresence: {
    marginHorizontal: 16,
    marginBottom: 5,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#B692F6',
    backgroundColor: '#F4EBFF',
  },
  lightboxFriendPresenceHeader: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  lightboxFriendPresenceIcon: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#6941C6',
  },
  lightboxFriendPresenceCopy: { flex: 1, minWidth: 0, marginLeft: 9 },
  lightboxFriendPresenceTitle: { color: '#3E1C96', fontSize: 12.5, fontWeight: '900' },
  lightboxFriendPresenceHint: { marginTop: 1, color: '#6941C6', fontSize: 10.5, fontWeight: '700' },
  lightboxFriendPresenceCount: {
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#E9D7FE',
  },
  lightboxFriendPresenceCountText: { color: '#53389E', fontSize: 11, fontWeight: '900' },
  lightboxFriendPresenceList: {
    maxHeight: 118,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D6BBFB',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  lightboxFriendPresencePerson: { minHeight: 34, flexDirection: 'row', alignItems: 'center' },
  lightboxFriendPresenceInitial: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#D6BBFB',
  },
  lightboxFriendPresenceInitialText: { color: '#53389E', fontSize: 10, fontWeight: '900' },
  lightboxFriendPresencePersonCopy: { flex: 1, minWidth: 0, marginLeft: 8 },
  lightboxFriendPresenceName: { color: '#3E1C96', fontSize: 11.5, fontWeight: '800' },
  lightboxFriendPresenceMessage: { color: '#6941C6', fontSize: 10.5 },
  infoContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginLeft: 6,
    flex: 1,
  },
  descriptionContainer: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },


  descriptionScroll: {
    flex: 1,
    marginBottom: 8,
  },
  descriptionContent: {
    paddingBottom: 2,
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

  routeActionSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  routeActionPill: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 9,
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
    left: 8,
    top: '50%',
    transform: [{ translateY: -23 }],
    zIndex: 10,
  },
  navArrowRight: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -23 }],
    zIndex: 10,
  },
  navArrowContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 23,
    width: 46,
    height: 46,
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
