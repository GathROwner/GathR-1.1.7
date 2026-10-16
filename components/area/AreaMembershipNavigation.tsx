import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { Event } from '../../types/events';
import { useMapStore } from '../../store/mapStore';
import { useEventTimingMinute } from '../../hooks/useEventTimingMinute';
import { areaMembershipRootKey, getAreaMembershipSnapshot, useAreaMembershipIndex } from '../../hooks/useAreaMembershipIndex';
import { AREA_ACTIVITY_FRESH_MS, type AreaActivityEntry } from '../../utils/areaActivityCache';
import { toFirestoreEventId } from '../../utils/firestoreEventIds';
import type { AreaMembership } from '../../utils/areaMembership';
import { fetchFirestoreMembershipRoot } from '../../lib/api/firestoreEvents';
import { getLightboxImageUrl } from '../../utils/lightboxImageUrl';
import EventImageLightbox from '../map/EventImageLightbox';

type Request = { parentId: string; childId?: string; childEvent?: Event; venueId: string; filterType?: 'event' | 'special' };
const Navigation = createContext<((membership: AreaMembership, filterType?: 'event' | 'special') => void) | null>(null);
export const useAreaMembershipNavigation = () => useContext(Navigation);

/** One parent modal per callout, with synchronous cached opening and single-flight stale validation. */
export function AreaMembershipNavigationProvider({ children, onShowRoute, loadParent = fetchFirestoreMembershipRoot }: {
  children: React.ReactNode; onShowRoute?: (event: Event) => void; loadParent?: typeof fetchFirestoreMembershipRoot;
}) {
  const client = useQueryClient();
  const index = useAreaMembershipIndex();
  const criteria = useMapStore(state => state.filterCriteria);
  const minute = useEventTimingMinute();
  const [request, setRequest] = useState<Request | null>(null);
  const locked = useRef(false);
  const resolve = (selection: Request, snapshot = index) => {
    const now = new Date(minute * 60000);
    const child = selection.childId ? snapshot.records.get(selection.childId)?.event || selection.childEvent : undefined;
    const options = child ? snapshot.forEvent(child, now) : selection.childId ? []
      : snapshot.forVenue(selection.venueId, selection.filterType === 'special' ? criteria.specialFilters : criteria.eventFilters, now);
    return options.find(option => toFirestoreEventId(option.parent.id) === selection.parentId && option.venueId === selection.venueId);
  };
  const current = request ? resolve(request) : undefined;
  const close = useCallback(() => { locked.current = false; setRequest(null); }, []);
  useEffect(() => { if (request && !current) close(); }, [request, current, close]);
  const open = (membership: AreaMembership, filterType?: 'event' | 'special') => {
    if (locked.current) return;
    const selection: Request = { parentId: toFirestoreEventId(membership.parent.id), childId: membership.childId, childEvent: membership.childEvent, venueId: membership.venueId, filterType };
    const latest = resolve(selection, getAreaMembershipSnapshot(client));
    if (!latest) return;
    locked.current = true; setRequest(selection);
    if (Date.now() - latest.checkedAt < AREA_ACTIVITY_FRESH_MS) return;
    void client.fetchQuery<AreaActivityEntry>({ queryKey: areaMembershipRootKey(selection.parentId),
      staleTime: AREA_ACTIVITY_FRESH_MS, gcTime: Infinity, retry: false,
      queryFn: async ({ signal }) => {
        const startedAt = Date.now(), before = latest.checkedAt;
        const result = await loadParent(selection.parentId, signal);
        if (signal.aborted) throw new Error('Parent validation cancelled');
        if (result.status === 'found' && toFirestoreEventId(result.event.id) !== selection.parentId) throw new Error('Parent identity mismatch');
        const after = getAreaMembershipSnapshot(client);
        const newer = after.records.get(selection.parentId);
        if (newer && newer.checkedAt > before && newer.checkedAt >= startedAt) return { status: 'found', ...newer };
        const absentAt = after.unavailableAt.get(selection.parentId) || 0;
        if (absentAt > before && absentAt >= startedAt) return { status: 'unavailable', checkedAt: absentAt };
        return { ...result, checkedAt: Date.now() };
      },
    }).catch(() => { /* Transient validation failure retains the already-usable current cache. */ });
  };
  return <Navigation.Provider value={open}>{children}
    {current && <Modal transparent visible animationType="fade" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={close}>
      <EventImageLightbox event={current.parent} imageUrl={getLightboxImageUrl(current.parent)} onClose={close}
        managedEventDetails onShowRoute={onShowRoute ? event => { onShowRoute(event); requestAnimationFrame(close); } : undefined} />
    </Modal>}
  </Navigation.Provider>;
}
