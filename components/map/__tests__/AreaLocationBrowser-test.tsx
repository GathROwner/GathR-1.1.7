import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Event } from '../../../types/events';
import AreaLocationBrowser from '../AreaLocationBrowser';

jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) }));
jest.mock('@expo/vector-icons/MaterialIcons', () => 'Icon');
jest.mock('../../../hooks/useEventTimingMinute', () => ({ useEventTimingMinute: () => 0 }));
jest.mock('../../common/FallbackImage', () => 'Poster');
jest.mock('../EventImageLightbox', () => 'StandardLightbox');
jest.mock('../../../store/mapStore', () => ({ useMapStore: { setState: jest.fn() } }));

const venue = { id: 'tivoli', label: 'Tivoli', venueId: 'tivoli', certainty: 'confirmed' as const,
  coordinates: { latitude: 46.23, longitude: -63.12 }, linkedEventIds: ['film', 'second'] };
const group = { id: 'shared', coordinates: venue.coordinates, locations: [venue,
  { ...venue, id: 'dali', label: 'Dali', venueId: 'dali', linkedEventIds: [] }] };
const umbrella = { id: 'festival', title: 'Anchor Fest', startDate: '2040-10-14', endDate: '2040-10-18', startTime: '', endTime: '' } as Event;
const film = { id: 'fb_film', type: 'event', title: 'Film One', venue: 'Tivoli', venueId: 'tivoli', category: 'Cinema',
  startDate: '2040-10-16', endDate: '2040-10-16', startTime: '19:00', endTime: '21:00' } as Event;
const second = { ...film, id: 'fb_second', title: 'Film Two', startTime: '22:00', endTime: '23:00' };
const pump = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); }); };
let tree: renderer.ReactTestRenderer;
let client: QueryClient;
const load = jest.fn();
const close = jest.fn();
async function mount() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  act(() => { tree = renderer.create(<QueryClientProvider client={client}><AreaLocationBrowser umbrella={umbrella} group={group}
    loadEvent={load} onClose={close} /></QueryClientProvider>); });
  await pump();
}
const press = async (label: string) => {
  await act(async () => { tree.root.findByProps({ accessibilityLabel: label }).props.onPress(); });
  await pump();
};
beforeEach(() => { load.mockReset(); close.mockReset(); load.mockImplementation(async (id) => String(id).includes('second') ? second : film); });
afterEach(() => { act(() => tree?.unmount()); client?.clear(); });

it('requires choosing a co-located venue and fetches only its exact IDs', async () => {
  await mount();
  expect(load).not.toHaveBeenCalled();
  await press('View festival activities at Tivoli');
  expect(load.mock.calls.map((call) => call[0])).toEqual(['film', 'second']);
  expect(JSON.stringify(tree.toJSON())).toContain('Film One');
  expect(JSON.stringify(tree.toJSON())).toContain('Film Two');
});
it('opens the canonical standard lightbox and closes back to the same programme', async () => {
  await mount(); await press('View festival activities at Tivoli');
  const row = tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Open Film One'))[0];
  await act(async () => { row.props.onPress(); }); await pump();
  const lightbox = tree.root.findByType('StandardLightbox' as any);
  expect(lightbox.props.event.id).toBe('fb_film'); expect(lightbox.props.calloutPaging).toBe(true);
  act(() => lightbox.props.onNavigate(1));
  expect(tree.root.findByType('StandardLightbox' as any).props.event.id).toBe('fb_second');
  act(() => tree.root.findByType('StandardLightbox' as any).props.onClose());
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Film Two'); expect(close).not.toHaveBeenCalled();
});
it('does not open a detail that moved venues after the list loaded', async () => {
  await mount(); await press('View festival activities at Tivoli');
  load.mockResolvedValue({ ...film, venueId: 'other' });
  const row = tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Open Film One'))[0];
  await act(async () => { row.props.onPress(); }); await pump();
  expect(tree.root.findAllByType('StandardLightbox' as any)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain('Could not confirm this activity');
});
it('keeps a known venue with no links as location context without fabricating a schedule', async () => {
  await mount(); await press('View festival activities at Dali');
  expect(load).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('No linked activities available');
});
