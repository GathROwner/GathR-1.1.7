// services/userService.js
import { auth, firestore } from '../config/firebaseConfig';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, runTransaction } from 'firebase/firestore';
// analytics
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import * as Notifications from 'expo-notifications';
import { ensureNotificationPermissions, schedulePreEventNotification, cancelPreEventNotification, schedulePostEventSurveyNotification, cancelPostEventNotification } from './notificationService';

// In-memory cache for user data
let cachedUserInterests = [];
let cachedUserFavorites = [];
let cachedSavedEvents = []; // New cache for saved events
let cachedFavoriteVenues = []; // Cache for favorite venues
let cachedLikedEvents = []; // Cache for liked events
let cachedInterestedEvents = []; // Cache for interested events (calendar adds)

export async function getUserInterests() {
  // Return cached data if available
  if (cachedUserInterests.length > 0) return cachedUserInterests;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedUserInterests = userData.userInterests || [];
      return cachedUserInterests;
    }
    return [];
  } catch (error) {
    console.error('Error fetching user interests:', error);
    return [];
  }
}

export async function getUserFavorites() {
  // Return cached data if available
  if (cachedUserFavorites.length > 0) return cachedUserFavorites;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedUserFavorites = userData.favorites || [];
      return cachedUserFavorites;
    }
    return [];
  } catch (error) {
    console.error('Error fetching user favorites:', error);
    return [];
  }
}

/**
 * Gets the current user's saved events
 * @returns {Promise<string[]>} Array of saved event IDs
 */
export async function getSavedEvents() {
  // Return cached data if available
  if (cachedSavedEvents.length > 0) return cachedSavedEvents;
  
  const currentUser = auth.currentUser;
  if (!currentUser) return [];
  
  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedSavedEvents = userData.savedEvents || [];
      return cachedSavedEvents;
    }
    return [];
  } catch (error) {
    console.error('Error fetching saved events:', error);
    return [];
  }
}

/**
 * Gets the current user's liked events
 * @returns {Promise<string[]>} Array of liked event IDs
 */
export async function getLikedEvents() {
  if (cachedLikedEvents.length > 0) return cachedLikedEvents;

  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedLikedEvents = userData.likedEvents || [];
      return cachedLikedEvents;
    }
    return [];
  } catch (error) {
    console.error('Error fetching liked events:', error);
    return [];
  }
}

/**
 * Gets the current user's interested events (events they added to calendar)
 * @returns {Promise<string[]>} Array of interested event IDs
 */
export async function getInterestedEvents() {
  if (cachedInterestedEvents.length > 0) return cachedInterestedEvents;

  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedInterestedEvents = userData.interestedEvents || [];
      return cachedInterestedEvents;
    }
    return [];
  } catch (error) {
    console.error('Error fetching interested events:', error);
    return [];
  }
}

/**
 * Toggles an event's saved status
 * @param {string|number} eventId - The ID of the event to toggle
 * @returns {Promise<{success: boolean, saved: boolean, message: string}>} Result object
 */
/**
 * Toggles and centrally tracks save/unsave.
 * `meta` is optional; pass fields like { type: 'event'|'special', source, referrer, venue, category } when available.
 */
export async function toggleSavedEvent(eventId, meta = {}, eventForScheduling = null) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, message: 'No user logged in' };

  try {
    const savedEvents = await getSavedEvents();
    const eventIdString = String(eventId);
    const isCurrentlySaved = savedEvents.includes(eventIdString);
    const userRef = doc(firestore, 'users', currentUser.uid);

    if (isCurrentlySaved) {
      // remove
      await updateDoc(userRef, { savedEvents: arrayRemove(eventIdString) });
      cachedSavedEvents = cachedSavedEvents.filter(id => id !== eventIdString);
try { await cancelPreEventNotification(eventIdString); } catch {}
try { await cancelPostEventNotification(eventIdString); } catch {}

      // analytics
      try {
        amplitudeTrack('unsave_tapped', {
          event_id: eventIdString,
          content_type: meta?.type === 'special' ? 'special' : 'event',
          source: meta?.source,
          referrer_screen: meta?.referrer,
          venue_name: meta?.venue,
          category: meta?.category,
        });
      } catch {}

      return { success: true, saved: false, message: 'Event removed from saved items' };
    } else {
      // add
await updateDoc(userRef, { savedEvents: arrayUnion(eventIdString) });
cachedSavedEvents.push(eventIdString);

// schedule 30-min-before reminder (best-effort)
try {
const granted = await ensureNotificationPermissions();
console.log('[notifications] permission check', { granted, hasEventData: !!eventForScheduling });

if (!granted && eventForScheduling) {
  console.warn('[notifications] Notifications disabled - event saved without reminders');
  // Show user-facing alert
  try {
    const { Alert } = require('react-native');
    Alert.alert(
      'Reminders Disabled',
      'Event saved! However, you won\'t receive notifications because notification permissions are disabled. Enable them in your device settings to get reminders.',
      [{ text: 'OK' }]
    );
  } catch (e) {
    console.warn('[notifications] Could not show alert', e);
  }
}

if (granted && eventForScheduling) {
  // Hard reset: ensure no previously delivered notifications linger
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    console.warn('[notifications] pre-schedule dismissAll failed', e);
  }

    // ---- NOTIFICATION SCHEDULING (gated) ----
    // Helpers to build local Date objects from your strings
    const parseHMS = (raw) => {
      const s = (raw || '').trim().toLowerCase();
      if (!s) return { h: 0, m: 0, sec: 0 };
      if (s === 'noon') return { h: 12, m: 0, sec: 0 };
      if (s === 'midnight') return { h: 0, m: 0, sec: 0 };
      let norm = s.replace(/\./g, '').replace(/\s+/g, '');
      let ap = null;
      if (norm.endsWith('am')) { ap = 'AM'; norm = norm.slice(0, -2); }
      else if (norm.endsWith('pm')) { ap = 'PM'; norm = norm.slice(0, -2); }
      const [hhRaw = '0', mmRaw = '0', ssRaw = '0'] = norm.split(':');
      let h = parseInt(hhRaw || '0', 10);
      const m = parseInt(mmRaw || '0', 10) || 0;
      const sec = parseInt(ssRaw || '0', 10) || 0;
      if (ap === 'AM') { if (h === 12) h = 0; }
      else if (ap === 'PM') { if (h !== 12) h = (h % 12) + 12; }
      return { h: (isNaN(h) ? 0 : h), m, sec };
    };
    const buildDate = (yyyyMMdd, timeStr, fallbackTime = '11:59 PM') => {
      if (!yyyyMMdd) return null;
      try {
        const [y, mo, d] = (yyyyMMdd || '').split('-').map((x) => parseInt(x || '0', 10));
        if (!y || !mo || !d) return null;
        const { h, m, sec } = parseHMS(timeStr || fallbackTime);
        return new Date(y, mo - 1, d, h, m, sec || 0);
      } catch {
        return null;
      }
    };

    const start = buildDate(eventForScheduling.startDate, eventForScheduling.startTime);
    const end   = buildDate(
      eventForScheduling.endDate || eventForScheduling.startDate,
      eventForScheduling.endTime || '11:59 PM'
    );
    const now = new Date();

    // Always try to schedule the pre-event reminder if start is in the future
    if (start && start.getTime() > now.getTime()) {
      const preId = await schedulePreEventNotification({
        id: eventForScheduling.id,
        title: eventForScheduling.title,
        venue: eventForScheduling.venue,
        address: eventForScheduling.address,
        startDate: eventForScheduling.startDate,
        startTime: eventForScheduling.startTime,
      });
      try { console.log('[notifications] scheduled pre_event id =', preId); } catch {}
    } else {
      console.log('[notifications] pre_event not scheduled (start missing or not in future)', {
        id: String(eventForScheduling.id), start: String(start)
      });
    }

// Schedule post-event survey ONLY after the event has STARTED (start <= now)
// and BEFORE it ENDS (end > now). Never days in advance.
const hasStarted = start && start.getTime() <= now.getTime();
const notEnded   = end && end.getTime() > now.getTime();

if (hasStarted && notEnded) {
  const postId = await schedulePostEventSurveyNotification({
    id: eventForScheduling.id,
    title: eventForScheduling.title,
    venue: eventForScheduling.venue,
    address: eventForScheduling.address,
    endDate: eventForScheduling.endDate || eventForScheduling.startDate,
    endTime: eventForScheduling.endTime, // may be undefined; handled in service
  });
  try { console.log('[notifications] scheduled post_event_survey id =', postId); } catch {}
} else {
  console.log('[notifications] post_event_survey not scheduled yet', {
    id: String(eventForScheduling.id),
    start: String(start),
    end: String(end),
    hasStarted,
    notEnded,
  });
}

    // ---- /NOTIFICATION SCHEDULING ----
  }
} catch (e) {
  console.warn('[notifications] schedule failed', e);
}


      // analytics
      try {
        amplitudeTrack('save_tapped', {
          event_id: eventIdString,
          content_type: meta?.type === 'special' ? 'special' : 'event',
          source: meta?.source,
          referrer_screen: meta?.referrer,
          venue_name: meta?.venue,
          category: meta?.category,
        });
      } catch {}

      return { success: true, saved: true, message: 'Event saved successfully' };
    }
  } catch (error) {
    console.error('Error toggling saved event:', error);
    return { success: false, message: 'Failed to update saved event' };
  }
}


/**
 * Checks if an event is saved by the current user
 * @param {string|number} eventId - The ID of the event to check
 * @returns {Promise<boolean>} Whether the event is saved
 */
export async function isEventSaved(eventId) {
  const savedEvents = await getSavedEvents();
  return savedEvents.includes(eventId.toString());
}

export async function toggleEventLike(eventId, meta = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, liked: false, message: 'No user logged in' };

  const eventIdString = String(eventId);
  const userRef = doc(firestore, 'users', currentUser.uid);
  const likesRef = doc(firestore, 'eventLikes', eventIdString);

  try {
    const transactionResult = await runTransaction(firestore, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User document not found');
      }

      const likedEventsOnServer = userSnap.data()?.likedEvents || [];
      const isCurrentlyLiked = likedEventsOnServer.includes(eventIdString);
      const nextLikedEvents = isCurrentlyLiked
        ? likedEventsOnServer.filter((id) => id !== eventIdString)
        : [...likedEventsOnServer, eventIdString];

    const baseLikes = typeof meta.baseLikes === 'number' ? meta.baseLikes : 0;
    const likesSnap = await tx.get(likesRef);
    const currentCount = likesSnap.exists()
      ? Number(likesSnap.data()?.count ?? 0)
      : baseLikes;
      const delta = isCurrentlyLiked ? -1 : 1;
      const nextCount = Math.max(0, currentCount + delta);

      if (likesSnap.exists()) {
        tx.update(likesRef, { count: nextCount });
      } else {
        tx.set(likesRef, { count: nextCount });
      }

      tx.update(userRef, {
        likedEvents: isCurrentlyLiked ? arrayRemove(eventIdString) : arrayUnion(eventIdString),
      });

      return {
        liked: !isCurrentlyLiked,
        count: nextCount,
        nextLikedEvents,
      };
    });

    cachedLikedEvents = transactionResult.nextLikedEvents;

    try {
      amplitudeTrack('like_tapped', {
        event_id: eventIdString,
        content_type: meta?.type === 'special' ? 'special' : 'event',
        source: meta?.source,
        referrer_screen: meta?.referrer,
        venue_name: meta?.venue,
        category: meta?.category,
        liked: transactionResult.liked ? 1 : 0,
      });
    } catch (error) {
      console.error('Amplitude failed for like_tapped', error);
    }

    return {
      success: true,
      liked: transactionResult.liked,
      count: transactionResult.count,
    };
  } catch (error) {
    console.error('Error toggling event like:', error);
    return { success: false, liked: false, message: 'Failed to update like' };
  }
}

/**
 * Increments the share count for an event
 * Unlike likes, shares are NOT toggleable - they only increment
 * Users can share the same event multiple times
 * @param {string|number} eventId - The ID of the event being shared
 * @param {object} meta - Optional metadata for analytics
 * @returns {Promise<{success: boolean, count: number, message?: string}>}
 */
export async function incrementEventShare(eventId, meta = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, count: 0, message: 'No user logged in' };

  const eventIdString = String(eventId);
  const sharesRef = doc(firestore, 'eventShares', eventIdString);

  try {
    const transactionResult = await runTransaction(firestore, async (tx) => {
      const sharesSnap = await tx.get(sharesRef);

      // Get base shares from meta (fallback from event.shares) or start at 0
      const baseShares = typeof meta.baseShares === 'number' ? meta.baseShares : 0;
      const currentCount = sharesSnap.exists()
        ? Number(sharesSnap.data()?.count ?? 0)
        : baseShares;

      const nextCount = currentCount + 1;

      if (sharesSnap.exists()) {
        tx.update(sharesRef, { count: nextCount });
      } else {
        tx.set(sharesRef, { count: nextCount });
      }

      return { count: nextCount };
    });

    // Analytics tracking
    try {
      amplitudeTrack('share_completed', {
        event_id: eventIdString,
        content_type: meta?.type === 'special' ? 'special' : 'event',
        source: meta?.source,
        referrer_screen: meta?.referrer,
        venue_name: meta?.venue,
        category: meta?.category,
        new_count: transactionResult.count,
      });
    } catch (error) {
      console.error('Amplitude failed for share_completed', error);
    }

    return {
      success: true,
      count: transactionResult.count,
    };
  } catch (error) {
    console.error('Error incrementing event share:', error);
    return { success: false, count: 0, message: 'Failed to update share count' };
  }
}

export async function isEventLiked(eventId) {
  const likedEvents = await getLikedEvents();
  return likedEvents.includes(eventId.toString());
}

/**
 * Toggles an event's interested status (marks user as interested/not interested)
 * Similar to likes, this is toggleable - users can mark and unmark interest
 * @param {string|number} eventId - The ID of the event
 * @param {object} meta - Optional metadata for analytics
 * @returns {Promise<{success: boolean, interested: boolean, count?: number, message?: string}>}
 */
export async function toggleEventInterested(eventId, meta = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, interested: false, message: 'No user logged in' };

  const eventIdString = String(eventId);
  const userRef = doc(firestore, 'users', currentUser.uid);
  const interestedRef = doc(firestore, 'eventUsersResponded', eventIdString);

  try {
    const transactionResult = await runTransaction(firestore, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User document not found');
      }

      const interestedEventsOnServer = userSnap.data()?.interestedEvents || [];
      const isCurrentlyInterested = interestedEventsOnServer.includes(eventIdString);
      const nextInterestedEvents = isCurrentlyInterested
        ? interestedEventsOnServer.filter((id) => id !== eventIdString)
        : [...interestedEventsOnServer, eventIdString];

      const baseInterested = typeof meta.baseInterested === 'number' ? meta.baseInterested : 0;
      const interestedSnap = await tx.get(interestedRef);
      const currentCount = interestedSnap.exists()
        ? Number(interestedSnap.data()?.count ?? 0)
        : baseInterested;
      const delta = isCurrentlyInterested ? -1 : 1;
      const nextCount = Math.max(0, currentCount + delta);

      if (interestedSnap.exists()) {
        tx.update(interestedRef, { count: nextCount });
      } else {
        tx.set(interestedRef, { count: nextCount });
      }

      tx.update(userRef, {
        interestedEvents: isCurrentlyInterested ? arrayRemove(eventIdString) : arrayUnion(eventIdString),
      });

      return {
        interested: !isCurrentlyInterested,
        count: nextCount,
        nextInterestedEvents,
      };
    });

    cachedInterestedEvents = transactionResult.nextInterestedEvents;

    try {
      const analyticsEvent = transactionResult.interested ? 'interested_tapped' : 'uninterested_tapped';
      amplitudeTrack(analyticsEvent, {
        event_id: eventIdString,
        content_type: meta?.type === 'special' ? 'special' : 'event',
        source: meta?.source,
        referrer_screen: meta?.referrer,
        venue_name: meta?.venue,
        category: meta?.category,
        new_count: transactionResult.count,
      });
    } catch (error) {
      console.error('Amplitude failed for interested_tapped', error);
    }

    return {
      success: true,
      interested: transactionResult.interested,
      count: transactionResult.count,
    };
  } catch (error) {
    console.error('Error toggling event interested:', error);
    return { success: false, interested: false, message: 'Failed to update interested' };
  }
}

/**
 * Checks if an event is marked as interested by the current user
 * @param {string|number} eventId - The ID of the event to check
 * @returns {Promise<boolean>}
 */
export async function isEventInterested(eventId) {
  const interestedEvents = await getInterestedEvents();
  return interestedEvents.includes(eventId.toString());
}

export function clearUserDataCache() {
  cachedUserInterests = [];
  cachedUserFavorites = [];
  cachedSavedEvents = []; // Clear saved events cache
  cachedFavoriteVenues = []; // Clear favorite venues cache
  cachedLikedEvents = []; // Clear liked events cache
  cachedInterestedEvents = []; // Clear interested events cache
}

/**
 * Gets the current user's favorite venues
 * @returns {Promise<string[]>} Array of favorite venue locationKeys
 */
export async function getFavoriteVenues() {
  // Return cached data if available
  if (cachedFavoriteVenues.length > 0) return cachedFavoriteVenues;

  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      cachedFavoriteVenues = userData.favoriteVenues || [];
      return cachedFavoriteVenues;
    }
    return [];
  } catch (error) {
    console.error('Error fetching favorite venues:', error);
    return [];
  }
}

/**
 * Toggles a venue's favorite status
 * @param {string} locationKey - The unique locationKey of the venue
 * @param {object} meta - Optional metadata for analytics (venueName, source, referrer)
 * @returns {Promise<{success: boolean, favorited: boolean, message: string}>}
 */
export async function toggleFavoriteVenue(locationKey, meta = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) return { success: false, message: 'No user logged in' };

  try {
    const favoriteVenues = await getFavoriteVenues();
    const isCurrentlyFavorite = favoriteVenues.includes(locationKey);
    const userRef = doc(firestore, 'users', currentUser.uid);

    if (isCurrentlyFavorite) {
      // Remove from favorites
      await updateDoc(userRef, { favoriteVenues: arrayRemove(locationKey) });
      cachedFavoriteVenues = cachedFavoriteVenues.filter(key => key !== locationKey);

      // Analytics
      try {
        amplitudeTrack('venue_unfavorite_tapped', {
          location_key: locationKey,
          venue_name: meta?.venueName,
          source: meta?.source,
          referrer_screen: meta?.referrer,
        });
      } catch {}

      return { success: true, favorited: false, message: 'Venue removed from favorites' };
    } else {
      // Add to favorites
      await updateDoc(userRef, { favoriteVenues: arrayUnion(locationKey) });
      cachedFavoriteVenues.push(locationKey);

      // Analytics
      try {
        amplitudeTrack('venue_favorite_tapped', {
          location_key: locationKey,
          venue_name: meta?.venueName,
          source: meta?.source,
          referrer_screen: meta?.referrer,
        });
      } catch {}

      return { success: true, favorited: true, message: 'Venue added to favorites' };
    }
  } catch (error) {
    console.error('Error toggling favorite venue:', error);
    return { success: false, message: 'Failed to update favorite venue' };
  }
}

/**
 * Checks if a venue is favorited by the current user
 * @param {string} locationKey - The unique locationKey of the venue
 * @returns {Promise<boolean>}
 */
export async function isVenueFavorite(locationKey) {
  const favoriteVenues = await getFavoriteVenues();
  return favoriteVenues.includes(locationKey);
}
