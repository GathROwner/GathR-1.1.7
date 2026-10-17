jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
import { fetchAllFirestoreEvents, fetchFirestoreEventById, fetchFirestoreEventDetailsBatch,
  fetchVenueDetails, fetchVenueDetailsByName, fetchEventFeedVersion } from '../firestoreEvents';
const originalFetch = global.fetch;
const fetchMock = jest.fn();
beforeEach(() => { global.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { global.fetch = originalFetch; });
const response = (payload: unknown) => ({ ok: true, json: async () => payload });
const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
it.each([true, false])('declares exact capability on every %s feed page without losing filters/cursor', async (isEvent) => {
  fetchMock.mockResolvedValueOnce(response({ events: [], nextPageToken: 'cursor with spaces' }))
    .mockResolvedValueOnce(response({ events: [] }));
  await fetchAllFirestoreEvents({ isEvent, startDate: '2026-10-15', endDate: '2026-10-26', limit: 7, includeExpired: false });
  expect(urls()).toHaveLength(2);
  for (const url of urls()) {
    expect(url.searchParams.getAll('dateOnlyActivities')).toEqual(['v1']);
    expect(url.searchParams.get('isEvent')).toBe(String(isEvent));
    expect(url.searchParams.get('startDate')).toBe('2026-10-15');
    expect(url.searchParams.get('endDate')).toBe('2026-10-26');
    expect(url.searchParams.get('limit')).toBe('7');
    expect(url.searchParams.get('includeExpired')).toBe('false');
  }
  expect(urls()[0].searchParams.has('startAfter')).toBe(false);
  expect(urls()[1].searchParams.get('startAfter')).toBe('cursor with spaces');
});
it('declares capability on encoded single and batch event detail requests', async () => {
  fetchMock.mockResolvedValue(response({ event: null }));
  await fetchFirestoreEventById('fb_synthetic /?');
  await fetchFirestoreEventDetailsBatch(['fb_first', 'fb_second']);
  expect(urls()).toHaveLength(3);
  expect(urls()[0].pathname.endsWith('/events/synthetic%20%2F%3F')).toBe(true);
  for (const url of urls()) expect(url.searchParams.getAll('dateOnlyActivities')).toEqual(['v1']);
});
it('does not declare capability on venue-metadata-only requests', async () => {
  fetchMock.mockResolvedValueOnce(response({ venue: { pagename: 'Synthetic venue' } }))
    .mockResolvedValueOnce(response({ venues: [] }));
  await fetchVenueDetails('synthetic'); await fetchVenueDetailsByName('Synthetic venue');
  expect(urls()).toHaveLength(2);
  for (const url of urls()) expect(url.searchParams.has('dateOnlyActivities')).toBe(false);
});

it('does not declare capability on feed-version-only requests', async () => {
  fetchMock.mockResolvedValue(response({ version: 1, updatedAt: null }));
  await fetchEventFeedVersion();
  expect(urls()).toHaveLength(1);
  expect(urls()[0].pathname.endsWith('/events/version')).toBe(true);
  expect(urls()[0].searchParams.has('dateOnlyActivities')).toBe(false);
});
