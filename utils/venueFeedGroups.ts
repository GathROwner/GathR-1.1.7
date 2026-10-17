import type { Event } from '../types/events';
import { createLocationKeyFromEvent } from './priorityUtils';
import { getEventScheduleStartLocalScalar } from './eventTiming';
import { isScopedLocationEvent } from './locationScope';

export type VenueFeedGroup = { key: string; events: Event[] };

/** Physical venue identity, not just a brand name. Private and broad-location events stay separate. */
export function getVenueFeedKey(event: Event): string {
  if (event.friendEvent || isScopedLocationEvent(event) || event.mapMode === 'none' || !event.venue?.trim() ||
      (!event.address?.trim() && (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)))) {
    return `${event.type}:event:${event.id}`;
  }
  return `${event.type}:venue:${createLocationKeyFromEvent(event)}`;
}

/** Inputs must already match every active filter. Ranking positions venues; schedule time orders their pages. */
export function groupVenueFeedEvents(ranked: readonly Event[], matching: readonly Event[] = ranked): VenueFeedGroup[] {
  const members = new Map<string, Map<string, Event>>();
  for (const event of [...matching, ...ranked]) {
    const key = getVenueFeedKey(event);
    if (!members.has(key)) members.set(key, new Map());
    members.get(key)!.set(String(event.id), event);
  }
  const result: VenueFeedGroup[] = [];
  const seen = new Set<string>();
  for (const event of ranked) {
    const key = getVenueFeedKey(event);
    if (seen.has(key)) continue;
    seen.add(key);
    const events = [...members.get(key)!.values()];
    events.sort((a, b) => {
      const aStart = getEventScheduleStartLocalScalar(a);
      const bStart = getEventScheduleStartLocalScalar(b);
      return (Number.isFinite(aStart) ? aStart : Infinity) - (Number.isFinite(bStart) ? bStart : Infinity) ||
        String(a.id).localeCompare(String(b.id));
    });
    result.push({ key, events });
  }
  return result;
}
