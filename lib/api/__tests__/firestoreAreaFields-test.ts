jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';
import { getEventScheduleState } from '../../../utils/eventTiming';
import { formatEventTimingSummary } from '../../../utils/dateUtils';

describe('Firestore multi-location area field mapping', () => {
  it.each(['2026-10-15T15:00:00Z', '2026-10-18T22:00:00Z'])('keeps a normalized date-only area overview discoverable on %s', (instant) => {
    const event = normalizeFirestoreEvent({ id: 'festival', title: 'Festival', startDate: '2026-10-14', endDate: '2026-10-18',
      startTime: '', endTime: '', metadata: { locationScope: 'area', mapMode: 'area', timing: {
        version: 2, timeZone: 'America/Halifax', scheduleKind: 'multi_day',
        schedule: { start: { localDate: '2026-10-14', localTime: null, status: 'unknown' },
          end: { localDate: '2026-10-18', localTime: null, status: 'unknown' } },
        estimate: { confidence: 'low', discoveryCutoffDate: '2026-10-18', discoveryCutoffTime: '23:59',
          method: 'reviewed_area_date_range_discovery_cutoff' },
      } } } as FirestoreEvent);
    expect(getEventScheduleState(event, new Date(instant))).toMatchObject({ todayEligible: true, defaultMapEligible: true, nowEligibility: 'none' });
    expect(formatEventTimingSummary(event)).toBe('Oct 14 – Oct 18 • See individual event times');
    expect(event.startTime).toBe(''); expect(event.endTime).toBe('');
  });
  it('keeps healthy string-false flags visible and normalizes explicit cancellation/expiry metadata', () => {
    const raw = { id: 'healthy', title: 'Film', startDate: '2026-10-16', startTime: '19:00', endDate: '2026-10-16', endTime: '21:00',
      metadata: { isCancelled: 'false', canceled: 'No', isExpired: '0' } } as FirestoreEvent;
    expect(normalizeFirestoreEvent(raw)).toMatchObject({ isCancelled: false, isExpired: false });
    expect(normalizeFirestoreEvent({ ...raw, metadata: { isCancelled: 'YES', isExpired: true } } as FirestoreEvent))
      .toMatchObject({ isCancelled: true, isExpired: true });
  });

  it('normalizes unordered area locations delivered through API metadata', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'busker-festival',
      title: 'Charlottetown Busker Festival',
      description: '',
      startDate: '2026-09-04',
      startTime: '',
      venueId: null,
      venue: 'Downtown Charlottetown festival locations',
      category: 'Festivals',
      isEvent: true,
      metadata: {
        locationScope: 'area',
        locationLabel: 'Downtown Charlottetown festival locations',
        mapMode: 'area',
        areaData: {
          version: 1,
          status: 'verified',
          locations: [
            {
              id: 'victoria-row',
              label: 'Victoria Row',
              certainty: 'confirmed',
              coordinates: { longitude: -63.125907, latitude: 46.234294 },
            },
          ],
        },
      },
    } as FirestoreEvent);

    expect(normalized.locationScope).toBe('area');
    expect(normalized.mapMode).toBe('area');
    expect(normalized.areaData?.status).toBe('verified');
    expect(normalized.areaData?.locations).toHaveLength(1);
    expect(normalized.routeData).toBeNull();
  });

  it('normalizes the live province feed projection without inventing a venue or destination', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'cityevt_3cbef1e81919fa57f23bb16c',
      title: '2026 SUMMER GAMES - PEI 55+',
      description: '',
      startDate: '2026-09-14',
      startTime: '08:00',
      endDate: '2026-09-17',
      endTime: '17:00',
      venueId: 'province_pei',
      venue: 'Across Prince Edward Island',
      address: 'Across Prince Edward Island',
      latitude: 46.5107,
      longitude: -63.4168,
      category: 'Gatherings & Parties',
      isEvent: true,
      metadata: {
        venueId: null,
        locationScope: 'province',
        locationLabel: 'Across Prince Edward Island',
        locationProvince: 'PEI',
        locationPrecision: 'none',
        mapMode: 'none',
      },
    } as FirestoreEvent);

    expect(normalized).toMatchObject({
      id: 'fb_cityevt_3cbef1e81919fa57f23bb16c',
      venueId: null,
      venue: 'Across Prince Edward Island',
      address: 'Across Prince Edward Island',
      latitude: 0,
      longitude: 0,
      locationScope: 'province',
      locationLabel: 'Across Prince Edward Island',
      locationProvince: 'PEI',
      mapMode: 'none',
    });
  });
});
