import type { Event } from '../types/events';
import type { MapState } from '../types/store';
import { getLightboxImageUrl } from './lightboxImageUrl';
import { hasDrawableRoute } from './routeEvent';

export type RouteSummaryLightboxSelection = NonNullable<MapState['selectedImageData']>;

export const buildRouteSummaryLightboxSelection = (
  event: Event | null | undefined
): RouteSummaryLightboxSelection | null => {
  if (!event || !hasDrawableRoute(event)) {
    return null;
  }

  return {
    imageUrl: getLightboxImageUrl(event),
    event,
    source: 'route_summary',
  };
};
