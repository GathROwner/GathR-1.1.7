jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));

import {
  fetchVenueDetails,
  fetchVenueDetailsByName,
  normalizeFirestoreEvent,
  normalizeVenueInstagramUrl,
} from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';

const badInstagram = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1768942918965.webp';
const profileImage = 'https://storage.googleapis.com/gathr-uploaded-images/profilepictures/1772909047921-e6pg1l.webp';
const goodInstagram = 'https://www.instagram.com/example_venue/';
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const response = (payload: unknown) => ({ ok: true, json: async () => payload });

beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { global.fetch = originalFetch; });

it.each([badInstagram, 'https://example.com/instagram.com/name', 'https://www.instagram.com.example.com/name',
  'javascript:alert(1)', 'file:///tmp/profile.webp', '//www.instagram.com/name', 'not a url', '', null, 123])(
  'rejects non-Instagram destination %p without guessing a username', value => {
    expect(normalizeVenueInstagramUrl(value)).toBeUndefined();
  }
);

it.each([goodInstagram, 'https://instagram.com/example_venue/', 'https://m.instagram.com/example_venue/']) (
  'preserves an actual Instagram URL %s', value => {
    expect(normalizeVenueInstagramUrl(value)).toBe(value);
  }
);

it('trims a valid URL without changing its profile path or query', () => {
  expect(normalizeVenueInstagramUrl('  ' + goodInstagram + '?hl=en  ')).toBe(goodInstagram + '?hl=en');
});

it('also preserves valid links and rejects image links with React Native URL parsing', () => {
  const nativeURL = require('react-native/Libraries/Blob/URL').URL as typeof URL;
  const originalURL = global.URL;
  try {
    global.URL = nativeURL;
    expect(normalizeVenueInstagramUrl(goodInstagram)).toBe(goodInstagram);
    expect(normalizeVenueInstagramUrl(badInstagram)).toBeUndefined();
    expect(normalizeVenueInstagramUrl('https://www.instagram.com.example.com/name')).toBeUndefined();
  } finally {
    global.URL = originalURL;
  }
});

it.each(['id', 'name'])('filters Merchantman image URL in %s lookup while preserving Facebook and profile image', async lookup => {
  const record = { id: 'slug_merchantmanpei', pagename: 'The Merchantman Fresh Seafood & Oyster Bar',
    instagramUrl: badInstagram, facebookUrl: 'https://www.facebook.com/MerchantmanPEI', profileImage };
  fetchMock.mockResolvedValue(response(lookup === 'id' ? { venue: record } : { venues: [record] }));
  const result = lookup === 'id' ? await fetchVenueDetails(record.id) : await fetchVenueDetailsByName(record.pagename);
  expect(result?.instagram).toBeUndefined();
  expect(result?.facebook).toBe(record.facebookUrl);
  expect(result?.profileImage).toBe(profileImage);
});

it('retains valid Instagram contacts in venue details', async () => {
  fetchMock.mockResolvedValue(response({ venue: { instagramUrl: goodInstagram } }));
  expect((await fetchVenueDetails('venue-1'))?.instagram).toBe(goodInstagram);
});

it('filters invalid Instagram fields during event normalization without reassigning profile images', () => {
  const event = { id: 'merchantman-event', title: 'Sample', startDate: '2026-10-20', metadata: {},
    venue: { id: 'slug_merchantmanpei', pagename: 'The Merchantman Fresh Seafood & Oyster Bar',
      address: '23 Queen St', latitude: 46.23, longitude: -63.12, instagramUrl: badInstagram, profileImage } };
  const result = normalizeFirestoreEvent(event as unknown as FirestoreEvent);
  expect(result.venueInstagramUrl).toBe('');
  expect(result.profileUrl).toBe(profileImage);
  expect(normalizeFirestoreEvent({ ...event, venue: { ...event.venue, instagramUrl: goodInstagram } } as unknown as FirestoreEvent).venueInstagramUrl).toBe(goodInstagram);
});
