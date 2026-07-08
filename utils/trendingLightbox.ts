import type { Cluster, Event, Venue } from '../types/events';
import { useMapStore } from '../store/mapStore';
import { useClusterInteractionStore } from '../store/clusterInteractionStore';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { getEventHotEngagementScore } from './hotInterestCarouselUtils';

export type TrendingEventContext = {
  venue?: Venue;
  cluster?: Cluster;
};

// Venue/cluster context for a single event. Clusters can lag behind
// onScreenEvents during startup, so callers must tolerate an empty result —
// the lightbox's "View Venue" button already no-ops without venue context.
export const resolveTrendingEventContext = (
  clusters: Cluster[],
  eventId: string | number
): TrendingEventContext => {
  const key = String(eventId);
  for (const cluster of clusters) {
    for (const venue of cluster.venues) {
      if (venue.events.some((event) => String(event.id) === key)) {
        return { venue, cluster };
      }
    }
  }
  return {};
};

export const getTrendingLightboxImageUrl = (event: Event): string =>
  event.imageUrl || event.SharedPostThumbnail || '';

// Opens the global lightbox (hosted by GlobalEventLightbox in map.tsx) on the
// most trending event with swipe navigation through the full list.
export function openTrendingLightbox(events: Event[], openedBy: 'manual' | 'auto'): void {
  if (!events || events.length === 0) {
    return;
  }

  const mapState = useMapStore.getState();
  const topEvent = events[0];
  const { venue, cluster } = resolveTrendingEventContext(mapState.clusters, topEvent.id);

  // Event-level viewed tracking keeps the pill's red "new content" dot honest.
  useClusterInteractionStore.getState().markCarouselEventViewed(topEvent.id);

  amplitudeTrack('trending_opened', {
    source: openedBy,
    event_count: events.length,
    top_event_id: String(topEvent.id),
    top_event_engagement: getEventHotEngagementScore(topEvent),
  });

  mapState.setSelectedImageData({
    imageUrl: getTrendingLightboxImageUrl(topEvent),
    event: topEvent,
    venue,
    cluster,
    events,
    currentIndex: 0,
    source: openedBy === 'auto' ? 'trending_auto' : 'trending_manual',
  });
}
