const mockHttpsCallable = jest.fn();
const mockGetSocialAppCheckToken = jest.fn();
const mockGetIdToken = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  onSnapshot: jest.fn(),
}));

jest.mock('../../config/firebaseConfig', () => ({
  app: { options: { projectId: 'gathr-m1' } },
  auth: { currentUser: { getIdToken: () => mockGetIdToken() } },
  firebaseTarget: 'production',
  firestore: {},
  functions: { project: 'gathr-m1' },
  useFirebaseEmulators: false,
}));

jest.mock('../../lib/amplitudeAnalytics', () => ({ amplitudeTrack: jest.fn() }));
jest.mock('../appCheckService', () => ({
  getSocialAppCheckToken: () => mockGetSocialAppCheckToken(),
}));

import {
  bindCheckInReadiness,
  createPrivateCheckInPlaceCandidate,
  discoverNearbyCheckInPlaces,
  recordCheckInReadinessSample,
} from '../socialService';

const input = {
  protocolVersion: 1 as const,
  sessionId: 'readiness-session',
  sequence: 1,
  reset: false,
  latitude: 46.235,
  longitude: -63.129,
  accuracyMeters: 10,
  speedMetersPerSecond: 0,
  capturedAtMs: 2_000_000_100_000,
};

describe('social callable transport', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockGetIdToken.mockResolvedValue('web-auth-token');
  });

  const locationOperations = [
    ['recordCheckInReadinessSampleCallable', (capturedAtMs: number) => recordCheckInReadinessSample({ ...input, capturedAtMs })],
    ['bindCheckInReadinessCallable', (capturedAtMs: number) => bindCheckInReadiness({
      ...input, capturedAtMs, readinessSessionId: input.sessionId, operationId: 'bind-operation', placeCandidateId: 'private-candidate',
    })],
    ['discoverNearbyCheckInPlacesCallable', (capturedAtMs: number) => discoverNearbyCheckInPlaces({ ...input, capturedAtMs })],
    ['createPrivateCheckInPlaceCandidateCallable', (capturedAtMs: number) => createPrivateCheckInPlaceCandidate({ ...input, capturedAtMs, label: 'Home' })],
  ] as const;

  describe.each([false, true])('location capture protocol with App Check=%s', (appChecked) => {
    it.each(locationOperations)('normalizes iOS fractional milliseconds for %s without refreshing the capture time', async (name, invoke) => {
      const fractionalTimestamp = input.capturedAtMs + 0.731;
      let transmitted: Record<string, unknown> | undefined;
      const receive = (data: Record<string, unknown>) => {
        transmitted = data;
        // This matches the deployed parser's integer() requirement, independent
        // of the client implementation. Before the fix iOS requests fail here.
        if (!Number.isSafeInteger(data.capturedAtMs)) throw new Error('capturedAtMs is invalid.');
        return { accepted: true };
      };
      mockGetSocialAppCheckToken.mockResolvedValue(appChecked ? 'native-app-check-token' : null);
      mockHttpsCallable.mockReturnValue(jest.fn(async (data) => ({ data: receive(data) })));
      jest.spyOn(global, 'fetch').mockImplementation(async (_url, options) => ({
        ok: true,
        json: async () => ({ result: receive(JSON.parse(String(options?.body)).data) }),
      }) as Response);

      await expect(invoke(fractionalTimestamp)).resolves.toEqual({ accepted: true });
      expect(transmitted).toEqual(expect.objectContaining({
        capturedAtMs: input.capturedAtMs, latitude: input.latitude, longitude: input.longitude,
        accuracyMeters: input.accuracyMeters,
      }));
      expect(fractionalTimestamp - Number(transmitted?.capturedAtMs)).toBeLessThan(1);
      if (!appChecked) expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), name, expect.anything());
    });
  });

  it.each([NaN, Infinity, -Infinity, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid capture timestamp %s before sending a request', async (capturedAtMs) => {
    for (const [, invoke] of locationOperations) {
      await expect(invoke(capturedAtMs)).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    expect(mockGetSocialAppCheckToken).not.toHaveBeenCalled();
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });

  it('uses the Firebase callable SDK when native App Check is intentionally absent', async () => {
    const receipt = { protocolVersion: 1, sessionId: 'readiness-session', sequence: 1,
      hereQualifyingMs: 10_000, placeQualifyingMs: 10_000, expiresAtMs: 2_000_000_120_000 };
    const callable = jest.fn().mockResolvedValue({ data: receipt });
    mockGetSocialAppCheckToken.mockResolvedValue(null);
    mockHttpsCallable.mockReturnValue(callable);

    await expect(recordCheckInReadinessSample(input)).resolves.toEqual(receipt);

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      { project: 'gathr-m1' },
      'recordCheckInReadinessSampleCallable',
      { timeout: 8_000 }
    );
    expect(callable).toHaveBeenCalledWith(input);
    expect(mockGetIdToken).not.toHaveBeenCalled();
  });

  it('keeps the manually attested transport when a native App Check token exists', async () => {
    mockGetSocialAppCheckToken.mockResolvedValue('native-app-check-token');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: { accepted: true } }),
    } as unknown as Response);

    await recordCheckInReadinessSample(input);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://northamerica-northeast1-gathr-m1.cloudfunctions.net/recordCheckInReadinessSampleCallable',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer web-auth-token',
          'X-Firebase-AppCheck': 'native-app-check-token',
        }),
      })
    );
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });
});
