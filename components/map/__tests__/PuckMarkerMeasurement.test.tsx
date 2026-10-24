import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { PuckMarkerMeasurement } from '../PuckMarkerMeasurement';
import { useClusterPuckLayout } from '../../../hooks/useClusterPuckLayout';
import type { Cluster } from '../../../types/events';

describe('native marker variant measurement', () => {
  it('records both native layouts and updates edge transforms without waiting for another layout event', () => {
    const record = jest.fn(); let tree!: renderer.ReactTestRenderer;
    const render = (compact: boolean, dockX = 0) => <PuckMarkerMeasurement id="city" compact={compact} countLabel="50" dockX={dockX} dockY={0} record={record}><Text>Full card</Text></PuckMarkerMeasurement>;
    act(() => { tree = renderer.create(render(false)); });
    const measured = tree.root.findAllByType(View).filter(v => v.props.onLayout);
    act(() => {
      measured[0].props.onLayout({ nativeEvent: { layout: { width: 140, height: 180 } } });
      measured[1].props.onLayout({ nativeEvent: { layout: { width: 36, height: 24 } } });
    });
    expect(record).toHaveBeenLastCalledWith('city', { bounds: { left: -70, right: 70, top: -180, bottom: 0 }, compactBounds: { left: -18, right: 18, top: -24, bottom: 0 }, dock: [0, 0] });
    const count = record.mock.calls.length;
    act(() => tree.update(render(true))); expect(record).toHaveBeenCalledTimes(count);
    const visible = tree.root.findAllByType(View).filter(v => v.props.onLayout);
    expect(visible[0].props.pointerEvents).toBe('none'); expect(visible[0].props.accessibilityElementsHidden).toBe(true);
    expect(visible[1].props.pointerEvents).toBe('auto'); expect(visible[1].props.accessibilityElementsHidden).toBe(false);
    act(() => tree.update(render(true, 12))); expect(record.mock.calls.at(-1)?.[1].dock).toEqual([12, 0]);
    act(() => tree.update(render(false, 12)));
    expect(tree.root.findAllByType(View).filter(v => v.props.onLayout)[0].props.pointerEvents).toBe('auto');
    act(() => tree.unmount());
  });
  it('settles compact→normal transitions without equal-layout feedback and remeasures changed count/font size', async () => {
    jest.useFakeTimers();
    const cluster = { id: 'city', venues: [{ longitude: 200, latitude: 390 }] } as Cluster;
    const clusters = [cluster]; const map = { current: { getPointInView: jest.fn(async (p: number[]) => p), getCoordinateFromView: jest.fn(async (p: number[]) => p) } };
    const getPuckSnapshot = () => ({ coordinate: [200, 300] as [number, number], bounds: { left: -12, right: 12, top: -12, bottom: 12 }, revision: 1 });
    const coordinateForCluster = () => [200, 390] as [number, number];
    let layout!: ReturnType<typeof useClusterPuckLayout>; let tree!: renderer.ReactTestRenderer;
    function Probe({ count = '50' }: { count?: string }) {
      layout = useClusterPuckLayout({ map, clusters, userCoordinate: [200, 300], width: 390, height: 844, enabled: true, coordinateForCluster, getPuckSnapshot });
      return <PuckMarkerMeasurement id="city" compact={!!layout.offsets.city?.compact} countLabel={count} dockX={0} dockY={0} record={layout.recordMarkerGeometry}><Text>Original card</Text></PuckMarkerMeasurement>;
    }
    const measure = (index: number, width: number, height: number) => tree.root.findAllByType(View).filter(v => v.props.onLayout)[index].props.onLayout({ nativeEvent: { layout: { width, height } } });
    const flush = async () => { await act(async () => { jest.advanceTimersByTime(81); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
    act(() => { tree = renderer.create(<Probe />); });
    act(() => { measure(0, 180, 180); measure(1, 36, 24); layout.onMapIdle(); }); await flush();
    expect(layout.offsets.city.compact).toBe(true);
    const calls = map.current.getPointInView.mock.calls.length;
    act(() => { measure(0, 180, 180); measure(1, 36, 24); }); await flush();
    expect(map.current.getPointInView).toHaveBeenCalledTimes(calls); expect(layout.offsets.city.compact).toBe(true);
    act(() => { tree.update(<Probe count="500" />); measure(1, 52, 90); });
    expect(layout.offsets).toEqual({}); await flush();
    expect(layout.offsets.city.compact).toBe(true);
    expect(map.current.getCoordinateFromView).toHaveBeenLastCalledWith([200, 406]);
    expect(tree.root.findByType(PuckMarkerMeasurement).props.countLabel).toBe('500');
    act(() => layout.onCameraChanged()); expect(layout.offsets).toEqual({});
    expect(tree.root.findByType(PuckMarkerMeasurement).props.compact).toBe(false);
    act(() => tree.unmount()); jest.useRealTimers();
  });
});
