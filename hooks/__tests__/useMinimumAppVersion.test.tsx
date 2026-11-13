import React from 'react';
import { AppState, Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { useMinimumAppVersion } from '../useMinimumAppVersion';
import { fetchMinimumAppVersionPolicy } from '../../services/minimumAppVersionPolicy';
import disabledPolicy from '../../config/minimum-versions.disabled.json';

jest.mock('expo-application', () => ({ __esModule: true, nativeApplicationVersion: '1.1.10' }));
jest.mock('expo-updates', () => ({ __esModule: true, channel: 'production', runtimeVersion: '99.0.0' }));
jest.mock('../../services/minimumAppVersionPolicy', () => ({ fetchMinimumAppVersionPolicy: jest.fn() }));
const fetchPolicy = fetchMinimumAppVersionPolicy as jest.Mock;
const activePolicy = { ...disabledPolicy, ios: { ...disabledPolicy.ios, enabled: true, storeReleaseAvailable: true } } as const;
let result!: ReturnType<typeof useMinimumAppVersion>;
let tree: renderer.ReactTestRenderer | undefined;
let onState!: (state: string) => void;
const remove = jest.fn();
const originalDev = __DEV__;
const originalOS = Platform.OS;
const originalVersion = Platform.Version;
function Harness() { result = useMinimumAppVersion(); return null; }
async function mount() { await act(async () => { tree = renderer.create(<Harness />); }); }
beforeEach(() => {
  (global as any).__DEV__ = false;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: '18.0' });
  (Updates as any).channel = 'production';
  (Application as any).nativeApplicationVersion = '1.1.10';
  fetchPolicy.mockReset().mockResolvedValue(activePolicy);
  remove.mockReset();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    onState = listener as (state: string) => void;
    return { remove };
  });
});
afterEach(async () => {
  if (tree) await act(async () => { tree?.unmount(); });
  tree = undefined;
  jest.restoreAllMocks();
  (global as any).__DEV__ = originalDev;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: originalVersion });
});
test('checks native version despite a higher OTA runtime', async () => {
  await mount();
  expect(result.minimumVersion).toBe('1.1.20');
  expect(result.checking).toBe(false);
});
test.each(['preview', 'development', null])('never fetches on channel %s', async (channel) => {
  (Updates as any).channel = channel;
  await mount();
  expect(fetchPolicy).not.toHaveBeenCalled();
  expect(result.minimumVersion).toBeNull();
});
test('returning from the store refreshes a blocked policy immediately', async () => {
  await mount();
  fetchPolicy.mockResolvedValue(disabledPolicy);
  await act(async () => { onState('inactive'); onState('active'); });
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
  expect(result.minimumVersion).toBeNull();
});
test('ordinary foreground activity is throttled', async () => {
  fetchPolicy.mockResolvedValue(disabledPolicy);
  await mount();
  await act(async () => { onState('inactive'); onState('active'); });
  expect(fetchPolicy).toHaveBeenCalledTimes(1);
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
  await act(async () => { onState('background'); onState('active'); });
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
});
test('manual retry bypasses throttle, releases an offline gate, and deduplicates requests', async () => {
  await mount();
  let finish!: (policy: null) => void;
  fetchPolicy.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  let first!: Promise<void>;
  let second!: Promise<void>;
  act(() => { first = result.check(); second = result.check(); });
  expect(first).toBe(second);
  expect(result.checking).toBe(true);
  expect(fetchPolicy).toHaveBeenCalledTimes(2);
  await act(async () => { finish(null); await first; });
  expect(result.minimumVersion).toBeNull();
  expect(result.checking).toBe(false);
});
test('missing native version never substitutes runtime or manifest', async () => {
  (Application as any).nativeApplicationVersion = null;
  await mount();
  expect(result.minimumVersion).toBeNull();
});
test('unmount aborts a pending request and removes foreground listener', async () => {
  fetchPolicy.mockImplementation(() => new Promise(() => {}));
  await mount();
  const signal = fetchPolicy.mock.calls[0][0] as AbortSignal;
  await act(async () => { tree?.unmount(); });
  tree = undefined;
  expect(signal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledTimes(1);
});
