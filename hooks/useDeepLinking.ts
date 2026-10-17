/**
 * Deep Linking Hook for GathR
 *
 * Handles incoming deep links to open specific events in the lightbox.
 * Supports both:
 * - Custom scheme: gathr://event/123 or gathr://special/456
 * - Universal Links: https://link.gathrapp.ca/event/123
 * - Generic app link: https://www.gathrapp.ca/app/
 * - Legacy query params: https://link.gathrapp.ca?eventId=123&type=event
 */

import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter, usePathname } from 'expo-router';
import { useMapStore } from '../store/mapStore';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { Alert } from 'react-native';
import { areEventIdsEquivalent, toAppEventId } from '../lib/api/firestoreEvents';
import { isGenericAppLink, linkedFriendHandle, parseDeepLink } from '../utils/deepLinks';

/**
 * Parse a deep link URL to extract event ID and type
 */
export { linkedFriendHandle, parseDeepLink } from '../utils/deepLinks';

/**
 * Hook to handle deep links and open events in the lightbox
 */
export function useDeepLinking() {
  const router = useRouter();
  const pathname = usePathname();

  // Track processed URLs to prevent duplicate handling
  const processedUrls = useRef<Set<string>>(new Set());
  const isProcessing = useRef(false);

  /**
   * Handle an incoming deep link URL
   */
  const handleDeepLink = async (url: string) => {
    // Prevent duplicate processing
    if (processedUrls.current.has(url) || isProcessing.current) {
      console.log('[DeepLink] Skipping already processed URL:', url);
      return;
    }

    isProcessing.current = true;
    processedUrls.current.add(url);

    console.log('[DeepLink] Processing URL:', url);

    if (isGenericAppLink(url)) {
      console.log('[DeepLink] Generic app link opened:', url);

      try {
        amplitudeTrack('app_link_opened', {
          source: 'universal_link',
          current_screen: pathname,
        });
      } catch {}

      const friendHandle = linkedFriendHandle(url);
      if (friendHandle) {
        router.push({ pathname: '/friends', params: { handle: friendHandle } });
      } else if (!pathname.includes('map')) {
        router.replace('/(tabs)/map');
      }

      isProcessing.current = false;
      return;
    }

    const { eventId, type } = parseDeepLink(url);

    if (!eventId) {
      console.log('[DeepLink] No event ID found in URL');
      isProcessing.current = false;
      return;
    }

    console.log('[DeepLink] Parsed:', { eventId, type });

    // Track deep link opened
    try {
      amplitudeTrack('deep_link_opened', {
        event_id: eventId,
        type: type || 'event',
        source: 'universal_link',
        current_screen: pathname
      });
    } catch {}

    // Navigate to map tab if not already there
    if (!pathname.includes('map')) {
      console.log('[DeepLink] Navigating to map tab');
      router.replace('/(tabs)/map');
    }

    // Small delay to ensure navigation completes and data is available
    await new Promise(resolve => setTimeout(resolve, 500));

    // Get store state
    const store = useMapStore.getState();
    const { events, fetchEventDetails, setSelectedImageData } = store;
    const requestedAppId = toAppEventId(eventId);
    const findMatchingEvent = (items: typeof events) =>
      items.find(
        (candidate) =>
          areEventIdsEquivalent(candidate.id, eventId) ||
          String(candidate.id) === requestedAppId
      );

    // Try to find event in cache
    let event = findMatchingEvent(events);

    if (!event) {
      console.log('[DeepLink] Event not in cache, fetching details...');
      // Fetch event details if not in cache
      try {
        await fetchEventDetails([requestedAppId]);
        // Re-check after fetch
        const updatedState = useMapStore.getState();
        event = findMatchingEvent(updatedState.events);
      } catch (error) {
        console.error('[DeepLink] Failed to fetch event:', error);
      }
    }

    if (event) {
      console.log('[DeepLink] Opening lightbox for event:', event.title);

      // Open the lightbox
      setSelectedImageData({
        imageUrl: event.imageUrl,
        event: event
      });

      // Track successful deep link
      try {
        amplitudeTrack('deep_link_event_opened', {
          event_id: eventId,
          event_title: event.title,
          event_venue: event.venue,
          event_type: event.type
        });
      } catch {}
    } else {
      // Event not found - could be expired or invalid
      console.log('[DeepLink] Event not found:', eventId);

      try {
        amplitudeTrack('deep_link_event_not_found', { event_id: eventId });
      } catch {}

      // Show alert to user
      Alert.alert(
        'Event Not Found',
        'This event may have ended or been removed. Check out other events on GathR!',
        [
          {
            text: 'Browse Events',
            onPress: () => router.replace('/(tabs)/events')
          },
          { text: 'OK' }
        ]
      );
    }

    isProcessing.current = false;
  };

  useEffect(() => {
    // Handle initial URL (cold start - app opened via link)
    const getInitialURL = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          console.log('[DeepLink] Initial URL:', url);
          // Delay slightly to ensure app is fully loaded
          setTimeout(() => handleDeepLink(url), 1000);
        }
      } catch (error) {
        console.error('[DeepLink] Error getting initial URL:', error);
      }
    };

    getInitialURL();

    // Handle URLs when app is already running (warm start)
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[DeepLink] URL event received:', url);
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { handleDeepLink, parseDeepLink };
}

export default useDeepLinking;
