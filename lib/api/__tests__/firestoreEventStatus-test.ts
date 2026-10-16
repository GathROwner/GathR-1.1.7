import { fetchFirestoreEventStatus, fetchFirestoreEventById } from '../firestoreEvents';
jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
const previousFetch = global.fetch;
const mockFetch = jest.fn();
const raw = { id: 'child', title: 'Synthetic activity', venueId: 'venue', venue: 'Venue', isEvent: true,
  startDate: '2040-10-16', endDate: '2040-10-16', startTime: '19:00', endTime: '21:00', latitude: 46, longitude: -63 };
beforeEach(() => { global.fetch = mockFetch; mockFetch.mockReset(); });
afterEach(() => { global.fetch = previousFetch; });
it('retains the capability query and abort signal while returning normalized canonical detail', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ event: raw }) });
  const controller = new AbortController();
  await expect(fetchFirestoreEventStatus('fb_child', controller.signal)).resolves.toMatchObject({ status: 'found', event: { id: 'fb_child', type: 'event' } });
  const [url, options] = mockFetch.mock.calls[0]; expect(new URL(url).searchParams.get('dateOnlyActivities')).toBe('v1');
  expect(options.signal).toBe(controller.signal);
});
it.each([404, 410])('only HTTP %i confirms unavailability', async status => {
  mockFetch.mockResolvedValue({ ok: false, status }); await expect(fetchFirestoreEventStatus('child')).resolves.toEqual({ status: 'unavailable' });
});
it.each([403, 429, 500, 503])('HTTP %i is an error rather than a deletion', async status => {
  mockFetch.mockResolvedValue({ ok: false, status }); await expect(fetchFirestoreEventStatus('child')).rejects.toThrow('request failed');
});
it('network errors preserve the distinction from confirmed deletion', async () => {
  mockFetch.mockRejectedValue(new Error('offline')); await expect(fetchFirestoreEventStatus('child')).rejects.toThrow('offline');
  await expect(fetchFirestoreEventById('child')).resolves.toBeNull();
});
it.each([{ event: null }, { ...raw, id: 'other' }, { ...raw, venueId: '' }, { ...raw, startDate: '2040-02-30' }])(
  'malformed/mismatched successful payload remains an error', async payload => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    await expect(fetchFirestoreEventStatus('child')).rejects.toThrow('Malformed');
  });
it('a cancelled canonical record is returned intact so the existing activity gates can reject it', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...raw, isCancelled: true }) });
  await expect(fetchFirestoreEventStatus('child')).resolves.toMatchObject({ status: 'found', event: { isCancelled: true } });
});
