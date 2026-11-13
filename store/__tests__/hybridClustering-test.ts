jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// The installed UMD distribution exercises the real spatial index without ESM test-loader stubs.
jest.mock('supercluster', () => ({ __esModule: true, default: jest.requireActual('../../node_modules/supercluster/dist/supercluster.js') }));
import { useMapStore } from '../mapStore';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../types/filter';
import type { Event } from '../../types/events';

const zoom = 15, world = 512 * 2 ** zoom;
const lng = (pixel: number) => -63.12 + pixel / world * 360;
const event = (id: string, venue: string, pixel: number, type: 'event' | 'special' = 'event'): Event => ({
  id, title: id, description: '', venue, address: `${venue} Street`, latitude: 46.23, longitude: lng(pixel),
  type, category: type === 'event' ? 'Live Music' : 'Food Special', startDate: '2026-11-13', endDate: '2026-11-13', startTime: '19:00', endTime: '23:00', usersResponded: '0',
} as Event);
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-13T12:00:00-04:00'));
  useMapStore.setState({ markerClusterProfile: 'default', zoomLevel: zoom, filterCriteria: { ...DEFAULT_FILTER_CRITERIA, eventFilters: { ...DEFAULT_FILTER_CRITERIA.eventFilters, timeFilter: TimeFilterType.ALL }, specialFilters: { ...DEFAULT_FILTER_CRITERIA.specialFilters, timeFilter: TimeFilterType.ALL } } });
  useMapStore.getState().setEvents([event('a1', 'Alpha', 0), event('a2', 'Alpha', 0), event('b1', 'Beta', 90, 'special'), event('c1', 'Charlie', 700)]);
});
afterEach(() => { useMapStore.getState().setMarkerClusterProfile('default'); jest.useRealTimers(); jest.restoreAllMocks(); });
it('groups nearby Hybrid venues while retaining all venue/event/special data and separating distant venues', () => {
  expect(useMapStore.getState().clusters).toHaveLength(3);
  useMapStore.getState().setMarkerClusterProfile('hybrid');
  const clusters = useMapStore.getState().clusters;
  expect(clusters).toHaveLength(2);
  const combined = clusters.find(cluster => cluster.venues.length === 2)!;
  expect(combined.eventCount).toBe(2); expect(combined.specialCount).toBe(1);
  expect(combined.venues.map(v => v.venue).sort()).toEqual(['Alpha', 'Beta']);
  expect(clusters.reduce((sum, c) => sum + c.eventCount + c.specialCount, 0)).toBe(4);
});
it('splits naturally with zoom and restores Current/Standard/GathR clustering when Hybrid is left', () => {
  useMapStore.getState().setMarkerClusterProfile('hybrid'); expect(useMapStore.getState().clusters).toHaveLength(2);
  useMapStore.getState().setZoomLevel(17); expect(useMapStore.getState().clusters).toHaveLength(3);
  useMapStore.getState().setZoomLevel(zoom); expect(useMapStore.getState().clusters).toHaveLength(2);
  useMapStore.getState().setMarkerClusterProfile('default'); expect(useMapStore.getState().clusters).toHaveLength(3);
});
it('does not regenerate for repeated profile selection or move clusters on unchanged queries', () => {
  useMapStore.getState().setMarkerClusterProfile('hybrid');
  const before = useMapStore.getState().clusters;
  useMapStore.getState().setMarkerClusterProfile('hybrid'); expect(useMapStore.getState().clusters).toBe(before);
  useMapStore.getState().generateClusters(zoom); expect(useMapStore.getState().clusters).toBe(before);
  const queried = useMapStore.getState().getClustersForZoom(zoom);
  expect(queried.map(c => c.id)).toEqual(before.map(c => c.id));
  expect(queried.flatMap(c => c.venues).map(v => [v.latitude, v.longitude])).toEqual(before.flatMap(c => c.venues).map(v => [v.latitude, v.longitude]));
});
