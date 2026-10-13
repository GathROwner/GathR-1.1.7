/**
 * Measure the actual MainNavigator subscription in an isolated React probe.
 * Read only its hook declaration, so native navigation, ads, GPS and the map
 * are never mounted. Use the real Zustand store with I/O adapters mocked.
 * These counts describe store-triggered renders, not device FPS or latency.
 */
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn(),
}));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class {
    load() { return this; }
    getClusters() { return []; }
    getLeaves() { return []; }
  },
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { useMapStore } from '../mapStore';
import type { MapState } from '../../types/store';

function readNavigatorSubscription(): { declaration: string; useAction: () => MapState['setAllEvents'] } {
  const source = readFileSync(resolve(__dirname, '../../app/_layout.tsx'), 'utf8');
  const ast = require('@babel/parser').parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const navigator = ast.program.body.find((node: any) => node.type === 'FunctionDeclaration' && node.id.name === 'MainNavigator');
  const declaration = navigator?.body.body.find((node: any) => node.type === 'VariableDeclaration'
    && node.declarations.some((item: any) => item.init?.type === 'CallExpression'
      && item.init.callee.name === 'useMapStore'));
  if (!declaration) throw new Error('MainNavigator store subscription was not found');
  const code = source.slice(declaration.start, declaration.end);
  // Compile the exact checked-in hook call, rather than a hand-copied selector.
  const useAction = new Function('useMapStore', `return function useAction() { ${code}; return setAllEvents; };`)(useMapStore);
  return { declaration: code, useAction };
}

describe('MainNavigator store subscription', () => {
  const initial = useMapStore.getState();
  let component: renderer.ReactTestRenderer | undefined;
  afterEach(() => {
    act(() => component?.unmount());
    component = undefined;
    useMapStore.setState(initial, true);
  });

  it('avoids root renders for unrelated store changes while ordinary subscribers still update', () => {
    const { declaration, useAction } = readNavigatorSubscription();
    const counts = { wholeStore: 0, navigator: 0, search: 0 };
    let selectedAction: MapState['setAllEvents'] | undefined;
    let latestSearch = '';
    function WholeStoreProbe() { useMapStore(); counts.wholeStore++; return null; }
    function NavigatorProbe() { selectedAction = useAction(); counts.navigator++; return null; }
    function SearchProbe() {
      latestSearch = useMapStore((state) => state.searchQuery);
      counts.search++;
      return null;
    }
    act(() => { component = renderer.create(<><WholeStoreProbe /><NavigatorProbe /><SearchProbe /></>); });
    // Separate act calls prevent React batching from hiding eligible rerenders.
    // Direct store writes exercise subscription delivery only: no camera,
    // filtering, network or clustering action is invoked.
    for (let i = 1; i <= 20; i++) {
      act(() => useMapStore.setState({ zoomLevel: 10 + i / 10 }));
      act(() => useMapStore.setState({ searchQuery: `query-${i}` }));
      act(() => useMapStore.setState({ closeCalloutTrigger: i }));
    }
    const report = { declaration, updates: 60, initialRenders: 1, renders: counts,
      actionIdentityPreserved: selectedAction === initial.setAllEvents, latestSearch };
    if (process.env.GATHR_SUBSCRIPTION_REPORT) writeFileSync(process.env.GATHR_SUBSCRIPTION_REPORT, JSON.stringify(report, null, 2));
    expect(counts.wholeStore).toBe(61);
    expect(counts.search).toBe(21);
    expect(latestSearch).toBe('query-20');
    expect(selectedAction).toBe(initial.setAllEvents);
    expect(counts.navigator).toBe(1);
  });

  it('updates when the selected action changes and invokes its current implementation', () => {
    const { useAction } = readNavigatorSubscription();
    let selectedAction!: MapState['setAllEvents'];
    let renders = 0;
    function Probe() { selectedAction = useAction(); renders++; return null; }
    act(() => { component = renderer.create(<Probe />); });
    expect(selectedAction).toBe(initial.setAllEvents);
    const replacement = jest.fn<ReturnType<MapState['setAllEvents']>, Parameters<MapState['setAllEvents']>>();
    act(() => useMapStore.setState({ setAllEvents: replacement }));
    expect(renders).toBe(2);
    const events: Parameters<MapState['setAllEvents']>[0] = [];
    selectedAction(events);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledWith(events);
  });
});
