jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';

describe('Firestore route field mapping', () => {
  it('normalizes route fields delivered through API metadata', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'gold-cup-route',
      title: '2026 Gold Cup Parade',
      description: '',
      startDate: '2026-08-21',
      startTime: '10:00',
      venueId: null,
      venue: 'Gold Cup Parade Route',
      category: 'Gatherings & Parties',
      isEvent: true,
      metadata: {
        locationScope: 'route',
        locationLabel: 'Gold Cup Parade Route',
        mapMode: 'route',
        routeData: {
          version: 1,
          status: 'partial',
          confirmedStreets: ['North River Road'],
          stops: [
            {
              id: 'start',
              label: 'Start',
              kind: 'start',
              certainty: 'confirmed',
              coordinates: { longitude: -63.14257, latitude: 46.2387131 },
            },
          ],
          segments: [
            {
              id: 'approx-line',
              streetName: 'North River Road',
              certainty: 'approximate',
              source: 'manual_review',
              coordinates: [
                { longitude: -63.14257, latitude: 46.2387131 },
                { longitude: -63.13858, latitude: 46.2328 },
              ],
            },
          ],
        },
      },
    } as FirestoreEvent);

    expect(normalized.locationScope).toBe('route');
    expect(normalized.mapMode).toBe('route');
    expect(normalized.routeData?.status).toBe('partial');
    expect(normalized.routeData?.segments).toHaveLength(1);
  });
});
