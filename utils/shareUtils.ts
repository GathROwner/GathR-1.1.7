import { Event } from '../types/events';
import { formatEventDateTime } from './dateUtils';

export const GATHR_WEB_BASE_URL = 'https://link.gathrapp.ca';
export const DEFAULT_SHARE_DESCRIPTION_MAX_CHARS = 140;

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

function normalizeWhitespace(value?: string | null): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function truncateShareDescription(
  value?: string | null,
  maxChars: number = DEFAULT_SHARE_DESCRIPTION_MAX_CHARS
): string {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, Math.max(0, maxChars - 1));
  const safeSlice = slice.replace(/\s+\S*$/, '').trim() || slice.trim();
  return `${safeSlice}…`;
}

export function buildGathrShareMessage(
  event: Event,
  options?: {
    maxDescriptionChars?: number;
  }
): string {
  return 'Check this out on GathR';
}

export function buildGathrSharePayload(
  event: Event,
  options?: {
    maxDescriptionChars?: number;
  }
): { title: string; message: string; url: string } {
  const title = normalizeWhitespace(event.title) || 'GathR';
  const url = buildGathrShareUrl(event);

  return {
    title,
    message: buildGathrShareMessage(event, options),
    url,
  };
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
