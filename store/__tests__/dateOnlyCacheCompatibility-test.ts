/** Real persisted-query isolation and store I/O; synthetic data, no network/map. */
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('supercluster', () => ({ __esModule: true, default: class { load() { return this; } getClusters() { return []; } getLeaves() { return []; } } }));
jest.mock('../../lib/api/firestoreEvents', () => ({ ...jest.requireActual('../../lib/api/firestoreEvents'), fetchFirestoreEventDetailsBatch: jest.fn() }));

jest.mock('../../lib/api/events', () => ({ ...jest.requireActual('../../lib/api/events'), fetchMinimalEvents: jest.fn() }));
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { useMapStore } from '../mapStore';
import { fetchMinimalEvents } from '../../lib/api/events';
import { fetchFirestoreEventDetailsBatch } from '../../lib/api/firestoreEvents';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';
import { getDateOnlyScheduleRange } from '../../utils/eventTiming';
import { dateOnlyActivity } from '../../utils/__tests__/fixtures/dateOnlyActivity';
const oldFeed = ['events-minimal', 'original-source-v3'] as const;
const oldDetails = ['event-details', 'original-source-v2', 'fb_existing'];
const newDetails = ['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'fb_existing'];
const queryGlobal = global as typeof global & { __RQ_CLIENT?: unknown };
const previousClient = queryGlobal.__RQ_CLIENT;
const initial = useMapStore.getState();
let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryGlobal.__RQ_CLIENT = client; jest.clearAllMocks(); });
afterEach(() => { client.clear(); useMapStore.setState(initial); queryGlobal.__RQ_CLIENT = previousClient; });
it('isolates both directions across persisted-cache upgrade and rollback without deleting old data', () => {
  expect(EVENTS_MINIMAL).not.toEqual(oldFeed);
  expect(EVENT_DETAILS_SCHEMA_VERSION).not.toBe('original-source-v2');
  const oldClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  oldClient.setQueryData(oldFeed, { combinedData: ['old normalized record'] });
  oldClient.setQueryData(oldDetails, ['old detail']);
  hydrate(client, dehydrate(oldClient));
  expect(client.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
  expect(client.getQueryData(newDetails)).toBeUndefined();
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [dateOnlyActivity()] });
  client.setQueryData(newDetails, [dateOnlyActivity()]);
  const rollbackClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  hydrate(rollbackClient, dehydrate(client));
  expect(rollbackClient.getQueryData(oldFeed)).toEqual({ combinedData: ['old normalized record'] });
  expect(rollbackClient.getQueryData(oldDetails)).toEqual(['old detail']);
  oldClient.clear(); rollbackClient.clear();
});
it('store feed reads and writes use the capability generation rather than old hydrated data', async () => {
  client.setQueryData(oldFeed, { combinedData: ['old normalized record'] });
  const source = dateOnlyActivity({ id: 'fb_existing' });
  (fetchMinimalEvents as jest.Mock).mockResolvedValue({ combinedData: [source], fetchedAt: Date.now(), sources: {} });
  const read = jest.spyOn(client, 'getQueryData'), fetchQuery = jest.spyOn(client, 'fetchQuery');
  await useMapStore.getState().fetchEvents();
  expect(read).toHaveBeenCalledWith(EVENTS_MINIMAL);
  expect(fetchQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: EVENTS_MINIMAL }));
  expect(client.getQueryData(EVENTS_MINIMAL)).toEqual(expect.objectContaining({ combinedData: [source] }));
  expect(client.getQueryData(oldFeed)).toEqual({ combinedData: ['old normalized record'] });
  expect(useMapStore.getState().allEvents.map(e => e.id)).toContain('fb_existing');
});
it('store detail reads and writes use the capability schema and fetch instead of trusting old details', async () => {
  const source = dateOnlyActivity({ id: 'fb_existing' });
  client.setQueryData(oldDetails, [{ ...source, startTime: '12:00', endTime: '14:00', timing: undefined }]);
  useMapStore.setState({ events: [{ ...source, timing: undefined }], allEvents: [{ ...source, timing: undefined }] });
  (fetchFirestoreEventDetailsBatch as jest.Mock).mockResolvedValue([{ ...source, id: 'existing', timing: undefined,
    isRecurring: 'No', isRecurringInstance: 'No', metadata: { timing: source.timing } }]);
  const read = jest.spyOn(client, 'getQueryData'), fetchQuery = jest.spyOn(client, 'fetchQuery');
  await useMapStore.getState().fetchEventDetails(['existing']);
  expect(read).toHaveBeenCalledWith(newDetails);
  expect(fetchQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: newDetails }));
  expect(fetchFirestoreEventDetailsBatch).toHaveBeenCalled();
  expect(client.getQueryData(newDetails)).toBeDefined();
  expect(getDateOnlyScheduleRange(useMapStore.getState().events[0])).not.toBeNull();
  expect((client.getQueryData(oldDetails) as { startTime: string }[])[0].startTime).toBe('12:00');
});

it('all root/bootstrap/store event-cache selectors resolve to the partitioned constants', () => {
  const { readFileSync } = require('fs');
  const { resolve } = require('path');
  const babel = require('@babel/core');
  const traverse = require('@babel/traverse').default;
  for (const file of ['app/_layout.tsx', 'store/mapStore.ts']) {
    const ast = babel.parseSync(readFileSync(resolve(__dirname, '../..', file), 'utf8'), {
      filename: file, babelrc: false, configFile: false, parserOpts: { plugins: ['typescript', 'jsx'] },
    });
    let checked = 0;
    const resolveKey = (node: any, scope: any): string | null => {
      if (node?.type === 'Identifier') {
        const binding = scope.getBinding(node.name);
        if (binding?.path.isImportSpecifier() && binding.path.parent.source.value.endsWith('/queryKeys')) {
          if (node.name === 'EVENTS_MINIMAL') return 'feed';
          if (node.name === 'EVENT_DETAILS_SCHEMA_VERSION') return 'detail-schema';
        }
        if (binding?.path.isVariableDeclarator()) return resolveKey(binding.path.node.init, binding.path.scope);
      }
      if (node?.type === 'ArrayExpression' && node.elements[0]?.value === 'event-details'
        && resolveKey(node.elements[1], scope) === 'detail-schema') return 'detail';
      return null;
    };
    const visit = (call: any) => {
      const callee = call.node.callee;
      if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee.type)
        || !['queryClient', 'qc'].includes(callee.object?.name)) return;
      const name = callee.property?.name;
      if (!['getQueryData', 'setQueryData', 'getQueryState', 'fetchQuery', 'prefetchQuery'].includes(name)) return;
      const first = call.node.arguments[0];
      const selector = ['fetchQuery', 'prefetchQuery'].includes(name)
        ? first?.properties?.find((p: any) => p.key?.name === 'queryKey')?.value : first;
      expect(['feed', 'detail']).toContain(resolveKey(selector, call.scope));
      checked++;
    };
    traverse(ast, { CallExpression: visit, OptionalCallExpression: visit });
    expect(checked).toBeGreaterThan(0);
  }
});
