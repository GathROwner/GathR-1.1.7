const mockRefreshPrivateSharedEventsFromServer = jest.fn<Promise<void>, [string[]?]>();

jest.mock('../store/mapStore', () => ({
  useMapStore: {
    getState: () => ({
      refreshPrivateSharedEventsFromServer: mockRefreshPrivateSharedEventsFromServer,
    }),
  },
}));

import { refreshMapAfterSharedEventSave } from './sharedEventMapRefresh';

describe('refreshMapAfterSharedEventSave', () => {
  beforeEach(() => {
    mockRefreshPrivateSharedEventsFromServer.mockReset();
    mockRefreshPrivateSharedEventsFromServer.mockResolvedValue(undefined);
  });

  it('uses the dedicated server-backed private-event refresh', async () => {
    await refreshMapAfterSharedEventSave(['private-1', 'private-2']);

    expect(mockRefreshPrivateSharedEventsFromServer).toHaveBeenCalledWith([
      'private-1',
      'private-2',
    ]);
  });
});
