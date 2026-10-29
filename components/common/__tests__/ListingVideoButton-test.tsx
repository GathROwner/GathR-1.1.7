import React from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Event } from '../../../types/events';

const mockGetVideo = jest.fn();
jest.mock('../../../lib/listingVideo', () => {
  const original = jest.requireActual('../../../lib/listingVideo');
  return { ...original, getListingVideo: (...args: unknown[]) => mockGetVideo(...args) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 12, left: 0, right: 0 }) }));
jest.mock('react-native-webview', () => ({ WebView: 'MockWebView' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'MockIcon');
import ListingVideoButton from '../ListingVideoButton';
const media = { assetId: 'a'.repeat(64), url: `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${'a'.repeat(64)}.mp4`,
  bytes: 2000, durationSeconds: 12, expiresAt: '2099-01-01T00:00:00Z', sourcePostId: '123' };
const event = { id: 'fb_offer', venueId: 'pub', source: 'firestore', title: 'Halloween drinks' } as Event;
describe('listing video playback lifecycle', () => {
  jest.setTimeout(15000);
  let tree: ReactTestRenderer;
  afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); });
  it('loads no player until a tap, stops propagation and unmounts on close', async () => {
    mockGetVideo.mockResolvedValue(media);
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    expect(tree!.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    const stopPropagation = jest.fn();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalled();
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(1);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Close video' }).props.onPress());
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
  });
  it('stops playback when backgrounded and falls back to the photo on player failure', async () => {
    mockGetVideo.mockResolvedValue(media); let onChange: any;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onChange = listener; return { remove: jest.fn() }; });
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => onChange('background'));
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => tree.root.findByType('MockWebView' as any).props.onError());
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    expect(tree.toJSON()).toBeNull();
  });
  it('does not render a control when no approved video exists', async () => {
    mockGetVideo.mockResolvedValue(null);
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    expect(tree!.toJSON()).toBeNull();
  });
});
