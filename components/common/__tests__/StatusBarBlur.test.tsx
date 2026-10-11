import React from 'react';
import { AccessibilityInfo } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { BlurView } from 'expo-blur';
import StatusBarBlur from '../StatusBarBlur';

jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 44 }) }));

it('honors Reduce Transparency and responds when the user changes it', async () => {
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
  const subscribe = jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue(
    { remove } as unknown as ReturnType<typeof AccessibilityInfo.addEventListener>,
  );
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<StatusBarBlur tint="light" />); });
  const changed = subscribe.mock.calls[0][1] as unknown as (enabled: boolean) => void;
  expect(tree.root.findAllByType(BlurView)).toHaveLength(0);
  act(() => changed(false));
  expect(tree.root.findAllByType(BlurView)).toHaveLength(1);
  act(() => changed(true));
  expect(tree.root.findAllByType(BlurView)).toHaveLength(0);
  act(() => tree.unmount());
  expect(remove).toHaveBeenCalledTimes(1);
  jest.restoreAllMocks();
});
