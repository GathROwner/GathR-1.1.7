import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { startPuckLocationRead, usePuckLocationSnapshot, type PuckLocationRead } from '../usePuckLocationSnapshot';
import { useClusterPuckLayout } from '../useClusterPuckLayout';
import type { PuckLocationSample } from '../../utils/clusterPuckLayout';
import type { Cluster } from '../../types/events';

jest.mock('expo-location', () => ({ Accuracy: { Balanced: 3 }, watchPositionAsync: jest.fn(), getForegroundPermissionsAsync: jest.fn() }));

const sample = (timestamp = Date.now(), accuracy = 80): PuckLocationSample => ({ timestamp, coords: { longitude: -63.13, latitude: 46.24, accuracy } });

describe('foreground stationary puck snapshot refresh', () => {
  let tree: renderer.ReactTestRenderer;
  let state: ReturnType<typeof usePuckLocationSnapshot>;
  let layout: ReturnType<typeof useClusterPuckLayout>;
  let onAppState: (state: AppStateStatus) => void;
  let initial: PuckLocationSample;
  const startRead = jest.fn<PuckLocationRead, Parameters<typeof startPuckLocationRead>>();
  const clusters = [{ id: 'city', venues: [{ longitude: -63.129, latitude: 46.24 }] }] as Cluster[];
  const map = { current: { getPointInView: jest.fn(async (p: number[]) => p[0] === -63.13 ? [200, 300] : [210, 310]), getCoordinateFromView: jest.fn(async (p: number[]) => p) } };
  function Probe({ enabled = true, zoom = 8 }: { enabled?: boolean; zoom?: number }) {
    state = usePuckLocationSnapshot({ location: initial, enabled, zoom, startRead });
    layout = useClusterPuckLayout({ map, clusters, userCoordinate: [-63.13, 46.24], width: 390, height: 844, enabled: state.active, coordinateForCluster: () => [-63.129, 46.24], getPuckSnapshot: state.getPuckSnapshot, puckRevision: state.revision });
    return null;
  }
  const tick = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  const mount = () => {
    act(() => { tree = renderer.create(<Probe />); });
    act(() => { layout.recordMarkerBounds('city', { left: -20, right: 20, top: -24, bottom: 0 }); layout.onMapIdle(); });
  };
  beforeEach(() => {
    jest.useFakeTimers(); initial = sample();
    AppState.currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onAppState = listener; return { remove: jest.fn() }; });
    startRead.mockReset(); startRead.mockImplementation(() => ({ result: Promise.resolve(sample()), cancel: jest.fn() }));
    map.current.getPointInView.mockClear(); map.current.getCoordinateFromView.mockClear();
  });
  afterEach(() => { if (tree) act(() => tree.unmount()); jest.useRealTimers(); jest.restoreAllMocks(); });
  it('keeps a stationary count separated across multiple 30s expiry periods without movement updates', async () => {
    mount(); await tick(81); expect(layout.offsets.city).toBeDefined();
    const originalTimestamp = initial.timestamp;
    for (let i = 0; i < 5; i++) {
      await tick(20000); await tick(81);
      expect(layout.offsets.city).toBeDefined(); expect(state.getPuckSnapshot()).not.toBeNull();
    }
    expect(initial.timestamp).toBe(originalTimestamp); expect(startRead).toHaveBeenCalledTimes(5);
    expect(state.revision).toBeGreaterThan(originalTimestamp + 90000);
  });
  it('deduplicates idle requests, ignores stale camera projections and waits for the next idle', async () => {
    let resolve!: (value: PuckLocationSample | null) => void;
    startRead.mockImplementation(() => ({ result: new Promise(r => { resolve = r; }), cancel: jest.fn() }));
    mount(); await tick(20000);
    act(() => { for (let i = 0; i < 20; i++) { state.refreshIfNeeded(); layout.onCameraChanged(); } });
    expect(startRead).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(sample()); }); await tick(81);
    expect(layout.offsets).toEqual({}); act(() => layout.onMapIdle()); await tick(81);
    expect(layout.offsets.city).toBeDefined();
  });
  it('cancels background work and requires a fresh foreground sample, rejecting late old results', async () => {
    const jobs: { resolve: (v: PuckLocationSample | null) => void; cancel: jest.Mock }[] = [];
    startRead.mockImplementation(() => { let resolve!: (v: PuckLocationSample | null) => void; const result = new Promise<PuckLocationSample | null>(r => { resolve = r; }); const cancel = jest.fn(); jobs.push({ resolve, cancel }); return { result, cancel }; });
    mount(); await tick(81); await tick(20000); expect(jobs).toHaveLength(1);
    act(() => onAppState('background')); expect(jobs[0].cancel).toHaveBeenCalledTimes(1); expect(layout.offsets).toEqual({});
    await tick(60000); expect(jobs).toHaveLength(1);
    act(() => onAppState('active')); await tick(1); expect(jobs).toHaveLength(2); expect(state.getPuckSnapshot()).toBeNull();
    await act(async () => { jobs[0].resolve(sample()); }); expect(state.getPuckSnapshot()).toBeNull();
    await act(async () => { jobs[1].resolve(sample()); }); await tick(81);
    expect(state.getPuckSnapshot()).not.toBeNull(); expect(layout.offsets.city).toBeDefined();
  });
  it('bounds failed reads with retry delay, expires unsafe data, and recovers on a later successful read', async () => {
    startRead.mockImplementationOnce(() => ({ result: Promise.resolve(null), cancel: jest.fn() }));
    mount(); await tick(20000); expect(startRead).toHaveBeenCalledTimes(1);
    act(() => { for (let i = 0; i < 20; i++) state.refreshIfNeeded(); }); expect(startRead).toHaveBeenCalledTimes(1);
    await tick(9999); expect(startRead).toHaveBeenCalledTimes(1);
    await tick(1); await tick(81); expect(startRead).toHaveBeenCalledTimes(2); expect(layout.offsets.city).toBeDefined();
  });
  it('does not sample while disabled/close zoom and cancels pending work on unmount', async () => {
    const cancel = jest.fn(); startRead.mockReturnValue({ result: new Promise(() => {}), cancel });
    mount(); act(() => tree.update(<Probe enabled={false} />)); await tick(60000); expect(startRead).not.toHaveBeenCalled();
    act(() => tree.update(<Probe zoom={15} />)); await tick(60000); expect(startRead).not.toHaveBeenCalled();
    act(() => tree.update(<Probe />)); await tick(1); expect(startRead).toHaveBeenCalledTimes(1);
    act(() => tree.unmount()); expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('bounded cancellable native location read', () => {
  beforeEach(() => { jest.mocked(Location.watchPositionAsync).mockReset(); jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>); });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
  it('removes a subscription that arrives after cancellation and ignores late fixes', async () => {
    let resolveSubscription!: (v: Location.LocationSubscription) => void;
    const remove = jest.fn();
    jest.spyOn(Location, 'watchPositionAsync').mockImplementation(() => new Promise(r => { resolveSubscription = r; }));
    jest.useFakeTimers(); const read = startPuckLocationRead(() => true); await Promise.resolve(); read.cancel();
    await expect(read.result).resolves.toBeNull(); resolveSubscription({ remove }); await Promise.resolve();
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('waits for a current usable fix, then removes the native watcher', async () => {
    let update!: Location.LocationCallback;
    const remove = jest.fn();
    jest.spyOn(Location, 'watchPositionAsync').mockImplementation(async (_options, listener) => { update = listener; return { remove }; });
    jest.useFakeTimers(); const read = startPuckLocationRead(value => (value.coords.accuracy ?? Infinity) < 100);
    await Promise.resolve(); update(sample(Date.now() - 60000) as Location.LocationObject); expect(remove).not.toHaveBeenCalled();
    update(sample() as Location.LocationObject); await expect(read.result).resolves.toMatchObject({ timestamp: Date.now() }); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('times out and cleans up a native watcher that never produces a usable fix', async () => {
    const remove = jest.fn(); jest.spyOn(Location, 'watchPositionAsync').mockResolvedValue({ remove });
    jest.useFakeTimers(); const read = startPuckLocationRead(() => false); await Promise.resolve(); jest.advanceTimersByTime(8000);
    await expect(read.result).resolves.toBeNull(); expect(remove).toHaveBeenCalledTimes(1);
  });
  it('does not start a watcher or request permission when foreground permission has been revoked', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: false } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>);
    const read = startPuckLocationRead(() => true); await expect(read.result).resolves.toBeNull();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });
  it('does not start a late watcher if cancelled during the permission read', async () => {
    let resolvePermission!: (v: Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>) => void;
    jest.mocked(Location.getForegroundPermissionsAsync).mockReturnValue(new Promise(r => { resolvePermission = r; }));
    const read = startPuckLocationRead(() => true); read.cancel();
    await expect(read.result).resolves.toBeNull();
    resolvePermission({ granted: true } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>); await Promise.resolve();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });
});
