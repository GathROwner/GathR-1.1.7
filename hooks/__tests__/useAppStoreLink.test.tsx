import React from 'react';
import { Linking } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useAppStoreLink } from '../useAppStoreLink';
import { APP_STORE_URLS, StorePlatform } from '../../utils/minimumAppVersion';

let result!: ReturnType<typeof useAppStoreLink>;
let tree: renderer.ReactTestRenderer | undefined;
function Harness({ platform }: { platform: StorePlatform }) {
  result = useAppStoreLink(platform);
  return null;
}
afterEach(() => {
  if (tree) act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});
test.each(['ios', 'android'] as const)('hands off to the fixed %s listing only after a tap', async (platform) => {
  const open = jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(true);
  await act(async () => { tree = renderer.create(<Harness platform={platform} />); });
  expect(open).not.toHaveBeenCalled();
  await act(async () => { await result.openStore(); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(APP_STORE_URLS[platform]);
  expect(result.storeError).toBe(false);
});
test('shows a failed handoff, clears it on retry, and allows a fresh Preview session', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockReset().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(true);
  await act(async () => { tree = renderer.create(<Harness platform="ios" />); });
  await act(async () => { await result.openStore(); });
  expect(result.storeError).toBe(true);
  await act(async () => { await result.openStore(); });
  expect(result.storeError).toBe(false);
  open.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => { await result.openStore(); });
  expect(result.storeError).toBe(true);
  act(() => result.resetStoreError());
  expect(result.storeError).toBe(false);
  expect(open).toHaveBeenCalledTimes(3);
});
