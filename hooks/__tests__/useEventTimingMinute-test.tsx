import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useEventTimingMinute } from '../useEventTimingMinute';

it('refreshes mounted time surfaces on minute boundaries, resume and local day change', () => {
  jest.useFakeTimers({ now: new Date('2026-10-25T02:59:10Z') });
  let change: (state: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
    change = fn; return { remove };
  });
  let minute = 0, tree: renderer.ReactTestRenderer;
  function Probe() { minute = useEventTimingMinute(); return null; }
  act(() => { tree = renderer.create(<Probe />); });
  const before = minute;
  act(() => jest.advanceTimersByTime(50050)); // Halifax midnight
  expect(minute).toBe(before + 1);
  // No timer delivery while suspended; foreground event must refresh immediately.
  jest.setSystemTime(new Date('2026-10-25T11:41:00Z'));
  act(() => change('active'));
  expect(minute).toBe(Math.floor(Date.now() / 60000));
  act(() => tree!.unmount());
  expect(remove).toHaveBeenCalled();
  listener.mockRestore(); jest.useRealTimers();
});
