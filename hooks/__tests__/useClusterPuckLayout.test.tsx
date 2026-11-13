import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { Cluster } from '../../types/events';
import { useClusterPuckLayout, type PuckSnapshot } from '../useClusterPuckLayout';
import type { MapRect } from '../../utils/clusterPuckLayout';
import { puckDiagnosticSnapshot, startPuckDiagnostics, stopPuckDiagnostics } from '../../utils/puckDiagnostics';

describe('settled measured cluster/puck layout transaction', () => {
  let tree: renderer.ReactTestRenderer;
  let layout: ReturnType<typeof useClusterPuckLayout>;
  let snapshot: PuckSnapshot;
  const clusters = Array.from({ length: 12 }, (_, i) => ({ id: String(i), venues: [{ longitude: 0.001 * (i + 1), latitude: 0.001 }] } as Cluster));
  const coordinateForCluster = (c: Cluster): [number, number] => [c.venues[0].longitude, c.venues[0].latitude];
  const map = { current: { getPointInView: jest.fn<Promise<number[]>, [number[]]>(), getCoordinateFromView: jest.fn<Promise<number[]>, [number[]]>() } };
  const getPuckSnapshot = jest.fn(() => snapshot);
  function Probe({ enabled = true, revision = 0, available = true, items = clusters, safeViewport }: { enabled?: boolean; revision?: number; available?: boolean; items?: Cluster[]; safeViewport?: MapRect }) {
    layout = useClusterPuckLayout({ map, clusters: items, userCoordinate: snapshot.coordinate, width: 390, height: 844, enabled, coordinateForCluster, getPuckSnapshot: available ? getPuckSnapshot : undefined, puckRevision: revision, safeViewport });
    return null;
  }
  const flush = async () => { await act(async () => { jest.advanceTimersByTime(81); for (let i = 0; i < 40; i++) await Promise.resolve(); }); };
  const microtasks = async () => { await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); }); };
  const idle = async () => { act(() => layout.onMapIdle()); await flush(); };
  beforeEach(() => {
    jest.useFakeTimers(); snapshot = { coordinate: [0, 0], bounds: { left: -12, right: 12, top: -12, bottom: 12 }, revision: 0 };
    getPuckSnapshot.mockClear(); map.current.getPointInView.mockReset(); map.current.getCoordinateFromView.mockReset();
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 ? [200, 450] : p[0] === 0.001 ? [210, 460] : [1000 * p[0] + 400, 200]);
    map.current.getCoordinateFromView.mockImplementation(async p => [p[0] / 1000, p[1] / 1000]);
    act(() => { tree = renderer.create(<Probe />); });
    act(() => { for (const c of clusters) layout.recordMarkerBounds(c.id, { left: -20, right: 20, top: -24, bottom: 0 }); });
  });
  afterEach(() => { act(() => tree.unmount()); stopPuckDiagnostics(); jest.useRealTimers(); });
  it('observes the actual callbacks without triggering placement and reports only committed displacement', async () => {
    startPuckDiagnostics(); await flush(); expect(map.current.getPointInView).not.toHaveBeenCalled();
    await idle(); expect(puckDiagnosticSnapshot()).toMatchObject({ attempts: 1, currentOffsets: 1, idles: 1 });
    expect(puckDiagnosticSnapshot().chosen?.event).toBe('committed-move');
    expect(puckDiagnosticSnapshot().chosen?.values.dy).toBeDefined();
    act(() => layout.onCameraChanged()); expect(puckDiagnosticSnapshot().chosen).toBeNull(); expect(puckDiagnosticSnapshot().currentOffsets).toBe(0);
  });
  it('never reports a proposed displacement as committed after reverse projection is invalid', async () => {
    startPuckDiagnostics(); map.current.getCoordinateFromView.mockResolvedValue([NaN, NaN]); await idle();
    expect(layout.offsets).toEqual({}); expect(puckDiagnosticSnapshot().chosen).toBeNull();
    expect(puckDiagnosticSnapshot().rows.some(row => row.event === 'invalid-reverse')).toBe(true);
    expect(puckDiagnosticSnapshot().rows.some(row => row.values.dx != null || row.values.dy != null)).toBe(false);
  });
  it('keeps pre-capture placement unknown until a real callback without changing the map', async () => {
    await idle(); expect(layout.offsets['0']).toBeDefined(); const calls = map.current.getPointInView.mock.calls.length;
    startPuckDiagnostics(); await flush();
    expect(puckDiagnosticSnapshot().currentOffsets).toBeNull(); expect(layout.offsets['0']).toBeDefined();
    expect(map.current.getPointInView).toHaveBeenCalledTimes(calls);
    act(() => layout.onCameraChanged()); expect(puckDiagnosticSnapshot().currentOffsets).toBe(0);
    await idle(); expect(puckDiagnosticSnapshot().currentOffsets).toBe(1);
    stopPuckDiagnostics(); startPuckDiagnostics(); expect(puckDiagnosticSnapshot().currentOffsets).toBeNull(); expect(layout.offsets['0']).toBeDefined();
  });
  it('requires a settled camera and actual measured bounds before projecting', async () => {
    await flush(); expect(map.current.getPointInView).not.toHaveBeenCalled();
    await idle(); expect(layout.offsets['0'].anchor).toEqual([0.001, 0.001]); expect(map.current.getPointInView).toHaveBeenCalledTimes(9);
  });
  it('clears the offset and leader immediately on zoom/pan, before any async completion', async () => {
    await idle(); expect(layout.offsets['0']).toBeDefined();
    act(() => layout.onCameraChanged()); expect(layout.offsets).toEqual({});
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 ? [200, 450] : [20, 200]);
    await idle(); expect(layout.offsets).toEqual({});
  });
  it('rejects an old forward projection during repeated camera moves', async () => {
    const pending: ((value: number[]) => void)[] = [];
    map.current.getPointInView.mockImplementation(() => new Promise<number[]>(resolve => pending.push(resolve)));
    await idle(); expect(pending).toHaveLength(9);
    act(() => { for (let i = 0; i < 20; i++) layout.onCameraChanged(); });
    pending.forEach(resolve => resolve([210, 460])); await microtasks();
    expect(layout.offsets).toEqual({}); expect(map.current.getCoordinateFromView).not.toHaveBeenCalled();
  });
  it('rejects a stale reverse projection and commits only the next settled camera', async () => {
    let resolveOld!: (value: number[]) => void;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise<number[]>(resolve => { resolveOld = resolve; }));
    await idle(); expect(resolveOld).toBeDefined(); act(() => layout.onCameraChanged());
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 ? [200, 450] : [20, 200]);
    await idle(); resolveOld([99, 99]); await microtasks(); expect(layout.offsets).toEqual({});
  });
  it('rejects a changed puck snapshot even without a delivered camera event', async () => {
    let resolveOld!: (value: number[]) => void;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise<number[]>(resolve => { resolveOld = resolve; }));
    await idle(); snapshot = { ...snapshot, coordinate: [1, 1], revision: 1 };
    resolveOld([0.2, 0.4]); await microtasks(); expect(layout.offsets).toEqual({});
  });
  it('rejects provider snapshots mutated in place while projection is pending', async () => {
    let resolveOld!: (value: number[]) => void;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise<number[]>(resolve => { resolveOld = resolve; }));
    await idle(); snapshot.coordinate[0] = 1; snapshot.bounds.right = 18;
    resolveOld([0.2, 0.4]); await microtasks(); expect(layout.offsets).toEqual({});
  });
  it('uses the measured compact count when the full card needs a long jump', async () => {
    act(() => layout.recordMarkerGeometry('0', { bounds: { left: -90, right: 90, top: -90, bottom: 90 }, compactBounds: { left: -12, right: 12, top: -24, bottom: 0 }, dock: [0, 0] }));
    await idle();
    expect(layout.offsets['0'].compact).toBe(true);
    expect(map.current.getCoordinateFromView).toHaveBeenCalledWith([228, 460]);
  });
  it('tests the currently docked visible bounds, not the undocked anchor', async () => {
    act(() => layout.recordMarkerGeometry('0', { bounds: { left: -20, right: 20, top: -24, bottom: 0 }, dock: [40, 0] }));
    await idle(); expect(layout.offsets['0']).toBeUndefined();
  });
  it('includes docking exactly once and bounds the complete leader distance', async () => {
    act(() => layout.recordMarkerGeometry('0', { bounds: { left: -20, right: 20, top: -24, bottom: 0 }, dock: [-10, 0] }));
    await idle(); expect(map.current.getCoordinateFromView).toHaveBeenCalledWith([200, 434]);
    expect(Math.hypot(200 - 210, 434 - 460)).toBeLessThanOrEqual(48);
  });
  it('chooses a bounded alternative inside the control-free viewport', async () => {
    act(() => tree.update(<Probe safeViewport={{ left: 8, right: 60, top: 100, bottom: 800 }} />));
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 || p[0] === 0.001 ? [30, 120] : [500, 500]);
    await idle(); expect(map.current.getCoordinateFromView).toHaveBeenCalledWith([30, 160]);
  });
  it('clears a committed offset when its location sample expires without another event', async () => {
    snapshot.validUntil = Date.now() + 500; await idle(); expect(layout.offsets['0']).toBeDefined();
    await act(async () => { jest.advanceTimersByTime(420); }); expect(layout.offsets).toEqual({});
  });
  it('never commits a sample that expires during projection', async () => {
    let resolveOld!: (value: number[]) => void;
    snapshot.validUntil = Date.now() + 500;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise<number[]>(resolve => { resolveOld = resolve; }));
    await idle(); act(() => jest.advanceTimersByTime(500)); resolveOld([0.2, 0.4]);
    await microtasks(); expect(layout.offsets).toEqual({});
  });
  it('invalidates synchronously on location, font/layout, permission and filter changes', async () => {
    await idle(); expect(layout.offsets['0']).toBeDefined();
    act(() => { snapshot = { ...snapshot, revision: 1 }; tree.update(<Probe revision={1} />); }); expect(layout.offsets).toEqual({});
    await flush(); expect(layout.offsets['0']).toBeDefined();
    act(() => layout.recordMarkerBounds('0', { left: -25, right: 25, top: -30, bottom: 0 })); expect(layout.offsets).toEqual({});
    await flush(); act(() => tree.update(<Probe enabled={false} />)); expect(layout.offsets).toEqual({});
    act(() => tree.update(<Probe items={[]} />)); await flush(); expect(layout.offsets).toEqual({});
  });
  it('does not invent puck coordinates/bounds when the native snapshot is unavailable', async () => {
    act(() => tree.update(<Probe available={false} />)); await idle();
    expect(layout.offsets).toEqual({}); expect(map.current.getPointInView).not.toHaveBeenCalled();
  });
  it('ignores unchanged layout', async () => {
    await idle(); const count = map.current.getPointInView.mock.calls.length;
    act(() => layout.recordMarkerBounds('0', { left: -20, right: 20, top: -24, bottom: 0 })); await flush();
    expect(map.current.getPointInView).toHaveBeenCalledTimes(count);
  });
  it('ignores a genuinely pending reverse projection after unmount', async () => {
    let resolveOld!: (value: number[]) => void;
    map.current.getCoordinateFromView.mockImplementationOnce(() => new Promise<number[]>(resolve => { resolveOld = resolve; }));
    await idle(); expect(resolveOld).toBeDefined(); expect(getPuckSnapshot).toHaveBeenCalledTimes(1);
    act(() => tree.unmount()); resolveOld([0.2, 0.4]); await microtasks();
    expect(layout.offsets).toEqual({}); expect(getPuckSnapshot).toHaveBeenCalledTimes(1);
  });
});
