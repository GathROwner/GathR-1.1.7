/** Synthetic detail refresh/reconstruction; no network, map or live records. */
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('supercluster', () => ({ __esModule: true, default: class { load() { return this; } getClusters() { return []; } getLeaves() { return []; } } }));
jest.mock('../../lib/api/firestoreEvents', () => ({ ...jest.requireActual('../../lib/api/firestoreEvents'), fetchFirestoreEventDetailsBatch: jest.fn() }));
import { useMapStore } from '../mapStore';
import { fetchFirestoreEventDetailsBatch } from '../../lib/api/firestoreEvents';
import { createLegacyTimingContract, getDateOnlyScheduleRange, getEventScheduleState } from '../../utils/eventTiming';
import { dateOnlyActivity } from '../../utils/__tests__/fixtures/dateOnlyActivity';
import type { Event } from '../../types/events';
const initial = useMapStore.getState();
const queryGlobal = global as typeof global & { __RQ_CLIENT?: unknown };
const originalQueryClient = queryGlobal.__RQ_CLIENT;
beforeEach(() => { queryGlobal.__RQ_CLIENT = null; (fetchFirestoreEventDetailsBatch as jest.Mock).mockReset(); });
afterEach(() => { useMapStore.setState(initial); queryGlobal.__RQ_CLIENT = originalQueryClient; });
it.each(['top', 'metadata'])('keeps v2 clocks and string No flags through %s refresh/reconstruction', async (placement) => {
  const source = dateOnlyActivity();
  const flags = { isRecurring: 'No', isRecurringInstance: 'No', recurringPattern: 'none' };
  const detail = (id: string) => ({ ...source, id, timing: undefined, isRecurring: undefined,
    isRecurringInstance: undefined, ...(placement === 'top' ? flags : {}),
    metadata: { timing: source.timing, ...(placement === 'metadata' ? flags : {}) } });
  const existing = { ...source, id: 'fb_existing', startTime: '19:00', endTime: '21:00', timing: undefined };
  useMapStore.setState({ events: [existing], allEvents: [existing] });
  (fetchFirestoreEventDetailsBatch as jest.Mock).mockResolvedValue([detail('existing'), detail('new')]);
  await useMapStore.getState().fetchEventDetails(['existing', 'new']);
  for (const collection of [useMapStore.getState().events, useMapStore.getState().allEvents]) {
    expect(collection).toHaveLength(2);
    for (const item of collection) {
      expect(getDateOnlyScheduleRange(item)).toEqual({ startDate: source.startDate, endDate: source.endDate });
      expect(item.startTime).toBe(''); expect(item.endTime).toBe('');
      expect(item.isRecurring).toBe(false); expect(item.isRecurringInstance).toBe(false);
    }
  }
});
it('preserves existing recurrence when a partial detail response omits flags', async () => {
  const source = { ...dateOnlyActivity(), id: 'fb_existing', isRecurring: true, isRecurringInstance: true };
  useMapStore.setState({ events: [source], allEvents: [source] });
  (fetchFirestoreEventDetailsBatch as jest.Mock).mockResolvedValue([{ id: 'existing', description: 'Updated' }]);
  await useMapStore.getState().fetchEventDetails(['existing']);
  expect(useMapStore.getState().events[0]).toMatchObject({ isRecurring: true, isRecurringInstance: true });
  expect(getDateOnlyScheduleRange(useMapStore.getState().events[0])).toBeNull();
});
it('retains confirmed overnight timing and Yes recurrence through detail reconstruction', async () => {
  const source = dateOnlyActivity({ startDate: '2026-10-15', endDate: '2026-10-16', startTime: '23:00', endTime: '01:00' });
  source.timing = createLegacyTimingContract(source, { endStatus: 'observed' });
  useMapStore.setState({ events: [], allEvents: [] });
  (fetchFirestoreEventDetailsBatch as jest.Mock).mockResolvedValue([{ ...source, id: 'night', timing: undefined,
    isRecurring: 'Yes', isRecurringInstance: 'Yes', metadata: { timing: source.timing } }]);
  await useMapStore.getState().fetchEventDetails(['night']);
  const actual = useMapStore.getState().events[0] as Event;
  expect(actual.isRecurring).toBe(true); expect(actual.isRecurringInstance).toBe(true);
  expect(getDateOnlyScheduleRange(actual)).toBeNull();
  expect(getEventScheduleState(actual, new Date('2026-10-16T03:30:00Z')).nowEligibility).toBe('confirmed');
});
