const mockGetApp = jest.fn();
const mockInitialize = jest.fn();
const mockGetToken = jest.fn();
jest.mock('@react-native-firebase/app', () => ({ getApp: () => mockGetApp() }));
jest.mock('@react-native-firebase/app-check', () => ({
  initializeAppCheck: (...args: unknown[]) => mockInitialize(...args),
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('../../config/firebaseConfig', () => ({ useFirebaseEmulators: false }));

describe('native App Check recovery and safe diagnostics', () => {
  const originalDev = __DEV__;
  const originalDisabled = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED;
  const originalDebug = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG;
  const originalDebugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
  const nativeApp = { name: '[DEFAULT]' };
  const instance = { name: 'native-attestation' };
  let getToken: typeof import('../appCheckService').getSocialAppCheckToken;

  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(2_000_000_000_000); jest.resetModules();
    Object.defineProperty(global, '__DEV__', { value: false, configurable: true });
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED;
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG;
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN;
    mockGetApp.mockReset().mockReturnValue(nativeApp);
    mockInitialize.mockReset().mockResolvedValue(instance);
    mockGetToken.mockReset().mockResolvedValue({ token: 'attested-token' });
    getToken = jest.requireActual<typeof import('../appCheckService')>('../appCheckService').getSocialAppCheckToken;
  });
  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(global, '__DEV__', { value: originalDev, configurable: true });
    for (const [key, value] of Object.entries({
      EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED: originalDisabled,
      EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG: originalDebug,
      EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN: originalDebugToken,
    })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });

  it('recovers a rejected initialization after cooldown without restarting the app', async () => {
    mockInitialize.mockRejectedValueOnce({ code: 'appCheck/network-error' });
    await expect(getToken()).rejects.toThrow('[AC-INIT-NETWORK]');
    await expect(getToken()).rejects.toThrow('[AC-INIT-NETWORK]');
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockGetToken).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5_000);
    await expect(getToken()).resolves.toBe('attested-token');
    await expect(getToken()).resolves.toBe('attested-token');
    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });

  it('shares one concurrent initialization and token acquisition', async () => {
    let resolve!: (value: typeof instance) => void;
    mockInitialize.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const results = [getToken(), getToken(), getToken()];
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockGetToken).not.toHaveBeenCalled();
    resolve(instance);
    await expect(Promise.all(results)).resolves.toEqual(['attested-token', 'attested-token', 'attested-token']);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it('counts concurrent failures once and allows one shared recovery', async () => {
    mockInitialize.mockRejectedValueOnce({ code: 'unavailable' });
    const failed = await Promise.allSettled([getToken(), getToken(), getToken()]);
    expect(failed.every(x => x.status === 'rejected')).toBe(true);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5_000);
    await expect(Promise.all([getToken(), getToken()])).resolves.toEqual(['attested-token', 'attested-token']);
    expect(mockInitialize).toHaveBeenCalledTimes(2);
    expect(mockGetToken).toHaveBeenCalledTimes(1);
  });

  it.each(['INIT', 'TOKEN'])('bounds persistent %s failures with capped cooldowns and no background retries', async stage => {
    (stage === 'INIT' ? mockInitialize : mockGetToken).mockRejectedValue({ code: 'token-error' });
    for (const [attempt, delay] of [5_000, 15_000, 30_000, 60_000, 60_000].entries()) {
      await expect(getToken()).rejects.toThrow(`[AC-${stage}-TOKEN-ERROR]`);
      expect(stage === 'INIT' ? mockInitialize : mockGetToken).toHaveBeenCalledTimes(attempt + 1);
      jest.advanceTimersByTime(delay - 1);
      await Promise.all(Array.from({ length: 20 }, () => expect(getToken()).rejects.toThrow(`[AC-${stage}-TOKEN-ERROR]`)));
      expect(stage === 'INIT' ? mockInitialize : mockGetToken).toHaveBeenCalledTimes(attempt + 1);
      jest.advanceTimersByTime(1);
    }
    // Advancing time alone never starts a request.
    jest.advanceTimersByTime(120_000);
    expect(mockInitialize).toHaveBeenCalledTimes(stage === 'INIT' ? 5 : 1);
    expect(mockGetToken).toHaveBeenCalledTimes(stage === 'INIT' ? 0 : 5);
  });

  it('retries token-fetch failure using the successful native initialization', async () => {
    mockGetToken.mockRejectedValueOnce({ code: 'appCheck/token-error' });
    await expect(getToken()).rejects.toThrow('[AC-TOKEN-TOKEN-ERROR]');
    await expect(getToken()).rejects.toThrow('[AC-TOKEN-TOKEN-ERROR]');
    expect(mockGetToken).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5_000);
    await expect(getToken()).resolves.toBe('attested-token');
    expect(mockInitialize).toHaveBeenCalledTimes(1);
    expect(mockGetToken).toHaveBeenCalledTimes(2);
  });

  it('resets the failure backoff after a successful token', async () => {
    mockGetToken.mockRejectedValueOnce({ code: 'token-error' }).mockRejectedValueOnce({ code: 'token-error' });
    await expect(getToken()).rejects.toThrow('AC-TOKEN');
    jest.advanceTimersByTime(5_000);
    await expect(getToken()).rejects.toThrow('AC-TOKEN');
    jest.advanceTimersByTime(15_000);
    await expect(getToken()).resolves.toBe('attested-token');
    mockGetToken.mockRejectedValueOnce({ code: 'token-error' });
    await expect(getToken()).rejects.toThrow('AC-TOKEN');
    jest.advanceTimersByTime(5_000);
    await expect(getToken()).resolves.toBe('attested-token');
  });

  it('reports empty native tokens without accepting them', async () => {
    mockGetToken.mockResolvedValueOnce({ token: '' });
    await expect(getToken()).rejects.toThrow('[AC-TOKEN-TOKEN-NULL]');
  });

  it('distinguishes native-app access and never exposes arbitrary native payloads', async () => {
    mockGetApp.mockImplementationOnce(() => { throw { code: 'private-token-SECRET', message: 'SECRET native configuration', token: 'SECRET' }; });
    const result = await getToken().catch(e => e as Error);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('[AC-APP-UNKNOWN]');
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect((result as Error).message).not.toContain('SECRET');
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('preserves the Production attestation providers and auto refresh', async () => {
    await getToken();
    expect(mockInitialize).toHaveBeenCalledWith(nativeApp, {
      provider: { providerOptions: { android: { provider: 'playIntegrity' }, apple: { provider: 'appAttestWithDeviceCheckFallback' } } },
      isTokenAutoRefreshEnabled: true,
    });
  });

  it('preserves the existing explicit-disabled path without native acquisition', async () => {
    process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED = 'true';
    await expect(getToken()).resolves.toBeNull();
    expect(mockGetApp).not.toHaveBeenCalled();
  });
});
