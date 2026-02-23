/**
 * useHotspotHighlight - Daily Hotspot Feature Hook
 *
 * Shows a pulsing highlight on the most active cluster once per day.
 * Integrates with tutorial system to avoid conflicts.
 *
 * Features:
 * - Finds the "hottest" cluster (NOW > TODAY > event count)
 * - Zooms camera to cluster, shows tooltip, then zooms back on dismiss
 * - Respects tutorial active state (no hotspot during tutorial)
 * - Once per day with user toggle to disable
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMapStore } from '../store/mapStore';
import {
  useUserPrefsStore,
  updateShowDailyHotspot,
} from '../store/userPrefsStore';
import { useTutorial } from './useTutorial';
import { useAuth } from '../contexts/AuthContext';
import { Cluster, TimeStatus } from '../types/events';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { isEventNow, isEventHappeningToday } from '../utils/dateUtils';

interface HotspotHighlightState {
  shouldShow: boolean;
  targetCluster: Cluster | null;
  tooltipText: string;
  tooltipSubtext: string;
  isAnimating: boolean;
  targetCoordinates: { longitude: number; latitude: number } | null;
}

interface HotspotHighlightActions {
  dismiss: () => void;
  disablePermanently: () => void;
  onClusterTap: () => void;
}

interface OriginalCameraPosition {
  coordinates: [number, number];
  zoom: number;
}

/**
 * Helper to determine a venue's "hotness" based on event timing.
 * Used for sorting venues within a cluster by priority.
 * Uses centralized dateUtils functions to properly handle AM/PM time formats.
 */
function getVenueHotness(venue: { events?: any[] }) {
  let nowCount = 0;
  let todayCount = 0;
  let futureCount = 0;

  for (const event of (venue.events || [])) {
    // Use centralized date utilities that properly handle "H:MM:SS AM/PM" format
    const eventIsNow = isEventNow(
      event.startDate,
      event.startTime,
      event.endDate,
      event.endTime
    );

    if (eventIsNow) {
      nowCount++;
    } else if (isEventHappeningToday(event)) {
      todayCount++;
    } else {
      futureCount++;
    }
  }

  return { nowCount, todayCount, futureCount, total: (venue.events?.length || 0) };
}

/**
 * Calculate venue relevance score using same additive scoring as handleMarkerPress:
 * - Favorite venue: +500
 * - Interest match: +100
 * - NOW event: +10
 * - TODAY event: +5
 * - FUTURE event: +1
 * Score is based on highest-scoring event in the venue.
 */
function calculateVenueRelevanceScore(
  venue: { events?: any[]; locationKey?: string },
  favoriteVenues: string[],
  userInterests: string[]
): number {
  const isFavoriteVenue = venue.locationKey ? favoriteVenues.includes(venue.locationKey) : false;
  const favoriteVenueScore = isFavoriteVenue ? 500 : 0;

  let maxEventScore = 0;
  for (const event of (venue.events || [])) {
    const interestScore = userInterests.includes(event.category) ? 100 : 0;

    let timeScore = 1; // Default: future
    const eventIsNow = isEventNow(
      event.startDate,
      event.startTime,
      event.endDate,
      event.endTime
    );
    if (eventIsNow) {
      timeScore = 10;
    } else if (isEventHappeningToday(event)) {
      timeScore = 5;
    }

    const eventScore = favoriteVenueScore + interestScore + timeScore;
    maxEventScore = Math.max(maxEventScore, eventScore);
  }

  return maxEventScore;
}

/**
 * Sort venues by relevance using additive scoring (matches handleMarkerPress):
 * Score = favoriteVenue(500) + interest(100) + time(10/5/1)
 * Higher scores first.
 */
function sortVenuesByRelevance<T extends { events?: any[]; locationKey?: string }>(
  venues: T[],
  favoriteVenues: string[] = [],
  userInterests: string[] = []
): T[] {
  return [...venues]
    .map(venue => ({
      venue,
      score: calculateVenueRelevanceScore(venue, favoriteVenues, userInterests)
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.venue);
}


/**
 * Find the "hottest" cluster using same priority as tutorial:
 * 1. Clusters with timeStatus === 'now' (highest priority)
 * 2. Clusters with timeStatus === 'today'
 * 3. Clusters with most total events/specials
 */
function findHottestCluster(clusters: Cluster[]): Cluster | null {
  if (!clusters || clusters.length === 0) return null;

  // Filter to clusters with content
  const withContent = clusters.filter(
    (c) => c.eventCount > 0 || c.specialCount > 0
  );

  if (withContent.length === 0) return null;

  // DEBUG: Log all clusters being considered
  console.log('[Hotspot] ===== Finding hottest cluster =====');
  console.log('[Hotspot] Total clusters:', clusters.length);
  console.log('[Hotspot] Clusters with content:', withContent.length);
  withContent.forEach((c, i) => {
    console.log(`[Hotspot] Cluster ${i}: timeStatus=${c.timeStatus}, events=${c.eventCount}, specials=${c.specialCount}, venues=${c.venues?.length}, firstVenue=${c.venues?.[0]?.venue}`);
  });

  // Sort by priority
  const sorted = [...withContent].sort((a, b) => {
    // Priority 1: NOW > TODAY > FUTURE
    const statusPriority: Record<TimeStatus, number> = {
      now: 0,
      today: 1,
      future: 2,
    };
    const statusDiff = statusPriority[a.timeStatus] - statusPriority[b.timeStatus];
    if (statusDiff !== 0) return statusDiff;

    // Priority 2: More total events/specials
    const aTotal = (a.eventCount || 0) + (a.specialCount || 0);
    const bTotal = (b.eventCount || 0) + (b.specialCount || 0);
    return bTotal - aTotal;
  });

  // DEBUG: Log the winner
  const winner = sorted[0];
  console.log('[Hotspot] ===== Winner =====');
  console.log(`[Hotspot] Selected: timeStatus=${winner.timeStatus}, events=${winner.eventCount}, specials=${winner.specialCount}, firstVenue=${winner.venues?.[0]?.venue}`);

  return sorted[0];
}

/**
 * Generate time-urgency tooltip text based on cluster content.
 * Accurately counts NOW vs TODAY events across all venues in the cluster.
 */
function generateTooltipText(cluster: Cluster): { text: string; subtext: string } {
  const venueName = cluster.venues?.[0]?.venue || 'this location';

  // Count NOW and TODAY events across all venues in the cluster
  let nowCount = 0;
  let todayCount = 0;

  for (const venue of (cluster.venues || [])) {
    for (const event of (venue.events || [])) {
      const eventIsNow = isEventNow(
        event.startDate,
        event.startTime,
        event.endDate,
        event.endTime
      );

      if (eventIsNow) {
        nowCount++;
      } else if (isEventHappeningToday(event)) {
        todayCount++;
      }
    }
  }

  const totalCount = nowCount + todayCount;

  // Get the first event to extract category details
  const firstEvent = cluster.venues?.[0]?.events?.[0];
  const category = firstEvent?.category || cluster.categories?.[0] || '';

  // Generate text based on NOW/TODAY split
  if (nowCount > 0) {
    // Has events happening now
    if (nowCount === 1 && todayCount === 0) {
      // Single NOW event, no TODAY events
      if (category) {
        return {
          text: `${category} happening now!`,
          subtext: `at ${venueName}`,
        };
      }
      return {
        text: 'Something happening now!',
        subtext: `at ${venueName}`,
      };
    }

    if (todayCount === 0) {
      // Multiple NOW events, no TODAY events
      return {
        text: `${nowCount} events live now!`,
        subtext: 'Tap to explore',
      };
    }

    // Mix of NOW and TODAY events: "X live now, Y later today"
    const nowText = nowCount === 1 ? '1 event now' : `${nowCount} events now`;
    const todayText = todayCount === 1 ? '1 later today' : `${todayCount} later today`;
    return {
      text: `${nowText}, ${todayText}`,
      subtext: 'Tap to explore',
    };
  }

  // No NOW events, only TODAY events
  if (todayCount > 0) {
    if (todayCount === 1 && category) {
      return {
        text: `${category} tonight`,
        subtext: `at ${venueName}`,
      };
    }
    return {
      text: `${todayCount} events happening today`,
      subtext: 'Tap to see what\'s on',
    };
  }

  // Future only
  return {
    text: `${totalCount || cluster.eventCount || 0} upcoming events`,
    subtext: `at ${venueName}`,
  };
}

export function useHotspotHighlight(): HotspotHighlightState & HotspotHighlightActions {
  const { user } = useAuth();
  const { isActive: tutorialIsActive } = useTutorial();
  const clusters = useMapStore((state) => state.clusters);
  const userLocation = useMapStore((state) => state.userLocation);

  const showDailyHotspot = useUserPrefsStore((state) => state.showDailyHotspot);
  const hotspotLastShownDate = useUserPrefsStore((state) => state.hotspotLastShownDate);
  const markHotspotShownToday = useUserPrefsStore((state) => state.markHotspotShownToday);
  const setShowDailyHotspot = useUserPrefsStore((state) => state.setShowDailyHotspot);
  const favoriteVenues = useUserPrefsStore((state) => state.favoriteVenues);
  const userInterests = useUserPrefsStore((state) => state.interests);

  // Internal state
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [targetCluster, setTargetCluster] = useState<Cluster | null>(null);

  // Store tooltip text - captured AFTER zoom completes to show accurate zoomed-in counts
  const [capturedTooltipText, setCapturedTooltipText] = useState('');
  const [capturedTooltipSubtext, setCapturedTooltipSubtext] = useState('');

  // Store the target coordinates to find the cluster after zoom
  const targetCoordsRef = useRef<{ longitude: number; latitude: number } | null>(null);

  // Store the hottest venue name to find the correct cluster after zoom
  const hottestVenueNameRef = useRef<string | null>(null);

  // Track original camera position for zoom-back
  const originalCameraRef = useRef<OriginalCameraPosition | null>(null);
  const hasTriggeredRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DEBUG: Set to true to force hotspot to show every time (ignores date check)
  const DEBUG_ALWAYS_SHOW = true; // TODO: Set to false before release

  // Calculate if we should show the hotspot
  const shouldShowHotspot = useMemo(() => {
    // 1. Tutorial not active
    if (tutorialIsActive) return false;

    // 2. User hasn't disabled it (for authenticated users)
    // Guests always see it (showDailyHotspot defaults to true)
    if (user && !showDailyHotspot) return false;

    // 3. Haven't shown today (skip check if DEBUG_ALWAYS_SHOW)
    if (!DEBUG_ALWAYS_SHOW) {
      const today = new Date().toISOString().split('T')[0];
      if (hotspotLastShownDate === today) return false;
    }

    // 4. Clusters are loaded
    if (!clusters || clusters.length === 0) return false;

    // 5. Haven't already triggered this session
    if (hasTriggeredRef.current) return false;

    return true;
  }, [tutorialIsActive, user, showDailyHotspot, hotspotLastShownDate, clusters]);

  // Tooltip text is now captured in triggerHotspot BEFORE zoom occurs
  // This avoids issues where cluster splits apart at higher zoom levels
  const tooltipText = capturedTooltipText;
  const tooltipSubtext = capturedTooltipSubtext;

  /**
   * Dismiss the hotspot and zoom back to original position
   */
  const dismiss = useCallback(() => {
    // Clear auto-dismiss timeout
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    setIsVisible(false);

    // Zoom back to original position
    const cameraRef = (global as any).mapCameraRef;
    if (cameraRef?.current && originalCameraRef.current) {
      const coords = originalCameraRef.current.coordinates;

      // Validate coordinates are valid numbers before zooming
      if (
        Array.isArray(coords) &&
        coords.length === 2 &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number' &&
        !isNaN(coords[0]) &&
        !isNaN(coords[1])
      ) {
        (global as any).ignoreProgrammaticCameraRef = true;

        cameraRef.current.setCamera({
          centerCoordinate: coords,
          zoomLevel: originalCameraRef.current.zoom,
          animationDuration: 800,
        });

        setTimeout(() => {
          (global as any).ignoreProgrammaticCameraRef = false;
        }, 900);
      }
    }

    // Track analytics
    amplitudeTrack('hotspot_dismissed', {
      auto_dismissed: dismissTimeoutRef.current === null,
    });
  }, []);

  /**
   * Trigger the hotspot animation sequence
   */
  const triggerHotspot = useCallback(async () => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    const hottest = findHottestCluster(clusters);
    if (!hottest) {
      return;
    }

    setTargetCluster(hottest);

    // Find the hottest venue within the cluster using additive scoring (matches handleMarkerPress)
    // Score = favoriteVenue(500) + interest(100) + time(10/5/1)
    const sortedVenues = hottest.venues ? sortVenuesByRelevance(hottest.venues, favoriteVenues, userInterests) : [];
    const hottestVenue = sortedVenues[0] || hottest.venues?.[0];

    if (hottestVenue && sortedVenues.length > 1) {
      const hotness = getVenueHotness(hottestVenue);
      const isFav = hottestVenue.locationKey ? favoriteVenues.includes(hottestVenue.locationKey) : false;
      console.log(`[Hotspot] Selected hottest venue: ${hottestVenue.venue} (fav=${isFav}, now=${hotness.nowCount}, today=${hotness.todayCount}, total=${hotness.total}) from ${hottest.venues?.length || 0} venues`);

      // DEBUG: Log all venues with their hotness scores for comparison
      console.log('[Hotspot] ===== All venues in cluster (sorted by relevance) =====');
      sortedVenues.forEach((v, idx) => {
        const vHot = getVenueHotness(v);
        const vIsFav = v.locationKey ? favoriteVenues.includes(v.locationKey) : false;
        console.log(`[Hotspot]   ${idx + 1}. ${v.venue}: fav=${vIsFav}, now=${vHot.nowCount}, today=${vHot.todayCount}, total=${vHot.total}`);
        // Log events at this venue
        (v.events || []).forEach((evt: any) => {
          const evtIsNow = isEventNow(evt.startDate, evt.startTime, evt.endDate, evt.endTime);
          console.log(`[Hotspot]      - "${evt.title}" (${evt.category}) | ${evt.startDate} ${evt.startTime}-${evt.endTime} | isNow=${evtIsNow}`);
        });
      });
    }

    // Store target coordinates and name of the hottest venue
    if (hottestVenue) {
      targetCoordsRef.current = {
        longitude: hottestVenue.longitude,
        latitude: hottestVenue.latitude,
      };
      hottestVenueNameRef.current = hottestVenue.venue;

      // DEBUG LOG 2: Log the 'hottest event' in the hottest venue
      const venueEvents = hottestVenue.events || [];
      // Find hottest event (NOW > TODAY > FUTURE)
      let hottestEvent: any = null;
      for (const evt of venueEvents) {
        const evtIsNow = isEventNow(evt.startDate, evt.startTime, evt.endDate, evt.endTime);
        if (evtIsNow) {
          hottestEvent = evt;
          break;
        }
        if (!hottestEvent) hottestEvent = evt;
      }
      if (hottestEvent) {
        console.log('[Hotspot] ===== Hottest Event =====');
        console.log(`[Hotspot] Hottest event: "${hottestEvent.title}" (${hottestEvent.category})`);
        console.log(`[Hotspot]   Venue: ${hottestVenue.venue}`);
        console.log(`[Hotspot]   Date: ${hottestEvent.startDate} ${hottestEvent.startTime}-${hottestEvent.endTime}`);
        const evtIsNow = isEventNow(hottestEvent.startDate, hottestEvent.startTime, hottestEvent.endDate, hottestEvent.endTime);
        console.log(`[Hotspot]   Is happening NOW: ${evtIsNow}`);
      }
    }

    // Get camera ref from global (same pattern as tutorial)
    const cameraRef = (global as any).mapCameraRef;
    if (!cameraRef?.current) {
      setIsVisible(true);
      markHotspotShownToday();
      return;
    }

    // Save original camera position
    try {
      const mapStore = useMapStore.getState();

      // Validate userLocation coordinates are actual numbers
      // userLocation is a Location.LocationObject, so coords are under .coords
      const hasValidUserLocation = userLocation &&
        userLocation.coords &&
        typeof userLocation.coords.longitude === 'number' &&
        typeof userLocation.coords.latitude === 'number' &&
        !isNaN(userLocation.coords.longitude) &&
        !isNaN(userLocation.coords.latitude);

      const coordinates: [number, number] = hasValidUserLocation
        ? [userLocation.coords.longitude, userLocation.coords.latitude]
        : [-63.1276, 46.2336]; // Default to Halifax/PEI area

      originalCameraRef.current = {
        coordinates,
        zoom: mapStore?.zoomLevel || 12,
      };

    } catch (e) {
      // Set fallback so we don't crash on zoom-back
      originalCameraRef.current = {
        coordinates: [-63.1276, 46.2336],
        zoom: 12,
      };
    }

    // Zoom to the hottest venue (not just first venue)
    if (hottestVenue) {
      setIsAnimating(true);

      // Set flag to prevent cluster regeneration during zoom (same as tutorial)
      (global as any).ignoreProgrammaticCameraRef = true;

      cameraRef.current.setCamera({
        centerCoordinate: [hottestVenue.longitude, hottestVenue.latitude],
        zoomLevel: 14.4, // Same zoom as tutorial for consistency
        animationDuration: 1000,
      });

      // Wait for camera animation, then find cluster at zoomed level and show tooltip
      setTimeout(() => {
        (global as any).ignoreProgrammaticCameraRef = false;
        setIsAnimating(false);

        // Find the cluster that contains the original hottest venue by name
        // This ensures we highlight the correct cluster even after splitting at higher zoom
        const currentClusters = useMapStore.getState().clusters;
        let zoomedCluster: Cluster | null = null;

        if (hottestVenueNameRef.current && currentClusters.length > 0) {
          const targetVenueName = hottestVenueNameRef.current;

          // Find the cluster containing the original hottest venue
          for (const c of currentClusters) {
            const hasVenue = c.venues?.some(v => v.venue === targetVenueName);
            if (hasVenue) {
              zoomedCluster = c;
              console.log(`[Hotspot] Found cluster containing "${targetVenueName}" with ${c.venues?.length} venues`);
              break;
            }
          }

          // Fallback: if venue not found (shouldn't happen), use distance-based search
          if (!zoomedCluster && targetCoordsRef.current) {
            console.log(`[Hotspot] Warning: Could not find cluster containing "${targetVenueName}", falling back to distance search`);
            const targetLon = targetCoordsRef.current.longitude;
            const targetLat = targetCoordsRef.current.latitude;
            let minDist = Infinity;
            for (const c of currentClusters) {
              const venue = c.venues?.[0];
              if (venue) {
                const dist = Math.sqrt(
                  Math.pow(venue.longitude - targetLon, 2) +
                  Math.pow(venue.latitude - targetLat, 2)
                );
                if (dist < minDist) {
                  minDist = dist;
                  zoomedCluster = c;
                }
              }
            }
          }
        }

        // Generate tooltip from the zoomed-in cluster (or fall back to original)
        const clusterForTooltip = zoomedCluster || hottest;
        const { text, subtext } = generateTooltipText(clusterForTooltip);
        setCapturedTooltipText(text);
        setCapturedTooltipSubtext(subtext);

        // DEBUG LOG 1: Log the actual tooltip text
        console.log('[Hotspot] ===== Tooltip Text =====');
        console.log(`[Hotspot] Tooltip: "${text}" / "${subtext}"`);

        // DEBUG LOG 3: Log the cluster after zooming in
        console.log('[Hotspot] ===== Cluster after zoom (used for tooltip) =====');
        console.log(`[Hotspot] Zoomed cluster: timeStatus=${clusterForTooltip.timeStatus}, events=${clusterForTooltip.eventCount}, venues=${clusterForTooltip.venues?.length}`);
        clusterForTooltip.venues?.forEach((v, idx) => {
          console.log(`[Hotspot]   Venue ${idx + 1}: ${v.venue} (${v.events?.length || 0} events)`);
          (v.events || []).forEach((evt: any) => {
            console.log(`[Hotspot]      - "${evt.title}" (${evt.category})`);
          });
        });

        // Update targetCluster to the zoomed one for correct timeStatus coloring
        if (zoomedCluster) {
          setTargetCluster(zoomedCluster);

          // Update targetCoordsRef to the cluster's centroid position
          // This ensures the highlight circle is positioned over the cluster marker,
          // not the original venue coordinates (clusters use centroid of their venues)
          if (zoomedCluster.venues && zoomedCluster.venues.length > 0) {
            let sumLat = 0;
            let sumLon = 0;
            for (const v of zoomedCluster.venues) {
              sumLat += v.latitude;
              sumLon += v.longitude;
            }
            const centroidLat = sumLat / zoomedCluster.venues.length;
            const centroidLon = sumLon / zoomedCluster.venues.length;

            targetCoordsRef.current = {
              latitude: centroidLat,
              longitude: centroidLon,
            };

            console.log(`[Hotspot] Updated targetCoords to cluster centroid: lat=${centroidLat.toFixed(6)}, lon=${centroidLon.toFixed(6)}`);
          }
        }

        setIsVisible(true);
        markHotspotShownToday();

        // Track analytics
        amplitudeTrack('hotspot_shown', {
          cluster_id: clusterForTooltip.id,
          time_status: clusterForTooltip.timeStatus,
          event_count: clusterForTooltip.eventCount,
          special_count: clusterForTooltip.specialCount,
          venue_name: clusterForTooltip.venues?.[0]?.venue || 'unknown',
        });

        // Auto-dismiss after 10 seconds (increased from 5 for better readability)
        dismissTimeoutRef.current = setTimeout(() => {
          dismiss();
        }, 10000);
      }, 1100);
    }
  }, [clusters, userLocation, markHotspotShownToday, dismiss]);

  /**
   * Disable hotspot permanently (user clicked "Don't show again")
   */
  const disablePermanently = useCallback(async () => {
    // Update local state immediately
    setShowDailyHotspot(false);

    // Persist to Firestore if user is authenticated
    if (user?.uid) {
      try {
        await updateShowDailyHotspot(user.uid, false);
      } catch (e) {
        console.log('[Hotspot] Failed to persist setting:', e);
      }
    }

    // Dismiss the current hotspot
    dismiss();

    // Track analytics
    amplitudeTrack('hotspot_disabled', {
      source: 'tooltip',
    });
  }, [user, setShowDailyHotspot, dismiss]);

  /**
   * Handle tap on the tooltip (opens cluster callout like normal cluster tap)
   */
  const onClusterTap = useCallback(() => {
    // Clear auto-dismiss
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    setIsVisible(false);

    // Open the cluster callout by selecting it in the store
    // Need to call selectVenues, selectVenue, and selectCluster (same as handleClusterPress in map.tsx)
    if (targetCluster && targetCluster.venues && targetCluster.venues.length > 0) {
      const { selectCluster, selectVenues, selectVenue } = useMapStore.getState();

      // Sort venues by additive relevance score (matches handleMarkerPress)
      // Score = favoriteVenue(500) + interest(100) + time(10/5/1)
      const sortedVenues = sortVenuesByRelevance(targetCluster.venues, favoriteVenues, userInterests);

      // DEBUG LOG 4: Log which venue is selected when cluster opens (via tooltip tap)
      console.log('[Hotspot] ===== Cluster opened via tooltip tap =====');
      console.log(`[Hotspot] Target cluster: timeStatus=${targetCluster.timeStatus}, venues=${targetCluster.venues.length}`);
      const selectedHotness = getVenueHotness(sortedVenues[0]);
      console.log(`[Hotspot] Hottest venue (will be selected): ${sortedVenues[0]?.venue} (now=${selectedHotness.nowCount}, today=${selectedHotness.todayCount}, total=${selectedHotness.total})`);
      sortedVenues.forEach((v, idx) => {
        const vHot = getVenueHotness(v);
        console.log(`[Hotspot]   Venue ${idx + 1}: ${v.venue} (now=${vHot.nowCount}, today=${vHot.todayCount}, total=${vHot.total})`);
      });

      // Select venues with hottest first
      selectVenues(sortedVenues);

      // Select the hottest venue as primary
      selectVenue(sortedVenues[0]);

      // Select the cluster itself for multi-venue clusters
      if (targetCluster.clusterType === 'multi') {
        selectCluster(targetCluster);
      } else {
        selectCluster(null);
      }

    }

    // Don't zoom back - let them explore the cluster

    // Track analytics
    amplitudeTrack('hotspot_cluster_tapped', {
      cluster_id: targetCluster?.id,
    });
  }, [targetCluster]);

  // Trigger hotspot when conditions are met
  useEffect(() => {
    if (shouldShowHotspot && clusters.length > 0) {
      // Small delay to let map settle after initial load
      const timer = setTimeout(() => {
        triggerHotspot();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [shouldShowHotspot, clusters.length, triggerHotspot]);

  // Watch for cluster selection on the map (user tapped a cluster directly)
  // When this happens, hide the hotspot tooltip without zooming back
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  useEffect(() => {
    // If hotspot is visible and user selected venues (tapped a cluster), hide the tooltip
    if (isVisible && selectedVenues && selectedVenues.length > 0) {

      // Clear auto-dismiss timeout
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }

      setIsVisible(false);
      // Don't zoom back - user is exploring the cluster they tapped
    }
  }, [selectedVenues, isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  return {
    shouldShow: isVisible,
    targetCluster,
    tooltipText,
    tooltipSubtext,
    isAnimating,
    targetCoordinates: targetCoordsRef.current,
    dismiss,
    disablePermanently,
    onClusterTap,
  };
}
