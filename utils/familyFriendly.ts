import type { Event } from '../types/events';

export const FAMILY_FRIENDLY_INTEREST = 'Family Friendly';
export const FAMILY_FRIENDLY_LIKELY_THRESHOLD = 60;

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();

export const isFamilyFriendlyInterest = (value: unknown): boolean =>
  normalize(value) === normalize(FAMILY_FRIENDLY_INTEREST);

export const isFamilyFriendlyEvent = (
  event: Pick<Event, 'category' | 'familyFriendlyScore'>
): boolean => {
  const rawScore = event.familyFriendlyScore;
  if (rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore))) {
    return Number(rawScore) >= FAMILY_FRIENDLY_LIKELY_THRESHOLD;
  }

  // Rolling-deploy and pre-backfill compatibility. Once a score exists, it is
  // authoritative even when an old document still has the legacy category.
  return isFamilyFriendlyInterest(event.category);
};

export const doesEventMatchCategoryOrFacet = (
  event: Pick<Event, 'category' | 'familyFriendlyScore'>,
  categoryOrFacet: unknown
): boolean => {
  if (isFamilyFriendlyInterest(categoryOrFacet)) {
    return isFamilyFriendlyEvent(event);
  }
  return normalize(event.category) === normalize(categoryOrFacet);
};

export const doesEventMatchAnyInterest = (
  event: Pick<Event, 'category' | 'familyFriendlyScore'>,
  interests: Iterable<string>
): boolean => {
  for (const interest of interests) {
    if (doesEventMatchCategoryOrFacet(event, interest)) return true;
  }
  return false;
};

export const getEventFacetKeys = (
  event: Pick<Event, 'category' | 'familyFriendlyScore'>
): string[] => {
  if (isFamilyFriendlyInterest(event.category)) {
    return isFamilyFriendlyEvent(event) ? [FAMILY_FRIENDLY_INTEREST] : [];
  }
  const keys = [event.category];
  if (isFamilyFriendlyEvent(event)) {
    keys.push(FAMILY_FRIENDLY_INTEREST);
  }
  return keys;
};
