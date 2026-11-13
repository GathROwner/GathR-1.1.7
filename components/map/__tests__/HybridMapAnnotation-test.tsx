import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import HybridMapAnnotation from '../HybridMapAnnotation';
import type { Cluster } from '../../../types/events';

const mockRefresh = jest.fn();
const mockNativeMount = jest.fn();
jest.mock('@rnmapbox/maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, default: {
    PointAnnotation: React.forwardRef(function MockPointAnnotation(props: any, ref: any) {
      React.useImperativeHandle(ref, () => ({ refresh: mockRefresh }));
      React.useEffect(() => { mockNativeMount(); }, []);
      return React.createElement('PointAnnotation', props, props.children);
    }), ShapeSource: 'ShapeSource', CircleLayer: 'CircleLayer',
  } };
});
jest.mock('../HybridClusterMarker', () => 'HybridGraphics');
const cluster = { id: 'one', eventCount: 3, specialCount: 2, venues: [], timeStatus: 'now' } as unknown as Cluster;
const base = { id: 'point-one', cluster, coordinate: [-63.1, 46.2] as [number, number], isSelected: false, isReady: true,
  isProcessing: false, disabled: false, isActive: false, reduceMotionEnabled: false, compact: false,
  dockX: 0, dockY: 0, measurementDockX: 0, measurementDockY: 0, record: jest.fn(), categoryIcon: () => 'event' };
let tree: renderer.ReactTestRenderer;
let press: jest.Mock, background: jest.Mock;
const point = () => tree.root.findByType('PointAnnotation' as any);
const graphics = () => tree.root.findByType('HybridGraphics' as any);
const render = (extra = {}) => <HybridMapAnnotation {...base} onPress={press} onBackgroundPress={background} {...extra} />;
beforeEach(() => {
  jest.useFakeTimers(); mockRefresh.mockClear(); mockNativeMount.mockClear(); press = jest.fn(); background = jest.fn();
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => setTimeout(() => callback(0), 16) as unknown as number);
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => clearTimeout(id));
  act(() => { tree = renderer.create(render()); });
});
afterEach(() => { act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });

it('uses a native map graphic without a view annotation or touch/responder handlers', () => {
  expect(point().props.draggable).toBe(false);
  expect(graphics().props.snapshotMode).toBe(true);
  expect(tree.root.findAllByType('MarkerView' as any)).toHaveLength(0);
  expect(tree.root.findAll(n => (n.type === View || typeof n.type === 'string') && (n.props.onTouchStart || n.props.onResponderGrant || n.props.onPress || n.props.onDragStart))).toHaveLength(0);
  expect(tree.root.findAllByType(View).find(v => v.props.onLayout)?.props.pointerEvents).toBe('none');
});

it('routes only native completed selection to the existing cluster action and preserves gates', () => {
  act(() => point().props.onSelected()); expect(press).toHaveBeenCalledTimes(1);
  act(() => tree.update(render({ disabled: true })));
  expect(mockNativeMount).toHaveBeenCalledTimes(1);
  act(() => point().props.onSelected()); expect(press).toHaveBeenCalledTimes(1);
  expect(mockNativeMount).toHaveBeenCalledTimes(2);
  act(() => tree.update(render({ isSelected: true })));
  act(() => point().props.onSelected()); expect(press).toHaveBeenCalledTimes(1);
});

it('closes through the existing background path only for native map-background deselection', () => {
  act(() => point().props.onDeselected({ properties: {} }));
  expect(background).not.toHaveBeenCalled();
  act(() => point().props.onDeselected({ properties: { deselectAnnotationOnMapTap: true } }));
  expect(background).toHaveBeenCalledTimes(1);
});

it('refreshes the bitmap after native layout and decoded/rotated graphics, coalescing requests', () => {
  act(() => jest.advanceTimersByTime(32)); mockRefresh.mockClear();
  act(() => { graphics().props.onSnapshotChange(); graphics().props.onSnapshotChange(); });
  act(() => jest.advanceTimersByTime(31)); expect(mockRefresh).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1)); expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('aligns the native halo with the rounded snapshot and viewport docking', () => {
  act(() => tree.update(render({ dockX: 12, dockY: -4 })));
  act(() => {
    tree.root.findAllByType(View).find(v => v.props.onLayout)!.props.onLayout({ nativeEvent: { layout: { width: 102, height: 106.5 } } });
    graphics().props.onPhotoLayout({ y: 25, height: 50.4 });
  });
  expect(point().props.anchor.x).toBeCloseTo(39 / 104);
  expect(point().props.anchor.y).toBeCloseTo(110.5 / 108);
  const halo = tree.root.findByType('CircleLayer' as any).props.style;
  expect(halo.circleTranslate[0]).toBe(12); expect(halo.circleTranslate[1]).toBeCloseTo(-60.3);
});

it('animates native paint rather than rerasterizing photos and stops for reduced motion', () => {
  act(() => { tree.update(render({ isActive: true })); graphics().props.onPhotoLayout({ y: 25, height: 50.4 }); });
  act(() => jest.advanceTimersByTime(80));
  const halo = () => tree.root.findByType('CircleLayer' as any).props.style;
  expect(halo().circleRadiusTransition.duration).toBe(1600);
  expect(halo().circleStrokeOpacity).toBe(0);
  const count = mockRefresh.mock.calls.length;
  act(() => jest.advanceTimersByTime(2800)); expect(mockRefresh).toHaveBeenCalledTimes(count);
  act(() => tree.update(render({ isActive: true, reduceMotionEnabled: true })));
  expect(halo().circleStrokeOpacity).toBe(.25); expect(halo().circleRadiusTransition.duration).toBe(0);
});
