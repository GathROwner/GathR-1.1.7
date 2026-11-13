import type { Event } from '../types/events';
import { createLocationKeyFromEvent } from './priorityUtils';
import { getEventScheduleStartLocalScalar } from './eventTiming';
import { isScopedLocationEvent } from './locationScope';

export type VenueFeedGroup = { key: string; events: Event[] };

type VenueMembers = Map<string, Event>;

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

/**
 * One index per filtered-input snapshot. Ranking still determines venue positions;
 * pagination changes only which complete chronological groups are materialized.
 * Ranked inputs must come from their corresponding filtered collection.
 */
export function createVenueFeedGrouping(viewport: readonly Event[], outside: readonly Event[]) {
  const keys = new WeakMap<Event, string>();
  const starts = new WeakMap<Event, number>();
  const sortedGroups = new WeakMap<VenueMembers, VenueFeedGroup>();
  const getKey = (event: Event) => {
    let key = keys.get(event);
    if (key === undefined) {
      key = getVenueFeedKey(event);
      keys.set(event, key);
    }
    return key;
  };
  const index = (records: readonly Event[]) => {
    const groups = new Map<string, VenueMembers>();
    for (const event of records) {
      const key = getKey(event);
      let members = groups.get(key);
      if (!members) {
        members = new Map();
        groups.set(key, members);
      }
      members.set(String(event.id), event);
    }
    return groups;
  };
  const allMembers = index([...viewport, ...outside]);
  const outsideMembers = index(outside);
  const getStart = (event: Event) => {
    let start = starts.get(event);
    if (start === undefined) {
      start = getEventScheduleStartLocalScalar(event);
      starts.set(event, start);
    }
    return start;
  };
  const materialize = (key: string, members: VenueMembers): VenueFeedGroup => {
    const cached = sortedGroups.get(members);
    if (cached) return cached;
    const events = [...members.values()];
    events.sort((a, b) => {
      const aStart = getStart(a);
      const bStart = getStart(b);
      return (Number.isFinite(aStart) ? aStart : Infinity) - (Number.isFinite(bStart) ? bStart : Infinity) ||
        String(a.id).localeCompare(String(b.id));
    });
    const group = { key, events };
    sortedGroups.set(members, group);
    return group;
  };

  return {
    groupViewport(ranked: readonly Event[]): VenueFeedGroup[] {
      // The ranked viewport has final precedence over matching siblings with a
      // duplicate ID. Clone only affected membership maps; never mutate the index.
      const overrides = new Map<string, VenueMembers>();
      for (const event of ranked) {
        const key = getKey(event);
        const members = overrides.get(key) || allMembers.get(key)!;
        if (members.get(String(event.id)) !== event) {
          if (!overrides.has(key)) overrides.set(key, new Map(members));
          overrides.get(key)!.set(String(event.id), event);
        }
      }
      const seen = new Set<string>();
      const groups: VenueFeedGroup[] = [];
      for (const event of ranked) {
        const key = getKey(event);
        if (seen.has(key)) continue;
        seen.add(key);
        groups.push(materialize(key, overrides.get(key) || allMembers.get(key)!));
      }
      return groups;
    },

    groupOutside(rankedPrefix: readonly Event[], viewportGroups: readonly VenueFeedGroup[], limit: number) {
      const seen = new Set(viewportGroups.map(group => group.key));
      const orderedKeys: string[] = [];
      // Keep the current partial ranking exactly: ranked prefix, then remaining
      // filtered records in source order. The full outside input wins duplicate IDs.
      for (const event of [...rankedPrefix, ...outside]) {
        const key = getKey(event);
        if (seen.has(key)) continue;
        seen.add(key);
        orderedKeys.push(key);
      }
      return {
        totalCount: orderedKeys.length,
        groups: orderedKeys.slice(0, limit).map(key => materialize(key, outsideMembers.get(key)!)),
      };
    },
  };
}
