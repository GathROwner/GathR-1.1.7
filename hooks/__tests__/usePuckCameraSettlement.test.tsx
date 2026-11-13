import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { Cluster } from '../../types/events';
import { useClusterPuckLayout } from '../useClusterPuckLayout';
import { puckDiagnosticSnapshot, startPuckDiagnostics, stopPuckDiagnostics } from '../../utils/puckDiagnostics';

describe('real camera callback sequence without native map idle', () => {
  let tree: renderer.ReactTestRenderer;
  let layout: ReturnType<typeof useClusterPuckLayout>;
  let shift: number;
  const items = [{ id: 'one', venues: [{ longitude: .01, latitude: .01 }] }] as Cluster[];
  const coordinateForCluster = (): [number, number] => [.01, .01];
  const snapshot = { coordinate: [0, 0] as [number, number], bounds: { left: -14, right: 14, top: -14, bottom: 14 }, revision: 1 };
  const forward = async (p: number[]) => [200 + p[0] * 1000 + shift, 300 + p[1] * 1000];
  const reverse = async (p: number[]) => [(p[0] - 200 - shift) / 1000, (p[1] - 300) / 1000];
  const map = { current: { getPointInView: jest.fn(forward), getCoordinateFromView: jest.fn(reverse) } };
  const getPuckSnapshot = jest.fn<typeof snapshot | Promise<typeof snapshot>, []>(() => snapshot);
  function Probe({ enabled = true }: { enabled?: boolean }) {
    layout = useClusterPuckLayout({ map, clusters: items, coordinateForCluster, userCoordinate: snapshot.coordinate, width: 390, height: 844, enabled, getPuckSnapshot });
    return null;
  }
  const tick = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 40; i++) await Promise.resolve(); }); };
  const settle = async () => { await tick(251); await tick(16); await tick(16); await tick(81); };
  const camera = (active = false) => act(() => layout.onCameraChanged({ gestures: { isGestureActive: active } }));
  beforeEach(() => {
    jest.useFakeTimers(); shift = 0;
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => setTimeout(() => callback(Date.now()), 16) as unknown as number);
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(handle => clearTimeout(handle));
    map.current.getPointInView.mockReset().mockImplementation(forward);
    map.current.getCoordinateFromView.mockReset().mockImplementation(reverse);
    getPuckSnapshot.mockReset().mockReturnValue(snapshot);
    act(() => { tree = renderer.create(<Probe />); });
    act(() => layout.recordMarkerBounds('one', { left: -20, right: 20, top: -24, bottom: 0 }));
    startPuckDiagnostics();
  });
  afterEach(() => { act(() => tree.unmount()); stopPuckDiagnostics(); jest.restoreAllMocks(); jest.useRealTimers(); });
  it('does not treat elapsed time alone as idle, but verifies a quiet native camera', async () => {
    await settle(); expect(layout.offsets).toEqual({}); expect(map.current.getCoordinateFromView).not.toHaveBeenCalled();
    camera(); await settle();
    expect(layout.offsets.one).toBeDefined();
    expect(puckDiagnosticSnapshot()).toMatchObject({ idles: 0, verifiedCameras: 1, attempts: 1, currentOffsets: 1 });
  });
  it('waits for every map touch to end, including a late cached active-gesture event', async () => {
    act(() => layout.onMapTouchStart(2)); camera(true); await settle(); expect(layout.offsets).toEqual({});
    act(() => layout.onMapTouchEnd(1)); await settle(); expect(map.current.getCoordinateFromView).not.toHaveBeenCalled();
    act(() => layout.onMapTouchEnd(0)); camera(true); await settle(); expect(layout.offsets.one).toBeDefined();
  });
  it('does not interpret cancellation or a cached active gesture as release', async () => {
    act(() => layout.onMapTouchStart()); camera(true); act(() => layout.onMapTouchCancel()); await settle();
    expect(map.current.getCoordinateFromView).not.toHaveBeenCalled(); expect(layout.offsets).toEqual({});
    camera(false); await settle(); expect(layout.offsets.one).toBeDefined();
  });
  it('never starts verification during continued camera movement', async () => {
    for (let i = 0; i < 8; i++) { shift += .5; camera(); await tick(100); }
    expect(map.current.getCoordinateFromView).not.toHaveBeenCalled(); expect(layout.offsets).toEqual({});
    await settle(); expect(layout.offsets.one).toBeDefined();
  });
  it('rejects native camera drift even if its camera callback has not arrived', async () => {
    camera(); await tick(251); await tick(16); shift = 10; await tick(16); await tick(81);
    expect(layout.offsets).toEqual({}); expect(puckDiagnosticSnapshot().verifiedCameras).toBe(0);
    await settle(); expect(layout.offsets.one).toBeDefined(); // no new native callback is needed
  });
  it('recovers a transient native read error, but bounds persistent failures', async () => {
    map.current.getCoordinateFromView.mockRejectedValueOnce(new Error('transient'));
    camera(); await settle(); expect(layout.offsets).toEqual({}); await settle(); expect(layout.offsets.one).toBeDefined();
    map.current.getCoordinateFromView.mockRejectedValue(new Error('unavailable')); camera();
    for (let i = 0; i < 10; i++) await settle();
    const reads = map.current.getCoordinateFromView.mock.calls.length;
    await tick(10000); expect(map.current.getCoordinateFromView).toHaveBeenCalledTimes(reads); expect(layout.offsets).toEqual({});
  });
  it('discards verification in flight when a newer camera generation arrives', async () => {
    let resolveOld!: (value: number[]) => void;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    camera(); await tick(251); shift = 20; camera(); resolveOld([-.1025, -.089]); await tick(0);
    expect(layout.offsets).toEqual({}); await settle(); expect(layout.offsets.one).toBeDefined();
    expect(puckDiagnosticSnapshot().verifiedCameras).toBe(1);
  });
  it('checks native camera agreement again after a pending reverse projection', async () => {
    let resolveOld!: (value: number[]) => void; let reads = 0;
    map.current.getCoordinateFromView.mockImplementation(p => ++reads === 5 ? new Promise(resolve => { resolveOld = resolve; }) : reverse(p));
    camera(); await settle(); expect(resolveOld).toBeDefined(); shift = 20;
    resolveOld([.01, -.02]); await tick(0); expect(layout.offsets).toEqual({});
    expect(puckDiagnosticSnapshot().currentOffsets).toBe(0);
  });
  it('lets a real native idle cancel an in-flight fallback rather than commit twice', async () => {
    camera(); await tick(251); act(() => layout.onMapIdle()); await tick(81);
    expect(layout.offsets.one).toBeDefined(); expect(puckDiagnosticSnapshot()).toMatchObject({ idles: 1, attempts: 1, verifiedCameras: 0 });
  });
  it('rechecks the camera after an asynchronous final location snapshot', async () => {
    let resolveLocation!: (value: typeof snapshot) => void;
    getPuckSnapshot.mockReturnValueOnce(snapshot).mockImplementationOnce(() => new Promise(resolve => { resolveLocation = resolve; }));
    camera(); await settle(); expect(resolveLocation).toBeDefined(); shift = 20;
    resolveLocation(snapshot); await tick(0); expect(layout.offsets).toEqual({});
    await settle(); expect(layout.offsets.one).toBeDefined();
  });
  it('recovers an error in the final proof, with no further camera event', async () => {
    let reads = 0;
    map.current.getPointInView.mockImplementation(p => ++reads === 7 ? Promise.reject(new Error('transient final proof')) : forward(p));
    camera(); await settle(); expect(layout.offsets).toEqual({});
    await settle(); expect(layout.offsets.one).toBeDefined();
  });
  it('bounds repeated final-proof failures instead of endlessly retrying', async () => {
    let reads = 0;
    map.current.getPointInView.mockImplementation(p => ++reads % 10 === 7 ? Promise.reject(new Error('persistent final proof')) : forward(p));
    camera(); for (let i = 0; i < 10; i++) await settle();
    expect(layout.offsets).toEqual({}); expect(reads).toBeLessThanOrEqual(30);
    const count = reads; await tick(10000); expect(reads).toBe(count);
  });
  it('cancels pending work on disabled context and unmount', async () => {
    camera(); await tick(251); act(() => tree.update(<Probe enabled={false} />)); await tick(2000); expect(layout.offsets).toEqual({});
    act(() => tree.update(<Probe />)); camera(); act(() => tree.unmount()); const calls = map.current.getPointInView.mock.calls.length;
    await tick(2000); expect(map.current.getPointInView).toHaveBeenCalledTimes(calls);
  });
});
