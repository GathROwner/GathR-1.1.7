import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import HybridSummaryImage from '../HybridSummaryImage';
import { clusterSummaryGraphic } from '../../../utils/hybridSummaryGraphic';

const mockExports: ((base64: string) => void)[] = [];
jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return { __esModule: true, SvgXml: 'SvgXml', default: React.forwardRef(function MockSvg(props: any, ref: any) {
    React.useImperativeHandle(ref, () => ({ toDataURL: (callback: (value: string) => void) => mockExports.push(callback) }));
    return React.createElement('Svg', props, props.children);
  }) };
});
let tree: renderer.ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); mockExports.length = 0; });

it('explicitly exports the complete SVG and refreshes Mapbox only after its PNG decodes', () => {
  const graphic = clusterSummaryGraphic(7, 32, 11, false), refresh = jest.fn();
  act(() => { tree = renderer.create(<HybridSummaryImage graphic={graphic} onLoad={refresh} />); });
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(tree.root.findByType('SvgXml' as any).props.xml).toContain('>32</text>');
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  expect(refresh).not.toHaveBeenCalled();
  act(() => mockExports[0]('complete-png\n'));
  const image = tree.root.findByType(Image);
  expect(image.props.source.uri).toBe('data:image/png;base64,complete-png');
  expect(image.props.fadeDuration).toBe(0);
  expect(tree.root.findAllByType('Svg' as any)).toHaveLength(0);
  act(() => image.props.onLoad()); expect(refresh).toHaveBeenCalledTimes(1);
});

it('rejects an old venue export completing after a newer summary is requested', () => {
  const old = clusterSummaryGraphic(8, 33, 12, false), next = clusterSummaryGraphic(9, 34, 13, false);
  act(() => { tree = renderer.create(<HybridSummaryImage graphic={old} />); });
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  act(() => tree.update(<HybridSummaryImage graphic={next} />));
  act(() => mockExports[0]('stale-png'));
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  act(() => mockExports[1]('current-png'));
  expect(tree.root.findByType(Image).props.source.uri).toContain('current-png');
});

it('measures a hidden badge without exporting pixels, then decodes and refreshes when it becomes visible', () => {
  const graphic = clusterSummaryGraphic(27, 41, 14, false), refresh = jest.fn();
  act(() => { tree = renderer.create(<HybridSummaryImage graphic={graphic} visible={false} onLoad={refresh} />); });
  expect(tree.root.findAllByType('Svg' as any)).toHaveLength(0); expect(tree.root.findAllByType(Image)).toHaveLength(0);
  expect(tree.toJSON()).toMatchObject({ props: { style: { width: graphic.width, height: graphic.height } } });
  act(() => tree.update(<HybridSummaryImage graphic={graphic} visible onLoad={refresh} />));
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  act(() => mockExports[0]('visible-count'));
  act(() => tree.root.findByType(Image).props.onLoad()); expect(refresh).toHaveBeenCalledTimes(1);
});

it('discards an export from a previous visibility cycle before it can poison the shared cache', () => {
  const graphic = clusterSummaryGraphic(28, 42, 15, false);
  act(() => { tree = renderer.create(<HybridSummaryImage graphic={graphic} />); });
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  act(() => tree.update(<HybridSummaryImage graphic={graphic} visible={false} />));
  act(() => tree.update(<HybridSummaryImage graphic={graphic} visible />));
  act(() => mockExports[0]('hidden-stale-count'));
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  act(() => tree.root.findByType('Svg' as any).props.onLayout());
  act(() => mockExports[1]('new-visible-count'));
  expect(tree.root.findByType(Image).props.source.uri).toContain('new-visible-count');
});

it('remounts a decoded image on reveal and ignores old decode callbacks across visibility changes', () => {
  const graphic = clusterSummaryGraphic(29, 43, 16, false), refresh = jest.fn();
  act(() => { tree = renderer.create(<HybridSummaryImage graphic={graphic} onLoad={refresh} />); });
  act(() => tree.root.findByType('Svg' as any).props.onLayout()); act(() => mockExports[0]('cached-visible-count'));
  const oldDecode = tree.root.findByType(Image).props.onLoad;
  act(() => tree.update(<HybridSummaryImage graphic={graphic} visible={false} onLoad={refresh} />));
  expect(tree.root.findAllByType(Image)).toHaveLength(0);
  act(() => tree.update(<HybridSummaryImage graphic={graphic} visible onLoad={refresh} />));
  act(() => oldDecode()); expect(refresh).not.toHaveBeenCalled();
  act(() => tree.root.findByType(Image).props.onLoad()); expect(refresh).toHaveBeenCalledTimes(1);
});
