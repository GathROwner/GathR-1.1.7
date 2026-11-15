import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, View } from 'react-native';
import HybridClusterMarker from '../HybridClusterMarker';
import type { Cluster } from '../../../types/events';

const mockInteractions = new Map([['a', { eventIds: [] }]]);
jest.mock('../../../store/clusterInteractionStore', () => ({
  useClusterInteractionStore: (selector: any) => selector({ interactions: mockInteractions }),
  getHasNewContent: (_key: string, ids: string[]) => ids.includes('new'),
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', SvgXml: 'SvgXml', Circle: 'Circle', Line: 'Line' }));
const fixture = () => ({ id: 'cluster', timeStatus: 'future', interestLevel: 'medium', eventCount: 3, specialCount: 1,
  venues: [{ locationKey: 'a', venue: 'Alpha', events: [{ id: 'new', type: 'event', category: 'Music', profileUrl: '' }] },
    { locationKey: 'b', venue: 'Beta', events: [{ id: 'b1', type: 'event', category: 'Trivia', profileUrl: '' }, { id: 'b2', type: 'event', category: 'Trivia', profileUrl: '' }] }],
  friendPresence: { friendCount: 2, venues: { a: { friendCount: 2 } } },
} as unknown as Cluster);
const props = { isActive: true, isSelected: false, isReady: true, isProcessing: false, reduceMotionEnabled: false, categoryIcon: () => 'audiotrack' };
let tree: renderer.ReactTestRenderer;
beforeEach(() => jest.useFakeTimers());
afterEach(() => { if (tree) act(() => tree.unmount()); jest.useRealTimers(); });

it('rotates venue and category together while summary ring/totals stay fixed', () => {
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={fixture()} {...props} />); });
  const summary = () => tree.root.findByProps({ testID: 'hybrid-cluster-summary' });
  const strokes = () => summary().findAllByType('Circle' as any).map(n => n.props.stroke);
  const before = strokes();
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Alpha');
  act(() => jest.advanceTimersByTime(2999));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Alpha');
  act(() => jest.advanceTimersByTime(1));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Beta');
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Trivia 2');
  expect(strokes()).toEqual(before);
  expect(tree.root.findAllByType(View).filter(n => n.props.accessibilityLabel === '2 friends at Alpha')).toHaveLength(1);
  expect(tree.root.findAll(n => typeof n.props.onPress === 'function')).toHaveLength(0);
});

it('stops rotation with reduced motion and selected callouts', () => {
  const cluster = fixture();
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} reduceMotionEnabled />); });
  act(() => jest.advanceTimersByTime(12000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Alpha');
  act(() => tree.update(<HybridClusterMarker cluster={cluster} {...props} isSelected />));
  act(() => jest.advanceTimersByTime(12000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Alpha');
});

it('marks the specific new category and removes the dot for another venue', () => {
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={fixture()} {...props} />); });
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-category-new')).toHaveLength(1);
  act(() => jest.advanceTimersByTime(3000));
  expect(tree.root.findAllByProps({ testID: 'hybrid-category-new' })).toHaveLength(0);
});

it('keeps venue detail and rotation for large overview clusters', () => {
  const cluster = fixture();
  cluster.venues = Array.from({ length: 126 }, (_, i) => ({ ...cluster.venues[i % 2], locationKey: String(i).padStart(3, '0') }));
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} />); });
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-photo-ring')).toHaveLength(1);
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-venue-summary')).toHaveLength(1);
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-cluster-summary')).toHaveLength(1);
  act(() => jest.advanceTimersByTime(3000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Beta, venue 2 of 126');
});

it('keeps 19 venue segments and moves only the selected arc, using a bounded number of drawing nodes', () => {
  const cluster = fixture();
  cluster.venues = Array.from({ length: 19 }, (_, i) => ({ ...cluster.venues[i % 2], locationKey: String(i).padStart(3, '0') }));
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} snapshotMode />); });
  const arcs = () => tree.root.findByProps({ testID: 'hybrid-photo-ring' }).findAllByType('Circle' as any);
  expect(arcs()).toHaveLength(2);
  const base = arcs()[0].props;
  const [dash, gap] = base.strokeDasharray.split(' ').map(Number);
  expect(2 * Math.PI * base.r / (dash + gap)).toBeCloseTo(19);
  expect(gap).toBeGreaterThan(0);
  const selected = arcs()[1].props.strokeDashoffset;
  const summary = tree.root.findByProps({ testID: 'hybrid-cluster-summary' }).findByType('SvgXml' as any).props.xml;
  act(() => jest.advanceTimersByTime(3000));
  expect(arcs()[0].props).toEqual(base);
  expect(arcs()[1].props.strokeDashoffset).toBeCloseTo(selected - dash - gap);
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-summary' }).findByType('SvgXml' as any).props.xml).toBe(summary);
});

it('refreshes the map bitmap after profile decoding without snapshotting an image fade', () => {
  const cluster = fixture(); cluster.venues[0].events[0].profileUrl = 'https://example.com/profile.jpg';
  const refresh = jest.fn();
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} snapshotMode onSnapshotChange={refresh} />); });
  refresh.mockClear();
  const photo = tree.root.findByType(Image);
  expect(photo.props.fadeDuration).toBe(0);
  act(() => photo.props.onLoad()); expect(refresh).toHaveBeenCalledTimes(1);
  act(() => jest.advanceTimersByTime(3000)); expect(refresh).toHaveBeenCalledTimes(2);
});

it('exports rotating venue details and fixed cluster totals without detached native text/icon views', () => {
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={fixture()} {...props} snapshotMode />); });
  const xml = () => tree.root.findAllByType('SvgXml' as any).map(n => n.props.xml as string);
  const before = xml();
  expect(before.some(value => value.includes('>3</text>') && value.includes('>1</text>'))).toBe(true);
  expect(tree.root.findAllByType('MaterialIcons' as any)).toHaveLength(0);
  act(() => jest.advanceTimersByTime(3000));
  const after = xml();
  expect(after[0]).not.toEqual(before[0]);
  expect(after[after.length - 1]).toEqual(before[before.length - 1]);
});

it('keeps the entire rotation envelope fixed with differently sized category summaries and thinner photo arcs', () => {
  const cluster = fixture();
  cluster.venues[1].events.push({ ...cluster.venues[1].events[0], id: 'other', category: 'Food', type: 'special' });
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} snapshotMode />); });
  const marker = () => tree.root.findByProps({ testID: 'hybrid-cluster-marker' });
  const before = marker().props.style;
  const arcs = tree.root.findByProps({ testID: 'hybrid-photo-ring' }).findAllByType('Circle' as any);
  expect(arcs[0].props.strokeWidth).toBe(3.15);
  expect(arcs[0].props.r - arcs[0].props.strokeWidth / 2).toBeCloseTo(18);
  act(() => jest.advanceTimersByTime(3000));
  expect(marker().props.style).toEqual(before);
});

it('pauses a hidden full marker and remounts its graphics when returning from the compact badge', () => {
  const cluster = fixture(); cluster.venues.forEach(v => v.events.forEach(e => { e.profileUrl = 'https://example.com/profile.jpg'; }));
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} snapshotMode />); });
  act(() => jest.advanceTimersByTime(3000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Beta');
  act(() => tree.update(<HybridClusterMarker cluster={cluster} {...props} snapshotMode snapshotVisible={false} />));
  expect(tree.root.findAllByType(Image)).toHaveLength(0); expect(tree.root.findAllByType('Svg' as any)).toHaveLength(0);
  act(() => jest.advanceTimersByTime(9000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Beta');
  act(() => tree.update(<HybridClusterMarker cluster={cluster} {...props} snapshotMode snapshotVisible />));
  expect(tree.root.findAllByType(Image)).toHaveLength(1); expect(tree.root.findAllByType('Svg' as any).length).toBeGreaterThan(0);
});
