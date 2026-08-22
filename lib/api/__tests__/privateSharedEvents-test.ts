jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizePrivateSharedEventForRegression } from '../privateSharedEvents';

describe('private shared event normalization', () => {
  const unknownVenueEvent = {
    ownerUid: 'qa-user',
    ingestId: 'qa-ingest',
    sourcePlatform: 'unknown' as const,
    sourceVisibility: 'user_private' as const,
    routing: 'private_only' as const,
    status: 'saved' as const,
    title: 'Neighbourhood Game Night',
    description: 'Private-address QA fixture.',
    startDate: '2099-09-24',
    endDate: '2099-09-24',
    startTime: '18:30',
    endTime: '20:30',
    locationName: 'Maple Fox Community Studio',
    address: '42 Example Drive, Charlottetown PE C1A1A1',
    latitude: 46.25,
    longitude: -63.1,
    locationScope: 'unknown' as const,
    locationPrecision: 'exact' as const,
    mapMode: 'venue' as const,
    mediaUrls: ['https://example.com/private-owned-photo.jpg'],
  };

  it('shows exact private unknown locations without creating or matching a venue', () => {
    const normalized = normalizePrivateSharedEventForRegression('private-1', unknownVenueEvent, null);
    expect(normalized).not.toBeNull();
    expect(normalized?.venueId).toBeNull();
    expect(normalized?.venue).toBe('Maple Fox Community Studio');
    expect(normalized?.latitude).toBe(46.25);
    expect(normalized?.longitude).toBe(-63.1);
    expect(normalized?.locationScope).toBe('unknown');
    expect(normalized?.sharedEventProvenance?.label).toBe('Shared by you');
    expect(normalized?.venueWebsite).toBe('');
  });

  it('does not put an unresolved address at zero-zero on the map', () => {
    const normalized = normalizePrivateSharedEventForRegression('private-2', {
      ...unknownVenueEvent,
      latitude: undefined,
      longitude: undefined,
    }, null);
    expect(normalized).toBeNull();
  });
});
