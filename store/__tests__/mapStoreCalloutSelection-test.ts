jest.mock('../../config/firebaseConfig', () => ({
  auth: {},
  firestore: {},
  app: {},
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class SuperclusterMock {
    load() {
      return this;
    }
    getClusters() {
      return [];
    }
    getLeaves() {
      return [];
    }
  },
}));

import type { Venue } from '../../types/events';
import { useMapStore } from '../mapStore';

const venue = (locationKey: string, name: string): Venue => ({
  locationKey,
  venue: name,
  address: 'Charlottetown, PE',
  latitude: 46.23,
  longitude: -63.12,
  events: [],
});

describe('mapStore callout venue selection', () => {
  const hunters = venue('venue:hunters', "Hunter's Ale House");
  const cinema = venue('venue:city-cinema', 'City Cinema');

  afterEach(() => {
    useMapStore.setState({
      selectedVenue: null,
      selectedVenues: [],
      selectedCluster: null,
      preferredCalloutVenueLocationKey: null,
    });
  });

  it('records an explicit venue request only when it belongs to the callout', () => {
    useMapStore.getState().selectCallout([hunters, cinema], null, {
      preferredVenueLocationKey: cinema.locationKey,
    });

    expect(useMapStore.getState().preferredCalloutVenueLocationKey).toBe(cinema.locationKey);
    expect(useMapStore.getState().selectedVenue).toBe(cinema);

    useMapStore.getState().selectCallout([hunters, cinema], null, {
      preferredVenueLocationKey: 'venue:missing',
    });

    expect(useMapStore.getState().preferredCalloutVenueLocationKey).toBeNull();
  });

  it('clears the explicit request for ordinary callout opens and closes', () => {
    useMapStore.getState().selectCallout([hunters, cinema], null, {
      preferredVenueLocationKey: cinema.locationKey,
    });
    useMapStore.getState().selectCallout([hunters, cinema], null);

    expect(useMapStore.getState().preferredCalloutVenueLocationKey).toBeNull();

    useMapStore.getState().selectCallout([hunters, cinema], null, {
      preferredVenueLocationKey: cinema.locationKey,
    });
    useMapStore.getState().selectVenue(null);

    expect(useMapStore.getState().preferredCalloutVenueLocationKey).toBeNull();
  });
});
