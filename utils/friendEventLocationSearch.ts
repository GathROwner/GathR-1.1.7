import type { FriendEventLocationSuggestion } from '../types/social';

export interface GathrVenueSearchCandidate {
  venueId: string;
  name: string;
  address: string;
}

export interface UnifiedFriendEventLocationSuggestion {
  id: string;
  source: 'gathr' | 'mapbox';
  venueId: string;
  mapboxId: string;
  primaryText: string;
  secondaryText: string;
  fullAddress: string;
  featureType: string;
}

export function normalizeLocationSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function venueMatchScore(venue: GathrVenueSearchCandidate, normalizedQuery: string): number {
  const name = normalizeLocationSearchText(venue.name);
  const address = normalizeLocationSearchText(venue.address);
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  if (name === normalizedQuery) return 100;
  if (name.startsWith(normalizedQuery)) return 95;
  if (name.split(' ').some((word) => word.startsWith(normalizedQuery))) return 88;
  if (name.includes(normalizedQuery)) return 82;
  if (queryTokens.length > 1 && queryTokens.every((token) => name.includes(token))) return 76;
  if (address.startsWith(normalizedQuery)) return 55;
  if (address.includes(normalizedQuery)) return 48;
  if (queryTokens.length > 1 && queryTokens.every((token) => `${name} ${address}`.includes(token))) {
    return 42;
  }
  return 0;
}

export function rankGathrVenueSuggestions(
  venues: GathrVenueSearchCandidate[],
  query: string,
  limit = 5
): UnifiedFriendEventLocationSuggestion[] {
  const normalizedQuery = normalizeLocationSearchText(query);
  if (normalizedQuery.length < 2) return [];
  return venues
    .map((venue) => ({ venue, score: venueMatchScore(venue, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.venue.name.localeCompare(right.venue.name))
    .slice(0, limit)
    .map(({ venue }) => ({
      id: `gathr:${venue.venueId}`,
      source: 'gathr' as const,
      venueId: venue.venueId,
      mapboxId: '',
      primaryText: venue.name,
      secondaryText: venue.address,
      fullAddress: venue.address,
      featureType: 'gathr_venue',
    }));
}

export function mergeLocationSuggestions(
  gathrSuggestions: UnifiedFriendEventLocationSuggestion[],
  mapboxSuggestions: FriendEventLocationSuggestion[],
  limit = 5
): UnifiedFriendEventLocationSuggestion[] {
  const merged = [...gathrSuggestions];
  const knownNames = new Set(
    gathrSuggestions.map((suggestion) => normalizeLocationSearchText(suggestion.primaryText))
  );
  const knownRows = new Set(
    gathrSuggestions.map((suggestion) => normalizeLocationSearchText(
      `${suggestion.primaryText} ${suggestion.fullAddress}`
    ))
  );
  for (const suggestion of mapboxSuggestions) {
    const normalizedName = normalizeLocationSearchText(suggestion.primaryText);
    const normalizedRow = normalizeLocationSearchText(
      `${suggestion.primaryText} ${suggestion.fullAddress}`
    );
    if (knownNames.has(normalizedName) || knownRows.has(normalizedRow)) continue;
    merged.push({
      ...suggestion,
      source: 'mapbox',
      venueId: '',
    });
    if (merged.length >= limit) break;
  }
  return merged.slice(0, limit);
}
