import React from 'react';
import { AccessibilityInfo, Keyboard, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useMapStore } from '../../../store';
import FloatingMapSearchHeader from '../FloatingMapSearchHeader';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../../../hooks/useAnalytics', () => ({
  __esModule: true, default: () => ({ trackUserAction: jest.fn() }),
}));
jest.mock('../../../store', () => {
  const { create } = jest.requireActual('zustand');
  return { useMapStore: create((set: (value: object) => void) => ({
    isHeaderSearchActive: false, searchQuery: '',
    setHeaderSearchActive: (isHeaderSearchActive: boolean) => set({ isHeaderSearchActive }),
    setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  })) };
});

describe('floating map search lifecycle', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.useFakeTimers();
    useMapStore.setState({ isHeaderSearchActive: false, searchQuery: '' });
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
    act(() => { tree = renderer.create(<FloatingMapSearchHeader top={60} onSettings={() => {}} />); });
    act(() => {
      tree.root.findAllByType(View).find((node) => node.props.onLayout)?.props.onLayout({
        nativeEvent: { layout: { width: 360 } },
      });
    });
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const press = (id: string) => act(() => tree.root.findByProps({ testID: id }).props.onPress());

  it('retains a submitted query in the centered pill and allows editing it again', () => {
    press('floating-map-search-button');
    act(() => tree.root.findByProps({ testID: 'map-search-input' }).props.onChangeText('Live music'));
    act(() => tree.root.findByProps({ testID: 'map-search-input' }).props.onSubmitEditing());
    expect(useMapStore.getState().searchQuery).toBe('Live music');
    expect(useMapStore.getState().isHeaderSearchActive).toBe(false);
    expect(tree.root.findByProps({ testID: 'map-search-query-pill' })).toBeTruthy();
    act(() => tree.root.findByProps({ accessibilityLabel: 'Edit search: Live music' }).props.onPress());
    expect(tree.root.findByProps({ testID: 'map-search-input' }).props.value).toBe('Live music');
  });

  it('clears the submitted pill without reopening the keyboard', () => {
    act(() => useMapStore.getState().setSearchQuery('Test'));
    press('map-search-query-clear');
    expect(useMapStore.getState().searchQuery).toBe('');
    expect(useMapStore.getState().isHeaderSearchActive).toBe(false);
    expect(tree.root.findAllByProps({ testID: 'map-search-query-pill' })).toHaveLength(0);
  });

  it('keeps the filter when dismissing outside, and clears it when cancelling', () => {
    press('floating-map-search-button');
    act(() => useMapStore.getState().setSearchQuery('Test'));
    press('map-search-dismiss');
    expect(useMapStore.getState().searchQuery).toBe('Test');
    expect(Keyboard.dismiss).toHaveBeenCalled();
    press('floating-map-search-button');
    act(() => tree.root.findByProps({ accessibilityLabel: 'Cancel search' }).props.onPress());
    expect(useMapStore.getState().searchQuery).toBe('');
    expect(useMapStore.getState().isHeaderSearchActive).toBe(false);
  });

  it('collapses to the query pill when the system keyboard is dismissed', () => {
    const listeners = jest.spyOn(Keyboard, 'addListener');
    press('floating-map-search-button');
    act(() => useMapStore.getState().setSearchQuery('Test'));
    const hideListener = listeners.mock.calls.find(([event]) => event === 'keyboardDidHide')?.[1];
    expect(hideListener).toBeDefined();
    act(() => hideListener?.({} as any));
    expect(useMapStore.getState().isHeaderSearchActive).toBe(false);
    expect(useMapStore.getState().searchQuery).toBe('Test');
  });

  it('keeps the decorative backdrop out of active and submitted search states', () => {
    const backdrop = () => tree.root.findAllByProps({ testID: 'map-logo-backdrop' });
    expect(backdrop().length).toBeGreaterThan(0);
    expect(backdrop()[0].props.pointerEvents).toBe('none');
    press('floating-map-search-button');
    expect(backdrop()).toHaveLength(0);
    act(() => tree.root.findByProps({ testID: 'map-search-input' }).props.onChangeText('Live music'));
    act(() => tree.root.findByProps({ testID: 'map-search-input' }).props.onSubmitEditing());
    expect(backdrop()).toHaveLength(0);
    press('map-search-query-clear');
    expect(backdrop().length).toBeGreaterThan(0);
  });
});
