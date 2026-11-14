import { useMapStore } from '../mapStore';
import type { Event } from '../../types/events';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../types/filter';
import { getListFilterCandidates } from '../../utils/listFilterCandidates';
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class {
    points: unknown[] = [];
    load(points: unknown[]) { this.points = points; return this; }
    getClusters() { return this.points; }
    getLeaves() { return this.points; }
  },
}));


const item = (id: string, type: 'event' | 'special', category = 'Live Music', date = '2026-11-14') => ({
 id, type, category, title: id, description: '', venue: 'Fixture', address: 'Test',
 latitude: 46.23, longitude: -63.12, startDate: date, endDate: date, startTime: '19:00', endTime: '23:00',
}) as Event;
describe('legacy runtime list filter backport', () => {
 beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date(2026,10,14,12));
  useMapStore.setState({ onScreenEvents: [], filterCriteria: { ...DEFAULT_FILTER_CRITERIA,
   showEvents: true, showSpecials: true,
   eventFilters: {timeFilter:TimeFilterType.TODAY}, specialFilters: {timeFilter:TimeFilterType.TODAY} } });
 });
 afterEach(() => jest.useRealTimers());
 it.each(['event','special'] as const)('provides outside-map %s options with an empty map', type => {
  const pool=getListFilterCandidates([], [item('music',type),item('jokes',type,'Comedy'),item('future',type,'Live Music','2026-11-15')],type,false,[]);
  const state=useMapStore.getState();
  expect(state.getTimeFilterCounts(type,pool).today).toBe(2);
  expect(state.getCategoryFilterCounts(type,pool)).toMatchObject({'Live Music':1,Comedy:1});
  expect(state.getTimeFilterCounts(type).today).toBe(0);
  expect(state.getCategoryFilterCounts(type)).toEqual({});
 });
 it('counts both partitions beyond the first page and keeps alternatives after category selection', () => {
  const pool=getListFilterCandidates([item('inside','event')],Array.from({length:26},(_,i)=>item(String(i),'event','Comedy')),'event',false,[]);
  const state=useMapStore.getState();
  expect(state.getTimeFilterCounts('event',pool).today).toBe(27);
  useMapStore.setState({filterCriteria:{...state.filterCriteria,eventFilters:{timeFilter:TimeFilterType.TODAY,category:'Comedy'}}});
  expect(useMapStore.getState().getTimeFilterCounts('event',pool).today).toBe(26);
  expect(useMapStore.getState().getCategoryFilterCounts('event',pool)).toMatchObject({'Live Music':1,Comedy:26});
 });
 it('respects saved-only and type, without filtering category options to the current category', () => {
  const pool=getListFilterCandidates([item('saved','event')],[item('unsaved','event','Comedy'),item('special','special')],'event',true,['saved','special']);
  expect(pool.map(e=>e.id)).toEqual(['saved']);
  expect(useMapStore.getState().getCategoryFilterCounts('event',pool)['Live Music']).toBe(1);
  expect(getListFilterCandidates([],pool,'event',true,[])).toEqual([]);
 });
});
