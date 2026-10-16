import React from 'react';
import type { Event } from '../../types/events';
import { getVenueProgrammeLocation } from '../../utils/eventProgramme';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';
import type AreaLocationBrowserComponent from '../map/AreaLocationBrowser';
import type { AreaActivityLoader } from '../../hooks/useAreaActivities';

/** The shared programme sheet, adapted internally without manufacturing an area event. */
export default function VenueProgrammeBrowser({ event, onClose, loadActivity }: {
  event: Event; onClose: () => void; loadActivity?: AreaActivityLoader;
}) {
  const minute = useEventTimingMinute();
  const location = getVenueProgrammeLocation(event, new Date(minute * 60000));
  if (!location) return null;
  // Synchronous on-demand loading breaks lightbox -> browser -> child-lightbox module initialization cycles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AreaLocationBrowser: typeof AreaLocationBrowserComponent = require('../map/AreaLocationBrowser').default;
  return <AreaLocationBrowser umbrella={event} venueProgramme group={{ id: location.id, coordinates: location.coordinates, locations: [location] }}
    onClose={onClose} loadActivity={loadActivity} />;
}
