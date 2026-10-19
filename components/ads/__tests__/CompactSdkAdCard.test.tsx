import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';
import CompactSdkAdCard from '../CompactSdkAdCard';

const mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
const mockMounts: any[] = [];
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => 'light' }));
jest.mock('react-native-google-mobile-ads', () => {
  const React = jest.requireActual('react');
  return {
    NativeAdView: (props: any) => {
      const adAtMount = React.useRef(props.nativeAd);
      React.useEffect(() => { mockMounts.push(adAtMount.current); }, []);
      return React.createElement('sdk-ad-view', props, props.children);
    },
    NativeAsset: (props: any) => React.createElement('sdk-asset', props, props.children),
    NativeMediaView: (props: any) => React.createElement('sdk-media', props),
    NativeAssetType: { ICON: 'icon', HEADLINE: 'headline', ADVERTISER: 'advertiser', BODY: 'body', CALL_TO_ACTION: 'cta' },
  };
});

const ad = (id = 'A', ratio = 9 / 16) => ({
  responseId: id, headline: 'The Tower - Idle Tower Defense', advertiser: 'Tower games',
  body: 'Build Your Perfect Tower of Defense', callToAction: 'Install', icon: { url: 'https://example.invalid/icon' },
  mediaContent: { aspectRatio: ratio, hasVideoContent: true },
});
let tree: renderer.ReactTestRenderer | undefined;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const mount = (nativeAd: any, loading = false, allowMedia = true) => act(() => {
  tree = renderer.create(<CompactSdkAdCard nativeAd={nativeAd} loading={loading} allowMedia={allowMedia} />);
});
const sdkViews = () => tree!.root.findAllByType('sdk-ad-view' as any);
const nextFrame = () => act(() => {
  const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0));
});
const settle = () => { nextFrame(); nextFrame(); act(() => jest.advanceTimersByTime(60)); };
beforeEach(() => {
  jest.useFakeTimers(); jest.replaceProperty(Platform, 'OS', 'ios');
  frames = new Map(); frameId = 0; mockMounts.length = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback); return frameId;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount()); tree = undefined;
  jest.restoreAllMocks(); jest.useRealTimers();
});

it.each([9 / 16, 16 / 9, 0])('waits two frames plus 60ms before mounting one original SDK ad/media at ratio %s', ratio => {
  const nativeAd = ad('A', ratio); mount(nativeAd);
  expect(sdkViews()).toHaveLength(0); expect(mockMounts).toHaveLength(0);
  nextFrame(); expect(sdkViews()).toHaveLength(0);
  nextFrame(); act(() => jest.advanceTimersByTime(59)); expect(sdkViews()).toHaveLength(0);
  act(() => jest.advanceTimersByTime(1));
  expect(sdkViews()).toHaveLength(1); expect(sdkViews()[0].props.nativeAd).toBe(nativeAd);
  expect(mockMounts).toEqual([nativeAd]);
  expect(tree!.root.findAllByType('sdk-media' as any)).toHaveLength(1);
  expect(tree!.root.findAllByType('sdk-asset' as any)).toHaveLength(5);
});
it('measures the callout width during the skeleton and retains it for the shared portrait formatting', () => {
  const nativeAd = ad(); mount(nativeAd);
  const card = tree!.root.findAll(node => typeof node.props.onLayout === 'function')[0];
  act(() => card.props.onLayout({ nativeEvent: { layout: { width: 342 } } }));
  settle();
  const frame = tree!.root.findByProps({ testID: 'native-ad-media-frame' });
  const size = StyleSheet.flatten(frame.props.style);
  expect(size.width / size.height).toBeCloseTo(9 / 16);
  expect(size.width).toBeCloseTo((342 - 8) * 0.47);
  const disclosure = tree!.root.findByProps({ testID: 'native-ad-disclosure' });
  expect(StyleSheet.flatten(disclosure.props.style).position).toBe('absolute');
  expect(mockMounts).toEqual([nativeAd]);
});
it('never carries readiness from an old SDK object into a replacement ad', () => {
  const first = ad('A'); const second = ad('B', 16 / 9); mount(first); settle();
  act(() => tree!.update(<CompactSdkAdCard nativeAd={second} loading={false} />));
  expect(sdkViews()).toHaveLength(0); expect(mockMounts).toEqual([first]);
  settle(); expect(mockMounts).toEqual([first, second]);
  expect(sdkViews()[0].props.nativeAd).toBe(second);
});
it('cancels a pending ad when it changes or the component unmounts', () => {
  const first = ad('A'); const second = ad('B'); mount(first); nextFrame(); nextFrame();
  act(() => tree!.update(<CompactSdkAdCard nativeAd={second} loading={false} />));
  act(() => jest.advanceTimersByTime(60)); expect(mockMounts).toHaveLength(0);
  nextFrame(); nextFrame(); act(() => tree!.unmount()); tree = undefined;
  act(() => jest.advanceTimersByTime(100));
  expect(mockMounts).toHaveLength(0); expect(frames.size).toBe(0); expect(jest.getTimerCount()).toBe(0);
});
it('keeps loading and absent ads free of SDK views, assets and media', () => {
  const nativeAd = ad(); mount(nativeAd, true); settle();
  expect(sdkViews()).toHaveLength(0); expect(tree!.root.findAllByType('sdk-asset' as any)).toHaveLength(0);
  act(() => tree!.update(<CompactSdkAdCard nativeAd={null} loading={false} />));
  expect(tree!.toJSON()).toBeNull(); expect(mockMounts).toHaveLength(0);
});
it('mounts Android immediately and preserves disabled media without changing the ad object', () => {
  jest.replaceProperty(Platform, 'OS', 'android'); const nativeAd = ad(); mount(nativeAd, false, false);
  expect(sdkViews()[0].props.nativeAd).toBe(nativeAd);
  expect(tree!.root.findAllByType('sdk-media' as any)).toHaveLength(0);
  expect(frames.size).toBe(0); expect(mockMounts).toEqual([nativeAd]);
});
