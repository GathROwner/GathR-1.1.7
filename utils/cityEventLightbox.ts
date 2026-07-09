import type { Event } from '../types/events';
import { useClusterInteractionStore } from '../store/clusterInteractionStore';
import { useMapStore } from '../store/mapStore';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import {
  getTrendingLightboxImageUrl,
  resolveTrendingEventContext,
} from './trendingLightbox';

export { buildCityEventLightboxEvents } from './cityEventLightboxEvents';

type OpenCityEventLightboxParams = {
  events: Event[];
  startIndex?: number;
  openedBy: 'pill' | 'marker' | 'carousel_card';
  calloutUnderlay?: boolean;
};

export const openCityEventLightbox = ({
  events,
  startIndex = 0,
  openedBy,
  calloutUnderlay = false,
}: OpenCityEventLightboxParams): boolean => {
  if (!events.length) {
    return false;
  }

  const safeIndex = Math.min(Math.max(startIndex, 0), events.length - 1);
  const event = events[safeIndex];
  const mapState = useMapStore.getState();
  const { venue, cluster } = resolveTrendingEventContext(mapState.clusters, event.id);

  useClusterInteractionStore.getState().markCarouselEventViewed(event.id);

  amplitudeTrack('city_event_lightbox_opened', {
    source: openedBy,
    event_id: String(event.id),
    event_count: events.length,
    location_label: event.locationLabel || event.locationCity || '',
    callout_underlay: calloutUnderlay,
  });

  mapState.setSelectedImageData({
    imageUrl: getTrendingLightboxImageUrl(event),
    event,
    venue,
    cluster,
    events: events.length > 1 ? events : undefined,
    currentIndex: events.length > 1 ? safeIndex : undefined,
    source: 'city_event_marker',
  });

  return true;
};
