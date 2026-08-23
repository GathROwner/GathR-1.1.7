const mockFetchEvents = jest.fn<Promise<void>, [{ forcePrivateSharedServer?: boolean }?]>();

jest.mock('../store/mapStore', () => ({
  useMapStore: {
    getState: () => ({ fetchEvents: mockFetchEvents }),
  },
}));

import { EVENTS_MINIMAL } from './queryKeys';
import { refreshMapAfterSharedEventSave } from './sharedEventMapRefresh';

describe('refreshMapAfterSharedEventSave', () => {
  beforeEach(() => {
    mockFetchEvents.mockReset();
    mockFetchEvents.mockResolvedValue(undefined);
  });

  it('drains an in-flight request before forcing the post-save event read', async () => {
    const removeQueries = jest.fn();

    await refreshMapAfterSharedEventSave({ removeQueries });

    expect(mockFetchEvents).toHaveBeenCalledTimes(2);
    expect(mockFetchEvents).toHaveBeenNthCalledWith(1);
    expect(mockFetchEvents).toHaveBeenNthCalledWith(2, {
      forcePrivateSharedServer: true,
    });
    expect(removeQueries).toHaveBeenCalledTimes(2);
    expect(removeQueries).toHaveBeenNthCalledWith(1, {
      queryKey: EVENTS_MINIMAL,
      exact: true,
    });
    expect(removeQueries).toHaveBeenNthCalledWith(2, {
      queryKey: EVENTS_MINIMAL,
      exact: true,
    });
    expect(removeQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mockFetchEvents.mock.invocationCallOrder[0]
    );
    expect(mockFetchEvents.mock.invocationCallOrder[0]).toBeLessThan(
      removeQueries.mock.invocationCallOrder[1]
    );
    expect(removeQueries.mock.invocationCallOrder[1]).toBeLessThan(
      mockFetchEvents.mock.invocationCallOrder[1]
    );
  });
});
