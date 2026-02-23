import { Event } from '../types/events';

export const GATHR_WEB_BASE_URL = 'https://link.gathrapp.ca';

/**
 * Build a deep link URL for sharing an event
 * Uses clean path-based URLs that work with Universal Links (iOS) and App Links (Android)
 *
 * Example outputs:
 * - https://link.gathrapp.ca/event/12345
 * - https://link.gathrapp.ca/special/67890
 */
export function buildGathrShareUrl(event: Event): string {
  const type = event.type === 'special' ? 'special' : 'event';
  const eventId = String(event.id ?? '');
  return `${GATHR_WEB_BASE_URL}/${type}/${eventId}`;
}

/**
 * Legacy URL builder for backward compatibility
 * Uses query parameters instead of path segments
 * @deprecated Use buildGathrShareUrl instead
 */
export function buildGathrShareUrlLegacy(event: Event): string {
  const params = new URLSearchParams({
    eventId: String(event.id ?? ''),
    type: event.type,
  });
  return `${GATHR_WEB_BASE_URL}?${params.toString()}`;
}
