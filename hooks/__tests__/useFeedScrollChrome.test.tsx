import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { NativeScrollEvent } from 'react-native';
import { FeedChromeProvider, FeedTab } from '../../contexts/FeedChromeContext';
import { useFeedScrollChrome } from '../useFeedScrollChrome';

let mockFocused = true;
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockFocused }));

describe('feed chrome coordination', () => {
  let tree: renderer.ReactTestRenderer;
  let channels: Record<FeedTab, ReturnType<typeof useFeedScrollChrome>>;
  function Probe({ tab, locked }: { tab: FeedTab; locked: boolean }) {
    channels[tab] = useFeedScrollChrome(tab, locked);
    return null;
  }
  const render = (locked = false) => (
    <FeedChromeProvider>
      <Probe tab="events" locked={locked} />
      <Probe tab="specials" locked={false} />
    </FeedChromeProvider>
  );
  const scroll = (tab: FeedTab, y: number) => act(() => channels[tab].onScroll({
    contentOffset: { y }, contentSize: { height: 3000 }, layoutMeasurement: { height: 800 },
  } as NativeScrollEvent));
  beforeEach(() => {
    jest.useFakeTimers(); mockFocused = true; channels = {} as typeof channels;
    act(() => { tree = renderer.create(render()); });
  });
  afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

  it('coordinates one feed without hiding another and explicitly restores back-to-top', () => {
    scroll('events', 300);
    expect(channels.events.hidden).toBe(true);
    expect(channels.specials.hidden).toBe(false);
    act(() => channels.events.reveal());
    expect(channels.events.hidden).toBe(false);
  });
  it('keeps controls accessible during search/tutorial and restores on tab focus', () => {
    scroll('events', 300);
    act(() => tree.update(render(true)));
    expect(channels.events.hidden).toBe(false);
    scroll('events', 600);
    expect(channels.events.hidden).toBe(false);
    act(() => tree.update(render()));
    scroll('events', 700);
    expect(channels.events.hidden).toBe(true);
    mockFocused = false;
    act(() => tree.update(render()));
    mockFocused = true;
    act(() => tree.update(render()));
    expect(channels.events.hidden).toBe(false);
  });
});
