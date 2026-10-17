import React from 'react';
import { Modal } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import { transformSync } from '@babel/core';
import { useMapStore } from '../../../store/mapStore';
import { useClusterInteractionStore } from '../../../store/clusterInteractionStore';
import { amplitudeTrack } from '../../../lib/amplitudeAnalytics';
import { openTrendingLightbox, getTrendingLightboxImageUrl, resolveTrendingEventContext } from '../../../utils/trendingLightbox';
import { getAdjacentLightboxIndex, shouldLoopGlobalLightbox } from '../../../utils/lightboxNavigation';
import type { Event, Cluster } from '../../../types/events';

jest.mock('../../../store/mapStore', () => ({ useMapStore: jest.requireActual('zustand').create((set: any) => ({
  selectedImageData: null, selectedCluster: null, selectedVenues: [], clusters: [], setSelectedImageData: (data: any) => set({ selectedImageData: data }),
})) }));
jest.mock('../../../store/clusterInteractionStore', () => ({ useClusterInteractionStore: { getState: () => ({ markCarouselEventViewed: jest.fn() }) } }));
jest.mock('../../../lib/amplitudeAnalytics', () => ({ amplitudeTrack: jest.fn() }));

// Evaluate the actual host body without importing/mounting MapScreen or Mapbox.
// This tests the real caller wiring, not a fixture that manually enables looping.
const source = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/map.tsx'), 'utf8');
const start = source.indexOf('const GlobalEventLightbox = (');
const end = source.indexOf('\nconst CalloutTutorialOverlayHost', start);
if (start < 0 || end < start) throw Error('Production global lightbox host not found');
const body = transformSync(source.slice(start, end), { filename: 'GlobalEventLightbox.tsx', configFile: false, babelrc: false,
  presets: [require.resolve('@babel/preset-typescript'), [require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
})!.code!;
const GlobalHost = new Function('React', 'Modal', 'useEffect', 'useRef', 'useCallback', 'usePathname', 'isFriendEventDetailPath',
  'useMapStore', 'useClusterInteractionStore', 'amplitudeTrack', 'getTrendingLightboxImageUrl', 'resolveTrendingEventContext', 'shouldLoopGlobalLightbox', 'EventImageLightbox',
  body + '; return GlobalEventLightbox;')(
  React, Modal, React.useEffect, React.useRef, React.useCallback, () => '/qa', () => false, useMapStore,
  useClusterInteractionStore, amplitudeTrack,
  getTrendingLightboxImageUrl, resolveTrendingEventContext, shouldLoopGlobalLightbox, 'StandardLightbox',
);
const events = Array.from({ length: 3 }, (_, i) => ({ id: 'qa_global_' + i, title: 'Event ' + i, type: 'event',
  category: 'Live Music', venueId: 'venue_' + i, venue: 'Venue ' + i, imageUrl: 'https://example.com/' + i + '.jpg' } as Event));
const clusters = events.map(event => ({ id: event.id, venues: [{ locationKey: event.venueId, venue: event.venue, events: [event] }] } as Cluster));
let tree: renderer.ReactTestRenderer;
const props = () => tree.root.findByType('StandardLightbox' as any).props;
beforeEach(() => { useMapStore.setState({ selectedImageData: null, selectedCluster: null, selectedVenues: [], clusters }); });
afterEach(() => { if (tree) act(() => tree.unmount()); });

it.each([['manual', 2], ['auto', 2], ['manual', 3], ['auto', 3]] as const)(
  'wraps both boundaries through the actual %s Trending entry for %i source events', (mode, count) => {
    const list = events.slice(0, count);
    act(() => { openTrendingLightbox(list, mode); tree = renderer.create(<GlobalHost onShowRoute={() => {}} />); });
    expect(props().isTrending).toBe(true);
    expect(props().events.map((event: Event) => event.id)).toEqual(list.map(event => event.id));
    // Resolve the same destination used by the real lightbox arrows and swipe handler.
    const last = getAdjacentLightboxIndex(props().currentIndex, count, -1, props().loopNavigation);
    expect(last).toBe(count - 1);
    act(() => props().onNavigate(last));
    expect(props().event.id).toBe(list[count - 1].id);
    expect(props().venue.locationKey).toBe(list[count - 1].venueId);
    const first = getAdjacentLightboxIndex(props().currentIndex, count, 1, props().loopNavigation);
    expect(first).toBe(0);
    act(() => props().onNavigate(first));
    expect(props().event.id).toBe(list[0].id);
    expect(useMapStore.getState().selectedImageData?.source).toBe('trending_' + mode);
    act(() => props().onClose());
    expect(useMapStore.getState().selectedImageData).toBeNull();
  },
);

it.each(['deep_link', 'route_summary', 'friend_presence', 'friend_event_resume'] as const)(
  'preserves bounded navigation for unrelated %s callers', source => {
    act(() => { useMapStore.getState().setSelectedImageData({ imageUrl: events[0].imageUrl!, event: events[0], events, currentIndex: 0, source });
      tree = renderer.create(<GlobalHost onShowRoute={() => {}} />); });
    expect(getAdjacentLightboxIndex(props().currentIndex, 3, -1, props().loopNavigation)).toBeNull();
    act(() => props().onNavigate(2));
    expect(getAdjacentLightboxIndex(props().currentIndex, 3, 1, props().loopNavigation)).toBeNull();
    expect(props().event.id).toBe(events[2].id);
  },
);

it('keeps Trending navigation valid while viewport clusters temporarily lack destination context', () => {
  act(() => { openTrendingLightbox(events, 'manual'); tree = renderer.create(<GlobalHost onShowRoute={() => {}} />); });
  act(() => useMapStore.setState({ clusters: [] }));
  act(() => props().onNavigate(2));
  expect(props().event.id).toBe(events[2].id);
  expect(props().events).toHaveLength(3);
});
