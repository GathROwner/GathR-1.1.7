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
});
