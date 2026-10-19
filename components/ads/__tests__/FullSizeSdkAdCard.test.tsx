import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import FullSizeSdkAdCard from '../FullSizeSdkAdCard';

let mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 };
let mockTheme = 'light';
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => mockDimensions }));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockTheme }));
jest.mock('react-native-google-mobile-ads', () => {
  const React = jest.requireActual('react');
  return ({
  NativeAdView: (props: any) => React.createElement('sdk-ad-view', props, props.children),
  NativeAsset: (props: any) => React.createElement('sdk-asset', props, props.children),
  NativeMediaView: (props: any) => React.createElement('sdk-media', props),
  NativeAssetType: { ICON: 'icon', HEADLINE: 'headline', ADVERTISER: 'advertiser', BODY: 'body', CALL_TO_ACTION: 'cta' },
  });
});

const ad = (ratio: number, video = true) => ({
  responseId: 'fixture-response', headline: 'Discover local dining', advertiser: 'Local dining',
  body: 'Find great food and welcoming patios near you.', callToAction: 'Learn more',
  icon: { url: 'https://example.invalid/icon.png' }, mediaContent: { aspectRatio: ratio, hasVideoContent: video },
});
let tree: renderer.ReactTestRenderer;
beforeEach(() => { mockTheme = 'light'; mockDimensions = { width: 390, height: 844, scale: 3, fontScale: 1 }; });
afterEach(() => { if (tree) act(() => tree.unmount()); });
const mount = (nativeAd: any, allowMedia = true) => act(() => { tree = renderer.create(<FullSizeSdkAdCard nativeAd={nativeAd} loading={false} allowMedia={allowMedia} />); });
const frame = () => tree.root.findByProps({ testID: 'native-ad-media-frame' });
const mediaNode = () => tree.root.findByType('sdk-media' as any);
const cardFrame = () => tree.root.findByProps({ testID: 'native-ad-card-frame' });
const renderedOrder = (node: any): string[] => !node ? [] : Array.isArray(node)
  ? node.flatMap(renderedOrder) : typeof node === 'string' ? [node]
  : [node.type, ...renderedOrder(node.children)];

it.each([9 / 16, 16 / 9, 1, 0])('retains one SDK ad/media and one registration of each supplied asset at ratio %s', ratio => {
  const nativeAd = ad(ratio);
  mount(nativeAd);
  expect(tree.root.findAllByType('sdk-ad-view' as any)).toHaveLength(1);
  expect(tree.root.findByType('sdk-ad-view' as any).props.nativeAd).toBe(nativeAd);
  expect(tree.root.findAllByType('sdk-media' as any)).toHaveLength(1);
  const assets = tree.root.findAllByType('sdk-asset' as any);
  expect(assets.map(node => node.props.assetType).sort()).toEqual(['advertiser', 'body', 'cta', 'headline', 'icon']);
  expect(assets.every(node => React.Children.count(node.props.children) === 1)).toBe(true);
  expect(tree.root.findAllByType(Text).filter(node => node.props.children === 'Sponsored')).toHaveLength(1);
  expect(StyleSheet.flatten(mediaNode().props.style).aspectRatio).toBeUndefined();
  expect(StyleSheet.flatten(frame().props.style).height).toBeGreaterThanOrEqual(120);
  expect(StyleSheet.flatten(tree.root.findByType('sdk-ad-view' as any).props.style).height).toBeUndefined();
});
it('places media before the footer for H2 and beside details for portrait B', () => {
  mount(ad(16 / 9));
  expect(tree.root.findByType('sdk-ad-view' as any).props.testID).toBe('native-ad-card-landscape');
  const order = renderedOrder(tree.toJSON());
  expect(order.indexOf('sdk-media')).toBeLessThan(order.indexOf('Discover local dining'));
  act(() => tree.update(<FullSizeSdkAdCard nativeAd={ad(9 / 16)} loading={false} />));
  expect(tree.root.findByType('sdk-ad-view' as any).props.testID).toBe('native-ad-card-portrait');
  expect(StyleSheet.flatten(frame().props.style).width).toBeLessThan(200);
});
it('measures the actual row width without replacing its ad or media instance', () => {
  const nativeAd = ad(16 / 9);
  mount(nativeAd);
  const originalMedia = mediaNode();
  act(() => cardFrame().props.onLayout({ nativeEvent: { layout: { width: 600 } } }));
  expect(mediaNode()).toBe(originalMedia);
  expect(tree.root.findByType('sdk-ad-view' as any).props.nativeAd).toBe(nativeAd);
  expect(StyleSheet.flatten(frame().props.style).width).toBe(592);
});
it('uses compact content instead of an oversized icon hero when media is absent or disabled', () => {
  mount({ ...ad(0, false), mediaContent: null });
  expect(tree.root.findAllByType('sdk-media' as any)).toHaveLength(0);
  expect(tree.root.findAllByProps({ testID: 'native-ad-media-frame' })).toHaveLength(0);
  expect(tree.root.findAllByType('sdk-asset' as any).map(node => node.props.assetType)).toContain('cta');
  act(() => tree.update(<FullSizeSdkAdCard nativeAd={ad(9 / 16)} loading={false} allowMedia={false} />));
  expect(tree.root.findAllByType('sdk-media' as any)).toHaveLength(0);
});
it('stacks accessible large-text media and supports the dark theme', () => {
  mockTheme = 'dark'; mockDimensions = { ...mockDimensions, fontScale: 1.6 };
  mount(ad(9 / 16));
  const view = tree.root.findByType('sdk-ad-view' as any);
  expect(view.props.testID).toBe('native-ad-card-portrait');
  expect(StyleSheet.flatten(frame().props.style).height).toBe(420);
  expect(StyleSheet.flatten(cardFrame().props.style).backgroundColor).not.toBe('#FFFFFF');
});

it.each([9 / 16, 16 / 9, 0])('keeps Fabric SDK content insets empty while decorating the regular card at ratio %s', ratio => {
  mount(ad(ratio));
  const sdk = tree.root.findByType('sdk-ad-view' as any);
  const sdkStyle = StyleSheet.flatten(sdk.props.style);
  for (const key of ['padding', 'paddingHorizontal', 'paddingVertical', 'borderWidth', 'borderLeftWidth', 'borderRightWidth']) {
    expect(sdkStyle[key]).toBeUndefined();
  }
  expect(StyleSheet.flatten(cardFrame().props.style)).toMatchObject({ paddingVertical: 8, paddingHorizontal: 3, borderWidth: 1 });
  expect(cardFrame().findByType('sdk-ad-view' as any)).toBe(sdk);
  expect(sdk.findAllByType('sdk-media' as any)).toHaveLength(1);
  expect(sdk.findAllByType('sdk-asset' as any)).toHaveLength(5);
});
