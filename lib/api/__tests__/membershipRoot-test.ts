import { fetchFirestoreMembershipRoot } from '../firestoreEvents';
jest.mock('../../../config/firebaseConfig', () => ({ auth: {}, firestore: {} }));
const originalFetch = global.fetch;
const root = { id: 'qa_root', title: 'Public area', startDate: '2040-10-14', endDate: '2040-10-18', venueId: null,
  metadata: { locationScope: 'area', areaData: { version: 1, status: 'partial', locations: [] } } };
afterEach(() => { global.fetch = originalFetch; });
it('accepts canonical metadata area roots without venue IDs, including explicit cleared locations', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ event: root }) });
  const result = await fetchFirestoreMembershipRoot('fb_qa_root', new AbortController().signal);
  expect(result).toMatchObject({ status: 'found', event: { id: 'fb_qa_root', venueId: null, locationScope: 'area', areaData: { locations: [] } } });
});
it.each([404, 410])('treats only explicit HTTP %s as confirmed absence', async status => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status }); expect(await fetchFirestoreMembershipRoot('qa_root')).toEqual({ status: 'unavailable' });
});
it.each([401, 403, 500])('retains uncertainty on HTTP %s', async status => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status }); await expect(fetchFirestoreMembershipRoot('qa_root')).rejects.toThrow();
});
it.each([null, {}, { ...root, id: 'wrong' }, { ...root, startDate: '2040-02-30' }, { ...root, title: '' },
  { ...root, metadata: { locationScope: {}, areaData: null } },
  { ...root, metadata: { ...root.metadata, areaData: { version: 1, locations: 'bad-data' } } }])('rejects malformed successful data without deleting cached content: %j', async payload => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => payload }); await expect(fetchFirestoreMembershipRoot('qa_root')).rejects.toThrow();
});
