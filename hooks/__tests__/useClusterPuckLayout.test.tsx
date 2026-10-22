import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { Cluster } from '../../types/events';
import { useClusterPuckLayout } from '../useClusterPuckLayout';

describe('native-projected cluster/puck separation', () => {
  let tree: renderer.ReactTestRenderer;
  let layout: ReturnType<typeof useClusterPuckLayout>;
  const clusters = Array.from({ length: 12 }, (_, i) => ({
    id: String(i), venues: [{ longitude: 0.001 * (i + 1), latitude: 0.001 * (i + 1) }],
  } as Cluster));
  const coordinateForCluster = (c: Cluster): [number, number] => [c.venues[0].longitude, c.venues[0].latitude];
  const map = { current: {
    getPointInView: jest.fn(async (p: number[]) => p[0] === 0 ? [200, 450] : [205, 455]),
    getCoordinateFromView: jest.fn(async (p: number[]) => [p[0] / 1000, p[1] / 1000]),
  } };
  function Probe({ enabled = true, items = clusters }: { enabled?: boolean; items?: Cluster[] }) {
    layout = useClusterPuckLayout({ map, clusters: items, userCoordinate: [0, 0], width: 390, height: 844, enabled, coordinateForCluster });
    return null;
  }
  const flush = async () => { await act(async () => { jest.advanceTimersByTime(121); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  beforeEach(() => {
    jest.useFakeTimers(); map.current.getPointInView.mockClear(); map.current.getCoordinateFromView.mockClear();
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 ? [200, 450] : [205, 455]);
    act(() => { tree = renderer.create(<Probe />); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

  it('caps native projection work and retains exact geographic anchors and cluster IDs', async () => {
    await flush();
    expect(map.current.getPointInView).toHaveBeenCalledTimes(9); // puck plus at most eight clusters
    expect(layout.offsets['0'].anchor).toEqual([0.001, 0.001]);
    expect(layout.offsets['0'].coordinate).not.toEqual(layout.offsets['0'].anchor);
    expect(clusters[0].venues[0].longitude).toBe(0.001);
  });
  it('clears displacement once native screen positions no longer collide', async () => {
    await flush(); expect(Object.keys(layout.offsets).length).toBeGreaterThan(0);
    map.current.getPointInView.mockImplementation(async p => p[0] === 0 ? [200, 450] : [20, 200]);
    act(() => layout.refresh()); await flush(); expect(layout.offsets).toEqual({});
  });
  it('does not restore stale results after blur/permissions disable the layout', async () => {
    const pending: ((value: number[]) => void)[] = [];
    map.current.getPointInView.mockImplementation(() => new Promise<number[]>(resolve => { pending.push(resolve); }));
    await flush(); act(() => { tree.update(<Probe enabled={false} />); });
    await flush(); expect(layout.offsets).toEqual({});
    expect(pending).toHaveLength(9);
    await act(async () => {
      pending.forEach(resolve => resolve([205, 455]));
      for (let i = 0; i < 30; i++) await Promise.resolve();
    });
    expect(layout.offsets).toEqual({});
  });
  it('uses only supplied eligible clusters after a filter change', async () => {
    const visible = [clusters[10]];
    act(() => { tree.update(<Probe items={visible} />); }); await flush();
    expect(Object.keys(layout.offsets)).toEqual(['10']);
    expect(map.current.getPointInView).toHaveBeenCalledTimes(2);
  });
});
