import type { Event, Venue } from '../types/events';
import { TimeFilterType, type TypeFilterCriteria } from '../types/filter';
import { getAreaLocations, getAreaLinkedEventIds, getAvailableAreaLinkedEvents } from './areaEvent';
import { getAreaEventPresentation } from './areaEventPresentation';
import { toFirestoreEventId } from './firestoreEventIds';
import { addDaysToDateKey, formatLocalDateKey, getEventDateKey, isEventPast } from './eventExpiry';
import { getUpcomingDateWindow } from './upcomingDateWindow';
import { getEventOriginalSourceUrl, isOriginalEventSourceUrl } from './eventSourceUrl';
import { getVenueProgrammeLocation } from './eventProgramme';

export type MembershipRecord = { event: Event; checkedAt: number };
export type AreaMembership = { parent: Event; checkedAt: number; venueId: string; childId?: string; childEvent?: Event; kind: 'programme' | 'hunt' };
export const isPublicMembershipEvent = (event: Event) => !event.friendEvent
  && !['private_shared', 'friend_event'].includes(event.source || '');
const terminal = (event: Event) => event.isCancelled || event.isExpired
  || ['cancelled', 'canceled', 'deleted', 'expired'].includes(String(event.status || '').trim().toLowerCase());
const currentRoot = (event: Event, now: Date) => !terminal(event) && !isEventPast(event, now);
const pairKey = (child: string | number, venue: string) => JSON.stringify([toFirestoreEventId(child), venue]);
const rootKey = (membership: AreaMembership) => toFirestoreEventId(membership.parent.id);
const sorted = (memberships: AreaMembership[]) => [...new Map(memberships.map(item => [rootKey(item), item])).values()]
  .sort((a, b) => a.parent.startDate.localeCompare(b.parent.startDate)
    || a.parent.title.localeCompare(b.parent.title) || rootKey(a).localeCompare(rootKey(b)));

/** A physical venue needs one unambiguous canonical public owner; never match its name/address. */
export function getMembershipVenueId(venue: Venue): string | null {
  const publicEvents = venue.events.filter(isPublicMembershipEvent);
  if (!publicEvents.length || publicEvents.some(event => !event.venueId?.trim())) return null;
  const ids = new Set(publicEvents.map(event => event.venueId!.trim()));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Association dates overlap the selected calendar window; unknown hours never imply NOW. */
export function huntMatchesDates(parent: Event, filters: TypeFilterCriteria, now: Date): boolean {
  if (!currentRoot(parent, now)) return false;
  const today = formatLocalDateKey(now);
  let start = today, end = today;
  if (filters.timeFilter === TimeFilterType.ALL) return true;
  if (filters.timeFilter === TimeFilterType.TOMORROW) start = end = addDaysToDateKey(today, 1);
  if (filters.timeFilter === TimeFilterType.UPCOMING) {
    const window = getUpcomingDateWindow(filters.upcomingDate, today);
    start = window?.startDate || addDaysToDateKey(today, 1); end = window?.endDate || '9999-12-31';
  }
  return getEventDateKey(parent.startDate) <= end && getEventDateKey(parent.endDate || parent.startDate) >= start;
}

/** Build once per data snapshot. These are relationships, never added event occurrences. */
export function buildAreaMembershipIndex(records: Map<string, MembershipRecord>, unavailable = new Set<string>()) {
  const byChild = new Map<string, AreaMembership[]>(), byVenue = new Map<string, AreaMembership[]>();
  for (const record of records.values()) {
    const root = record.event;
    const venueProgramme = getVenueProgrammeLocation(root);
    if (unavailable.has(toFirestoreEventId(root.id)) || !isPublicMembershipEvent(root) || root.type !== 'event'
      || (root.locationScope !== 'area' && !venueProgramme) || terminal(root) || !root.title?.trim()
      || (!venueProgramme && (!Array.isArray(root.areaData?.locations) || root.areaData.locations.some(location => !location || typeof location !== 'object')))
      || typeof root.startDate !== 'string' || typeof (root.endDate || root.startDate) !== 'string'
      || !getEventDateKey(root.startDate) || !getEventDateKey(root.endDate || root.startDate)
      || root.endDate < root.startDate
      || ![root.programmeData?.sourceUrl, root.areaData?.sourceUrl, getEventOriginalSourceUrl(root)].some(url => typeof url === 'string' && isOriginalEventSourceUrl(url))) continue;
    const hunt = !venueProgramme && getAreaEventPresentation(root) === 'hunt';
    for (const location of venueProgramme ? [venueProgramme] : getAreaLocations(root)) {
      const venueId = location.venueId?.trim();
      if (location.certainty !== 'confirmed' || !venueId) continue;
      const base: AreaMembership = { parent: root, checkedAt: record.checkedAt, venueId, kind: hunt ? 'hunt' : 'programme' };
      for (const childId of getAreaLinkedEventIds(location)) {
        const key = pairKey(childId, venueId);
        byChild.set(key, [...(byChild.get(key) || []), { ...base, childId, kind: 'programme' }]);
      }
      if (hunt) byVenue.set(venueId, [...(byVenue.get(venueId) || []), base]);
    }
  }
  return {
    records, unavailable,
    forEvent(event: Event, now = new Date()): AreaMembership[] {
      const id = toFirestoreEventId(event.id);
      if (unavailable.has(id)) return [];
      const child = records.get(id)?.event || event;
      if (!isPublicMembershipEvent(event) || !isPublicMembershipEvent(child) || event.type !== 'event'
        || child.type !== 'event' || !child.venueId || event.venueId !== child.venueId) return [];
      return sorted((byChild.get(pairKey(id, child.venueId)) || []).filter(item => currentRoot(item.parent, now)
        && (item.parent.locationScope === 'venue' ? [getVenueProgrammeLocation(item.parent, now)].filter((point): point is NonNullable<typeof point> => !!point) : getAreaLocations(item.parent)).some(location => location.venueId === child.venueId
          && getAvailableAreaLinkedEvents(item.parent, location, [child], now).length > 0
          && getAvailableAreaLinkedEvents(item.parent, location, [event], now).length > 0))).map(item => ({ ...item, childEvent: child }));
    },
    forVenue(venueId: string | null, filters: TypeFilterCriteria, now = new Date()): AreaMembership[] {
      return venueId ? sorted((byVenue.get(venueId) || []).filter(item => huntMatchesDates(item.parent, filters, now))) : [];
    },
  };
}
export type AreaMembershipIndex = ReturnType<typeof buildAreaMembershipIndex>;
