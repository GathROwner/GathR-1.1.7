import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import HybridClusterMarker from '../HybridClusterMarker';
import type { Cluster } from '../../../types/events';

const mockInteractions = new Map([['a', { eventIds: [] }]]);
jest.mock('../../../store/clusterInteractionStore', () => ({
  useClusterInteractionStore: (selector: any) => selector({ interactions: mockInteractions }),
  getHasNewContent: (_key: string, ids: string[]) => ids.includes('new'),
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-svg', () => ({ __esModule: true, default: 'Svg', Circle: 'Circle', Line: 'Line' }));
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
  act(() => jest.advanceTimersByTime(6000));
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
  act(() => jest.advanceTimersByTime(6000));
  expect(tree.root.findAllByProps({ testID: 'hybrid-category-new' })).toHaveLength(0);
});

it('keeps venue detail and rotation for large overview clusters', () => {
  const cluster = fixture();
  cluster.venues = Array.from({ length: 126 }, (_, i) => ({ ...cluster.venues[i % 2], locationKey: String(i).padStart(3, '0') }));
  act(() => { tree = renderer.create(<HybridClusterMarker cluster={cluster} {...props} />); });
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-photo-ring')).toHaveLength(1);
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-venue-summary')).toHaveLength(1);
  expect(tree.root.findAllByType(View).filter(n => n.props.testID === 'hybrid-cluster-summary')).toHaveLength(1);
  act(() => jest.advanceTimersByTime(6000));
  expect(tree.root.findByProps({ testID: 'hybrid-cluster-marker' }).props.accessibilityLabel).toContain('Beta, venue 2 of 126');
});
