jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';

describe('Firestore multi-location area field mapping', () => {
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
