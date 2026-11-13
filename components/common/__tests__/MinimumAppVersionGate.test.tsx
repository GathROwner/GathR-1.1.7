import React from 'react';
import { Linking, Modal, Platform } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { MinimumAppVersionGate } from '../MinimumAppVersionGate';
import { UpdateRequiredNotice } from '../UpdateRequiredNotice';
import { APP_STORE_URLS } from '../../../utils/minimumAppVersion';

const mockCheck = jest.fn();
let mockMinimum: string | null = '1.1.20';
let mockChecking = false;
jest.mock('../../../hooks/useMinimumAppVersion', () => ({ useMinimumAppVersion: () => ({
  minimumVersion: mockMinimum, checking: mockChecking, check: mockCheck,
}) }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.1.10' }));
jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const View = require('react-native').View;
  return { SafeAreaProvider: View, SafeAreaView: View };
});
jest.mock('../GathrWordmarkLogo', () => () => null);
let tree: renderer.ReactTestRenderer | undefined;
const originalOS = Platform.OS;
beforeEach(() => {
  mockMinimum = '1.1.20'; mockChecking = false; mockCheck.mockReset();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
});
afterEach(() => {
  if (tree) act(() => tree?.unmount());
  tree = undefined; jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
});
async function mount() { await act(async () => { tree = renderer.create(<MinimumAppVersionGate />); }); }
test('no required minimum means no modal or navigation changes', async () => {
  mockMinimum = null;
  await mount();
  expect(tree!.toJSON()).toBeNull();
});
test.each(['ios', 'android'] as const)('opens only the fixed %s store destination', async (platform) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await mount();
  await act(async () => { tree!.root.findByType(UpdateRequiredNotice).props.onUpdate(); });
  expect(open).toHaveBeenCalledWith(APP_STORE_URLS[platform]);
});
test('the real gate has no dismiss action and Android Back cannot dismiss it', async () => {
  await mount();
  expect(tree!.root.findByType(UpdateRequiredNotice).props.onPreviewClose).toBeUndefined();
  act(() => { tree!.root.findByType(Modal).props.onRequestClose(); });
  expect(tree!.root.findByType(Modal).props.visible).toBe(true);
});
test('store-open failure exposes useful recovery text; retry checks policy', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('unavailable'));
  await mount();
  await act(async () => { tree!.root.findByType(UpdateRequiredNotice).props.onUpdate(); });
  expect(tree!.root.findByType(UpdateRequiredNotice).props.storeError).toBe(true);
  act(() => { tree!.root.findByType(UpdateRequiredNotice).props.onRetry(); });
  expect(mockCheck).toHaveBeenCalledTimes(1);
});
test('rechecking disables repeated retry taps and a Preview can be closed', () => {
  const close = jest.fn(); const retry = jest.fn();
  act(() => { tree = renderer.create(<UpdateRequiredNotice installedVersion="1.1.10"
    minimumVersion="1.1.20" platform="ios" checking onUpdate={() => {}}
    onRetry={retry} onPreviewClose={close} />); });
  expect(tree!.root.findByProps({ onPress: retry }).props.disabled).toBe(true);
  act(() => { tree!.root.findByProps({ onPress: close }).props.onPress(); });
  expect(close).toHaveBeenCalledTimes(1);
});
