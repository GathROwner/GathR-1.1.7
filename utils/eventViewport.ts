import type { Event } from '../types/events';
import { isProvinceScopeEvent, isScopedLocationEvent } from './locationScope';

export type ViewportBoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type EventViewportMembership = {
  hasPhysicalCoordinates: boolean;
  includeInViewport: boolean;
  includeInClusterSource: boolean;
  includeOutsideViewport: boolean;
};

const hasUsableCoordinates = (event: Event): boolean => {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0);
};

const isInsideBoundingBox = (
  event: Event,
  boundingBox: ViewportBoundingBox
): boolean => {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  return latitude >= boundingBox.south
    && latitude <= boundingBox.north
    && longitude >= boundingBox.west
    && longitude <= boundingBox.east;
};

/**
 * Province records cover the entire current GathR market. They belong in the
 * discovery feed and Area experience for every PEI viewport, but their backend
 * reference coordinate is not a physical destination and must never drive a
 * marker, distance, or directions action.
 */
export const getEventViewportMembership = (
  event: Event,
  viewport: ViewportBoundingBox,
  clusterSourceViewport: ViewportBoundingBox
): EventViewportMembership => {
  if (isProvinceScopeEvent(event)) {
    return {
      hasPhysicalCoordinates: false,
      includeInViewport: true,
      includeInClusterSource: true,
      includeOutsideViewport: false,
    };
  }

  if (!hasUsableCoordinates(event)) {
    return {
      hasPhysicalCoordinates: false,
      includeInViewport: false,
      includeInClusterSource: false,
      includeOutsideViewport: isScopedLocationEvent(event),
    };
  }

  const includeInViewport = isInsideBoundingBox(event, viewport);
  return {
    hasPhysicalCoordinates: true,
    includeInViewport,
    includeInClusterSource: isInsideBoundingBox(event, clusterSourceViewport),
    includeOutsideViewport: !includeInViewport,
  };
};
