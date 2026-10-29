import React from 'react';
import { AccessibilityInfo, AppState, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { Event } from '../../../types/events';
import ListingVideoButton from '../ListingVideoButton';
import { listingVideoAutoplay } from '../../../lib/listingVideoAutoplay';

const mockGetVideo = jest.fn();
let mockVideoY = 200;
const mockPreferences = { autoplay: true, hydrated: true };
jest.mock('../../../store/listingVideoPrefsStore', () => ({ useListingVideoPrefs: (selector: any) => selector(mockPreferences) }));
jest.mock('../../../lib/listingVideo', () => {
  const original = jest.requireActual('../../../lib/listingVideo');
  return { ...original, getListingVideo: (...args: unknown[]) => mockGetVideo(...args) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 12, left: 0, right: 0 }) }));
jest.mock('react-native-webview', () => ({ WebView: 'MockWebView' }));
jest.mock('@expo/vector-icons/Ionicons', () => 'MockIcon');
const media = { assetId: 'a'.repeat(64), url: `https://storage.googleapis.com/gathr-uploaded-images/listingvideos/${'a'.repeat(64)}.mp4`,
  bytes: 2000, durationSeconds: 12, expiresAt: '2099-01-01T00:00:00Z', sourcePostId: '123' };
const event = { id: 'fb_offer', venueId: 'pub', source: 'firestore', title: 'Halloween drinks' } as Event;
describe('listing video playback lifecycle', () => {
  jest.setTimeout(15000);
  let tree: ReactTestRenderer; let originalAppState = AppState.currentState;
  beforeEach(() => { originalAppState = AppState.currentState; mockVideoY = 200; AppState.currentState = 'active'; mockPreferences.autoplay = true; mockPreferences.hydrated = true; listingVideoAutoplay.replay(media.assetId); jest.spyOn(View.prototype as any, 'measureInWindow').mockImplementation((...args: any[]) => args[0](0, mockVideoY, 390, 260)); jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false); });
  afterEach(() => { if (tree) act(() => tree.unmount()); jest.restoreAllMocks(); AppState.currentState = originalAppState; });
  it('loads no player until a tap, stops propagation and unmounts on close', async () => {
    mockGetVideo.mockResolvedValue(media);
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    expect(tree!.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    const stopPropagation = jest.fn();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalled();
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(1);
    act(() => tree.root.findByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: 'playing' } }));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Expand video for Halloween drinks' }).props.onPress({ stopPropagation }));
    expect(tree.root.findByType('MockWebView' as any).props.testID).toBe('listing-fullscreen-video');
    act(() => tree.root.findByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: 'dismiss' } }));
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
  });
  it('stops playback when backgrounded and falls back to the photo on player failure', async () => {
    mockGetVideo.mockResolvedValue(media); let onChange: any;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { onChange = listener; return { remove: jest.fn() }; });
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => tree.root.findByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: 'playing' } }));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Expand video for Halloween drinks' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => onChange('background'));
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => onChange('active'));
    act(() => tree.root.findByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: 'playing' } }));
    act(() => tree.root.findByProps({ accessibilityLabel: 'Expand video for Halloween drinks' }).props.onPress({ stopPropagation: jest.fn() }));
    act(() => tree.root.findByType('MockWebView' as any).props.onError());
    expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
    expect(tree.toJSON()).toBeNull();
  });
  it('shows the poster for one settled second, renders one inline player, and restores Replay after real end', async () => {
    jest.useFakeTimers(); const previousState = AppState.currentState; AppState.currentState = 'active';
    mockGetVideo.mockResolvedValue(media);
    try {
      await act(async () => { tree = create(<ListingVideoButton event={event} />, { createNodeMock: () => ({ measureInWindow: (f: any) => f(0, 200, 390, 260), injectJavaScript: jest.fn() }) }); });
      expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      act(() => jest.advanceTimersByTime(999)); expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      act(() => jest.advanceTimersByTime(251)); expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(1);
      const player = tree.root.findByType('MockWebView' as any);
      act(() => player.props.onMessage({ nativeEvent: { data: 'playing' } }));
      expect(tree.root.findByProps({ accessibilityLabel: 'Pause video' })).toBeTruthy();
      const source = player.props.source;
      act(() => tree.root.findByProps({ accessibilityLabel: 'Pause video' }).props.onPress({ stopPropagation: jest.fn() }));
      expect(tree.root.findByProps({ accessibilityLabel: 'Resume video' })).toBeTruthy();
      expect(tree.root.findByType('MockWebView' as any).props.source).toBe(source);
      act(() => jest.advanceTimersByTime(250));
      expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(1);
      act(() => tree.root.findByProps({ accessibilityLabel: 'Resume video' }).props.onPress({ stopPropagation: jest.fn() }));
      act(() => player.props.onMessage({ nativeEvent: { data: 'ended' } }));
      expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      const replay = tree.root.findByProps({ accessibilityLabel: 'Replay video for Halloween drinks, 12 seconds' });
      act(() => replay.props.onPress({ stopPropagation: jest.fn() }));
      expect(tree.root.findByType('MockWebView' as any).props.testID).toBe('listing-inline-video');
      expect(tree.root.findAllByProps({ testID: 'listing-fullscreen-video' })).toHaveLength(0);
    } finally { AppState.currentState = previousState; jest.useRealTimers(); }
  });
  it('keeps the completed poster until scrolling away and then autoplays when the card returns', async () => {
    jest.useFakeTimers(); mockGetVideo.mockResolvedValue(media);
    try {
      await act(async () => { tree = create(<ListingVideoButton event={event} />); });
      act(() => jest.advanceTimersByTime(1250));
      act(() => tree.root.findByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: 'ended' } }));
      act(() => jest.advanceTimersByTime(2000)); expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      mockVideoY = 3000; act(() => jest.advanceTimersByTime(250));
      mockVideoY = 200; act(() => jest.advanceTimersByTime(1250));
      expect(tree.root.findByType('MockWebView' as any).props.testID).toBe('listing-inline-video');
    } finally { jest.useRealTimers(); }
  });
  it('does not autoplay while preference hydration is incomplete or reduced motion is enabled', async () => {
    jest.useFakeTimers(); const previousState = AppState.currentState; AppState.currentState = 'active'; mockGetVideo.mockResolvedValue(media);
    mockPreferences.hydrated = false;
    try {
      await act(async () => { tree = create(<ListingVideoButton event={event} />, { createNodeMock: () => ({ measureInWindow: (f: any) => f(0, 200, 390, 260) }) }); });
      act(() => jest.advanceTimersByTime(5000)); expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      act(() => tree.unmount()); mockPreferences.hydrated = true;
      jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
      await act(async () => { tree = create(<ListingVideoButton event={event} />, { createNodeMock: () => ({ measureInWindow: (f: any) => f(0, 200, 390, 260) }) }); });
      act(() => jest.advanceTimersByTime(5000)); expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(0);
      act(() => tree.root.findByProps({ accessibilityLabel: 'Watch video for Halloween drinks, 12 seconds' }).props.onPress({ stopPropagation: jest.fn() }));
      expect(tree.root.findAllByType('MockWebView' as any)).toHaveLength(1);
    } finally { AppState.currentState = previousState; jest.useRealTimers(); }
  });
  it('does not render a control when no approved video exists', async () => {
    mockGetVideo.mockResolvedValue(null);
    await act(async () => { tree = create(<ListingVideoButton event={event} />); });
    expect(tree!.toJSON()).toBeNull();
  });
});
