import React from 'react';
import { Modal } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';
import { transformSync } from '@babel/core';
import { useMapStore } from '../../../store/mapStore';
import { useClusterInteractionStore } from '../../../store/clusterInteractionStore';
import { amplitudeTrack } from '../../../lib/amplitudeAnalytics';
import { getTrendingLightboxImageUrl, resolveTrendingEventContext } from '../../../utils/trendingLightbox';
import { shouldLoopGlobalLightbox } from '../../../utils/lightboxNavigation';
import { actualLightboxControls } from './helpers/actualLightboxControls';
import type { Event, Cluster } from '../../../types/events';

jest.mock('../../../store/mapStore', () => ({ useMapStore: jest.requireActual('zustand').create((set: any) => ({
  selectedImageData: null, selectedCluster: null, selectedVenues: [], clusters: [], setSelectedImageData: (data: any) => set({ selectedImageData: data }),
})) }));
jest.mock('../../../store/clusterInteractionStore', () => ({ useClusterInteractionStore: { getState: () => ({ markCarouselEventViewed: jest.fn() }) } }));
jest.mock('../../../lib/amplitudeAnalytics', () => ({ amplitudeTrack: jest.fn() }));

const compile = (source: string) => transformSync(source, { filename: 'ActualAreaHost.tsx', configFile: false, babelrc: false,
  presets: [require.resolve('@babel/preset-typescript'), [require.resolve('@babel/preset-react'), { runtime: 'classic' }]],
})!.code!;
const instantiate = (source: string, result: string) => new Function('React', 'Modal', 'useEffect', 'useRef', 'useCallback',
  'usePathname', 'isFriendEventDetailPath', 'useMapStore', 'useClusterInteractionStore', 'amplitudeTrack',
  'getTrendingLightboxImageUrl', 'resolveTrendingEventContext', 'shouldLoopGlobalLightbox', 'EventImageLightbox',
  compile(source) + ';return ' + result + ';')(
  React, Modal, React.useEffect, React.useRef, React.useCallback, () => '/qa', () => false, useMapStore, useClusterInteractionStore,
  amplitudeTrack, getTrendingLightboxImageUrl, resolveTrendingEventContext, shouldLoopGlobalLightbox, 'StandardLightbox',
);
const mapSource = fs.readFileSync(path.join(process.cwd(), 'app/(tabs)/map.tsx'), 'utf8');
const globalStart = mapSource.indexOf('const GlobalEventLightbox = (');
const globalEnd = mapSource.indexOf('\nconst CalloutTutorialOverlayHost', globalStart);
if (globalStart < 0 || globalEnd < globalStart) throw Error('Actual global host missing');
const GlobalHost = instantiate(mapSource.slice(globalStart, globalEnd), 'GlobalEventLightbox');

// Evaluate EventCallout's actual ownership bindings, navigation callback and lightbox JSX.
// Omit the unrelated native callout/map UI; do not invent its lightbox props.
const calloutSource = fs.readFileSync(path.join(process.cwd(), 'components/map/EventCallout.tsx'), 'utf8');
const bindingsStart = calloutSource.indexOf('const globalSelectedImageDataRaw =');
const bindingsEnd = calloutSource.indexOf('// Helper function to get updated event data', bindingsStart);
const jsxStart = calloutSource.indexOf('<EventImageLightbox', calloutSource.indexOf('Render the lightbox modal when needed'));
const jsxEnd = calloutSource.indexOf('/>', jsxStart) + 2;
if (bindingsStart < 0 || bindingsEnd < bindingsStart || jsxStart < 0 || jsxEnd < jsxStart) throw Error('Actual native callout host missing');
const CalloutHost = instantiate(`const NativeCalloutHost = ({local = null, onShowRoute}) => {
  const selectedImageData = local;
  const handleModalClose = () => {};
  const handleLocalLightboxNavigate = () => {};
  const handleShowRoute = onShowRoute;
  ${calloutSource.slice(bindingsStart, bindingsEnd)}
  if (!globalSelectedImageData && !selectedImageData) return null;
  return (${calloutSource.slice(jsxStart, jsxEnd)});
};`, 'NativeCalloutHost');

const roots = Array.from({ length: 3 }, (_, i) => ({ id: 'area_root_' + i, title: 'Area festival ' + i, type: 'event', category: 'Community',
  venue: 'Charlottetown', locationScope: 'area', locationLabel: 'Charlottetown', locationCity: 'Charlottetown',
  imageUrl: 'https://example.com/root-' + i + '.jpg', mediaUrls: ['https://example.com/gallery-' + i + '.jpg'],
  areaData: { version: 1, status: 'verified', locations: Array.from({ length: 8 + i }, (_, n) => ({ id: 'location_' + n,
    label: 'Location ' + n, certainty: 'confirmed', coordinates: { latitude: 46.23, longitude: -63.12 } })) },
} as Event));
const cluster = { id: 'area_cluster', venues: roots.map((event, i) => ({ locationKey: 'area_venue_' + i, venue: 'Charlottetown', events: [event] })) } as Cluster;
const selection = (count: number, source: any = 'city_event_marker') => ({ imageUrl: roots[0].imageUrl!, event: roots[0],
  venue: cluster.venues[0], cluster, events: roots.slice(0, count), currentIndex: 0, source });
let tree: renderer.ReactTestRenderer;
const props = () => tree.root.findByType('StandardLightbox' as any).props;
beforeEach(() => useMapStore.setState({ selectedImageData: null, selectedCluster: null, selectedVenues: [], clusters: [cluster] }));
afterEach(() => { if (tree) act(() => tree.unmount()); });

describe.each([['global fallback', GlobalHost], ['native callout owner', CalloutHost]] as const)('%s area overview', (owner, Host) => {
  it('keeps a single parent event stationary for arrows and swipes', () => {
    act(() => { useMapStore.setState({ selectedImageData: selection(1), selectedCluster: owner === 'native callout owner' ? cluster : null });
      tree = renderer.create(<Host onShowRoute={() => {}} />); });
    act(() => { const controls = actualLightboxControls(props());
      expect(controls.arrow(-1)).toBe(false); expect(controls.arrow(1)).toBe(false);
      controls.swipe(-1); controls.swipe(1);
    });
    expect(props().event).toBe(roots[0]);
    expect(props().events).toHaveLength(1);
    expect(props().currentIndex).toBe(0);
  });
  it.each([[2, 'arrow'], [3, 'arrow'], [2, 'swipe'], [3, 'swipe']] as const)(
    'wraps %i parent events through actual %s controls, preserving IDs/order/media/locations', (count, gesture) => {
      const data = selection(count), showRoute = jest.fn();
      act(() => { useMapStore.setState({ selectedImageData: data, selectedCluster: owner === 'native callout owner' ? cluster : null });
        tree = renderer.create(<Host onShowRoute={showRoute} />); });
      expect(props().calloutPaging ?? false).toBe(false);
      expect(props().isCityEvent).toBe(true);
      expect(props().onShowRoute).toBeDefined();
      const navigate = (direction: -1 | 1) => {
        act(() => { const controls = actualLightboxControls(props());
          if (gesture === 'arrow') expect(controls.arrow(direction)).toBe(true);
          else controls.swipe(direction);
        });
      };
      for (let cycle = 0; cycle < 2; cycle++) {
        navigate(-1);
        expect(props().event).toBe(roots[count - 1]);
        expect(props().currentIndex).toBe(count - 1);
        expect(props().venue.locationKey).toBe('area_venue_' + (count - 1));
        expect(props().imageUrl).toBe(getTrendingLightboxImageUrl(roots[count - 1]));
        navigate(1);
        expect(props().event).toBe(roots[0]);
        expect(props().currentIndex).toBe(0);
        expect(props().events).toBe(data.events);
        expect(props().events.map((event: Event) => event.id)).toEqual(data.events.map(event => event.id));
        expect(props().event.areaData.locations).toHaveLength(8);
        expect(props().event.mediaUrls).toBe(roots[0].mediaUrls);
        expect(useMapStore.getState().selectedImageData?.source).toBe('city_event_marker');
      }
    },
  );
  it.each(['deep_link', 'route_summary', 'friend_presence', 'friend_event_resume'] as const)(
    'keeps unrelated %s navigation finite for arrows and swipes', source => {
      act(() => { useMapStore.setState({ selectedImageData: selection(3, source) }); tree = renderer.create(<Host onShowRoute={() => {}} />); });
      act(() => { expect(actualLightboxControls(props()).arrow(-1)).toBe(false); actualLightboxControls(props()).swipe(-1); });
      expect(props().currentIndex).toBe(0);
      act(() => props().onNavigate(2));
      act(() => { expect(actualLightboxControls(props()).arrow(1)).toBe(false); actualLightboxControls(props()).swipe(1); });
      expect(props().currentIndex).toBe(2);
    },
  );
});

it('does not let the fallback host duplicate the native callout-owned area overlay', () => {
  act(() => { useMapStore.setState({ selectedImageData: selection(2), selectedCluster: cluster });
    tree = renderer.create(<GlobalHost onShowRoute={() => {}} />); });
  expect(tree.toJSON()).toBeNull();
});

it('retains local venue callout paging and its finite loop policy', () => {
  act(() => { tree = renderer.create(<CalloutHost local={selection(3)} onShowRoute={() => {}} />); });
  expect(props().calloutPaging).toBe(true);
  expect(props().loopNavigation ?? false).toBe(false);
});
