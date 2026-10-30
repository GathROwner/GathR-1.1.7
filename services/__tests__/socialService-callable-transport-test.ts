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
  listNearbyCanonicalCheckInVenues,
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

  it('preserves complete-empty and partial canonical discovery responses', async () => {
    mockGetSocialAppCheckToken.mockResolvedValue(null);
    const completeEmpty = { candidates: [], externalLookupStatus: 'complete' };
    const partialCanonical = {
      candidates: [{ id: 'venue-1', type: 'gathr_venue', venueId: 'venue-1', name: 'Known venue', address: '1 Main St',
        category: 'GathR venue', latitude: 46.235, longitude: -63.129, distanceMetres: 0 }],
      externalLookupStatus: 'partial_unavailable',
    };
    mockHttpsCallable
      .mockReturnValueOnce(jest.fn().mockResolvedValue({ data: completeEmpty }))
      .mockReturnValueOnce(jest.fn().mockResolvedValue({ data: partialCanonical }));

    await expect(discoverNearbyCheckInPlaces(input)).resolves.toEqual(completeEmpty);
    await expect(discoverNearbyCheckInPlaces(input)).resolves.toEqual(partialCanonical);
  });

  it('preserves the typed retryable nearby-public-place outage from the callable SDK', async () => {
    mockGetSocialAppCheckToken.mockResolvedValue(null);
    mockHttpsCallable.mockReturnValue(jest.fn().mockRejectedValue({
      code: 'functions/unavailable',
      message: 'GathR social is temporarily unavailable. Try again when you are online.',
      details: { condition: 'nearby_public_places_external_lookup_unavailable', retryable: true },
    }));

    await expect(discoverNearbyCheckInPlaces(input)).rejects.toMatchObject({
      code: 'unavailable',
      details: { condition: 'nearby_public_places_external_lookup_unavailable', retryable: true },
    });
  });

  it('keeps an ordinary transport outage generic when no typed condition is provided', async () => {
    mockGetSocialAppCheckToken.mockResolvedValue('native-app-check-token');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ error: { status: 'UNAVAILABLE', message: 'Provider transport failed.' } }),
    } as unknown as Response);

    await expect(discoverNearbyCheckInPlaces(input)).rejects.toMatchObject({
      code: 'unavailable',
      message: 'GathR social is temporarily unavailable. Try again when you are online.',
      details: undefined,
    });
  });

  it.each([discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues])('does not start a canceled preparation lookup', async (lookup) => {
    const controller = new AbortController();
    controller.abort();
    await expect(lookup(input, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockGetSocialAppCheckToken).not.toHaveBeenCalled();
    expect(mockHttpsCallable).not.toHaveBeenCalled();
  });

  it('passes the bounded preparation deadline to the compatible callable transport', async () => {
    mockGetSocialAppCheckToken.mockResolvedValue(null);
    mockHttpsCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: { candidates: [] } }));
    await discoverNearbyCheckInPlaces(input, { timeoutMs: 24_000 });
    expect(mockHttpsCallable).toHaveBeenCalledWith(expect.anything(), 'discoverNearbyCheckInPlacesCallable', { timeout: 24_000 });
  });

  it('passes the qualified private arrival reference without making its capture time appear fresh', async () => {
    const callable = jest.fn().mockResolvedValue({ data: { candidate: { id: 'private-candidate' } } });
    mockGetSocialAppCheckToken.mockResolvedValue(null);
    mockHttpsCallable.mockReturnValue(callable);
    await createPrivateCheckInPlaceCandidate({ ...input, label: 'Home', readinessSessionId: input.sessionId });
    expect(callable).toHaveBeenCalledWith(expect.objectContaining({
      readinessSessionId: input.sessionId, capturedAtMs: input.capturedAtMs,
    }));
  });

  describe('whole readiness request deadline', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it.each(['App Check', 'Auth'])('bounds a pending %s token before the HTTP request starts', async (stage) => {
      let resolveToken: (value: string) => void = () => undefined;
      const pendingToken = new Promise<string>((resolve) => { resolveToken = resolve; });
      mockGetSocialAppCheckToken.mockReturnValue(stage === 'App Check' ? pendingToken : Promise.resolve('attested-token'));
      if (stage === 'Auth') mockGetIdToken.mockReturnValue(pendingToken);
      const fetchMock = jest.spyOn(global, 'fetch');
      let failure: Error | undefined;
      void recordCheckInReadinessSample(input).catch((error) => { failure = error; });
      await jest.advanceTimersByTimeAsync(8_000);
      expect(failure?.name).toBe('AbortError');
      expect(fetchMock).not.toHaveBeenCalled();
      resolveToken('late-token');
      await jest.advanceTimersByTimeAsync(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('honors cancellation while App Check is still pending and never sends late credentials', async () => {
      let resolveToken: (value: string) => void = () => undefined;
      mockGetSocialAppCheckToken.mockReturnValue(new Promise<string>((resolve) => { resolveToken = resolve; }));
      const fetchMock = jest.spyOn(global, 'fetch');
      const controller = new AbortController();
      let failure: Error | undefined;
      void recordCheckInReadinessSample(input, { signal: controller.signal }).catch((error) => { failure = error; });
      controller.abort();
      await jest.advanceTimersByTimeAsync(1);
      expect(failure?.name).toBe('AbortError');
      resolveToken('late-token');
      await jest.advanceTimersByTimeAsync(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockGetIdToken).not.toHaveBeenCalled();
    });

    it('uses one deadline across App Check, sign-in and HTTP rather than restarting the budget', async () => {
      mockGetSocialAppCheckToken.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('attested-token'), 4_000)));
      mockGetIdToken.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('auth-token'), 3_000)));
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => undefined));
      let failure: Error | undefined;
      void recordCheckInReadinessSample(input).catch((error) => { failure = error; });
      await jest.advanceTimersByTimeAsync(7_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(failure).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1_000);
      expect(failure?.name).toBe('AbortError');
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    });

    it('rejects an already canceled request before asking for attestation or sign-in tokens', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(recordCheckInReadinessSample(input, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
      expect(mockGetSocialAppCheckToken).not.toHaveBeenCalled();
      expect(mockGetIdToken).not.toHaveBeenCalled();
      expect(mockHttpsCallable).not.toHaveBeenCalled();
    });

    it('never falls back to an unattested request when attestation rejects', async () => {
      mockGetSocialAppCheckToken.mockRejectedValue(new Error('App attestation unavailable'));
      const fetchMock = jest.spyOn(global, 'fetch');
      await expect(recordCheckInReadinessSample(input)).rejects.toBeInstanceOf(Error);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockHttpsCallable).not.toHaveBeenCalled();
      expect(mockGetIdToken).not.toHaveBeenCalled();
    });
  });
});
