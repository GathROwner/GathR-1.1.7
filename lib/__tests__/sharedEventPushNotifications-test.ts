// Real app registration and listener wiring, with SDK/auth/storage/network I/O mocked.
let mockUser: { uid: string; getIdToken: jest.Mock } | null;
let mockStored: Map<string, string>;
let mockOS = 'ios';
let mockIsDevice = true;
let mockNativeToken = { type: 'ios', data: 'native-a' };
let mockTokenListener: ((token: typeof mockNativeToken) => void) | undefined;
let mockAppListener: ((state: string) => void) | undefined;
let mockCleanup: (() => void) | undefined;
let mockFetchEmissions = 1;
let mockBackendActive = 0;
let mockBackendMax = 0;

jest.mock('react', () => ({ useEffect: (effect: () => (() => void) | undefined) => { mockCleanup = effect(); } }));
jest.mock('react-native', () => ({
  Platform: { get OS() { return mockOS; } },
  AppState: { addEventListener: jest.fn((_name, listener) => {
    mockAppListener = listener;
    return { remove: jest.fn(() => { mockAppListener = undefined; }) };
  }) },
}));
jest.mock('../../config/firebaseConfig', () => ({ auth: { get currentUser() { return mockUser; } } }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../sharedEventApi', () => ({ FUNCTIONS_BASE_URL: 'https://push.test' }));
jest.mock('expo-constants', () => ({
  __esModule: true, default: { easConfig: { projectId: 'test-project' }, expoConfig: { version: 'test-version' } },
}));
jest.mock('expo-device', () => ({ get isDevice() { return mockIsDevice; }, deviceName: 'Test device' }));
jest.mock('expo-updates', () => ({ runtimeVersion: '1.1.10' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true, default: {
    getItem: jest.fn(async (key: string) => mockStored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStored.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { mockStored.delete(key); }),
  },
}));
jest.mock('expo-notifications', () => {
  const notifications: {
    getPermissionsAsync: jest.Mock; requestPermissionsAsync: jest.Mock; getDevicePushTokenAsync: jest.Mock;
    getExpoPushTokenAsync: jest.Mock; addPushTokenListener: jest.Mock;
  } = {
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getDevicePushTokenAsync: jest.fn(async () => {
      if (mockFetchEmissions-- > 0) mockTokenListener?.(mockNativeToken);
      return mockNativeToken;
    }),
    getExpoPushTokenAsync: jest.fn(async (options: { devicePushToken?: typeof mockNativeToken }) => {
      // Faithfully reproduce the installed Expo implementation. Fetching a
      // device token emits the listener, but a supplied token avoids that fetch.
      const token = options.devicePushToken ?? await notifications.getDevicePushTokenAsync();
      return { type: 'expo', data: `ExponentPushToken[${token.data}]` };
    }),
    addPushTokenListener: jest.fn((listener: typeof mockTokenListener) => {
      mockTokenListener = listener;
      return { remove: jest.fn(() => { if (mockTokenListener === listener) mockTokenListener = undefined; }) };
    }),
  };
  return notifications;
});

type Api = typeof import('../sharedEventPushNotifications');
let api: Api;
let notifications: {
  getPermissionsAsync: jest.Mock; requestPermissionsAsync: jest.Mock; getDevicePushTokenAsync: jest.Mock;
  getExpoPushTokenAsync: jest.Mock; addPushTokenListener: jest.Mock;
};
let storage: { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock };
let renderRegistration: () => null;
const storedKey = '@gathr/shared-event-push-registration-v1';
const user = (uid = 'owner-a') => ({ uid, getIdToken: jest.fn(async () => `auth-${uid}`) });
const bodies = () => (fetch as jest.Mock).mock.calls.map(([, options]) => JSON.parse(options.body));
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const emit = (data: string) => { mockNativeToken = { type: 'ios', data }; mockTokenListener?.(mockNativeToken); };

describe('shared-event push registration', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-13T22:00:00Z'));
    mockUser = user(); mockStored = new Map(); mockOS = 'ios'; mockIsDevice = true;
    mockNativeToken = { type: 'ios', data: 'native-a' }; mockFetchEmissions = 1;
    mockTokenListener = undefined; mockAppListener = undefined; mockCleanup = undefined;
    mockBackendActive = 0; mockBackendMax = 0;
    global.fetch = jest.fn(async () => {
      mockBackendMax = Math.max(mockBackendMax, ++mockBackendActive);
      await Promise.resolve(); mockBackendActive--;
      return { ok: true } as Response;
    });
    notifications = jest.requireMock('expo-notifications');
    storage = jest.requireMock('@react-native-async-storage/async-storage').default;
    api = jest.requireActual('../sharedEventPushNotifications');
    renderRegistration = jest.requireActual('../../components/sharedEvent/SharedEventPushRegistration').default;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    mockCleanup?.();
    await flush();
    global.fetch = originalFetch;
    jest.useRealTimers(); jest.restoreAllMocks();
  });

  it('registers at most once when a token fetch fires the actual app listener', async () => {
    renderRegistration();
    await flush();
    expect(notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project', devicePushToken: mockNativeToken });
    expect(bodies()).toEqual([expect.objectContaining({ action: 'register', expoPushToken: 'ExponentPushToken[native-a]' })]);
    expect(mockBackendMax).toBe(1);
  });

  it('coalesces concurrent startup/foreground calls and repeated token events', async () => {
    let resolvePost!: (response: Response) => void;
    (fetch as jest.Mock).mockImplementationOnce(() => {
      mockBackendMax = Math.max(mockBackendMax, ++mockBackendActive);
      return new Promise<Response>((resolve) => { resolvePost = (response) => { mockBackendActive--; resolve(response); }; });
    });
    renderRegistration(); await flush();
    const joins = Array.from({ length: 100 }, () => api.registerSharedEventPushNotifications(true, mockNativeToken));
    mockAppListener?.('active');
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolvePost({ ok: true } as Response);
    expect((await Promise.all(joins)).every(Boolean)).toBe(true);
    await flush();
    for (let i = 0; i < 100; i++) emit('native-a');
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(mockBackendMax).toBe(1);
  });

  it('uses a genuinely newer token supplied during an older Expo exchange', async () => {
    let resolveExpo!: (token: { type: string; data: string }) => void;
    notifications.getExpoPushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveExpo = resolve; }));
    renderRegistration(); await flush();
    emit('native-b'); await flush();
    expect(fetch).not.toHaveBeenCalled();
    resolveExpo({ type: 'expo', data: 'ExponentPushToken[native-a]' });
    await flush();
    expect(bodies()).toEqual([expect.objectContaining({ action: 'register', expoPushToken: 'ExponentPushToken[native-b]' })]);
    expect(notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockStored.get(storedKey)!)).toMatchObject({ ownerUid: 'owner-a', expoPushToken: 'ExponentPushToken[native-b]' });
  });

  it('serializes a true token change arriving during a backend request', async () => {
    let resolvePost!: () => void;
    (fetch as jest.Mock).mockImplementationOnce(() => {
      mockBackendMax = Math.max(mockBackendMax, ++mockBackendActive);
      return new Promise<Response>((resolve) => { resolvePost = () => { mockBackendActive--; resolve({ ok: true } as Response); }; });
    });
    renderRegistration(); await flush();
    emit('native-b'); emit('native-b'); await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolvePost(); await flush();
    expect(bodies().map((body) => body.expoPushToken)).toEqual(['ExponentPushToken[native-a]', 'ExponentPushToken[native-b]']);
    expect(mockBackendMax).toBe(1);
    expect(JSON.parse(mockStored.get(storedKey)!).expoPushToken).toBe('ExponentPushToken[native-b]');
  });

  it('reasserts registration once for a genuine native change even if the Expo token stays the same', async () => {
    renderRegistration(); await flush();
    notifications.getExpoPushTokenAsync.mockResolvedValueOnce({ type: 'expo', data: 'ExponentPushToken[native-a]' });
    emit('native-b'); await flush();
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    emit('native-b'); await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the 15-minute foreground refresh while forced repeats are deduplicated', async () => {
    renderRegistration(); await flush();
    mockAppListener?.('active'); await flush();
    await api.registerSharedEventPushNotifications(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 15 * 60_000);
    mockAppListener?.('active'); await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(bodies().every((body) => body.action === 'register')).toBe(true);
  });

  it('revalidates a saved registration once at startup, then deduplicates until refresh is due', async () => {
    mockStored.set(storedKey, JSON.stringify({ ownerUid: 'owner-a', expoPushToken: 'ExponentPushToken[native-a]', registeredAt: Date.now() }));
    expect(await api.registerSharedEventPushNotifications(true)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await api.registerSharedEventPushNotifications(true)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 15 * 60_000);
    expect(await api.registerSharedEventPushNotifications()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('registers an existing v1 cache without a successful-registration timestamp', async () => {
    mockStored.set(storedKey, JSON.stringify({ ownerUid: 'owner-a', expoPushToken: 'ExponentPushToken[native-a]' }));
    expect(await api.registerSharedEventPushNotifications(true)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockStored.get(storedKey)!).registeredAt).toBe(Date.now());
  });

  it('does not register a stale account after authentication changes during token fetching', async () => {
    let resolveNative!: (token: typeof mockNativeToken) => void;
    notifications.getDevicePushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveNative = resolve; }));
    renderRegistration(); await flush();
    mockCleanup?.(); mockUser = user('owner-b'); renderRegistration();
    resolveNative(mockNativeToken); await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch as jest.Mock).mock.calls[0][1].headers.authorization).toBe('Bearer auth-owner-b');
    expect(JSON.parse(mockStored.get(storedKey)!).ownerUid).toBe('owner-b');
  });

  it('rechecks the owner after an ID-token await', async () => {
    let resolveAuth!: (token: string) => void;
    mockUser!.getIdToken.mockImplementationOnce(() => new Promise((resolve) => { resolveAuth = resolve; }));
    const pending = api.registerSharedEventPushNotifications(true); await flush();
    mockUser = user('owner-b');
    resolveAuth('auth-owner-a');
    expect(await pending).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('unregisters before sign-out, clears storage, and permits a later sign-in to the same account', async () => {
    renderRegistration(); await flush();
    await api.unregisterSharedEventPushNotifications();
    emit('native-a'); await flush();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'unregister']);
    expect(mockStored.has(storedKey)).toBe(false);
    mockCleanup?.(); mockUser = null;
    mockUser = user(); renderRegistration(); await flush();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'unregister', 'register']);
  });

  it('cancels pending SDK work on logout and ignores the late result', async () => {
    let resolveNative!: (token: typeof mockNativeToken) => void;
    notifications.getDevicePushTokenAsync.mockImplementationOnce(() => new Promise((resolve) => { resolveNative = resolve; }));
    mockStored.set(storedKey, JSON.stringify({ ownerUid: 'owner-a', expoPushToken: 'ExponentPushToken[saved]' }));
    renderRegistration(); await flush();
    await api.unregisterSharedEventPushNotifications();
    resolveNative(mockNativeToken); emit('native-a'); await flush();
    expect(bodies()).toEqual([expect.objectContaining({ action: 'unregister', expoPushToken: 'ExponentPushToken[saved]' })]);
    expect(mockStored.has(storedKey)).toBe(false);
  });

  it('settles an aborted backend registration before unregistering its possibly accepted token', async () => {
    (fetch as jest.Mock).mockImplementationOnce((_url, options) => {
      mockBackendMax = Math.max(mockBackendMax, ++mockBackendActive);
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
        mockBackendActive--; reject(new Error('aborted'));
      }, { once: true }));
    });
    renderRegistration(); await flush();
    await api.unregisterSharedEventPushNotifications();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'unregister']);
    expect(mockBackendMax).toBe(1);
    expect(mockStored.has(storedKey)).toBe(false);
    expect(await api.registerSharedEventPushNotifications(true, mockNativeToken)).toBe(false);
  });

  it('does not unregister or remove another account\'s stored registration', async () => {
    const other = JSON.stringify({ ownerUid: 'owner-b', expoPushToken: 'ExponentPushToken[other]' });
    mockStored.set(storedKey, other);
    await api.unregisterSharedEventPushNotifications();
    expect(fetch).not.toHaveBeenCalled(); expect(mockStored.get(storedKey)).toBe(other);
  });

  it('retries a failed registration on the next trigger without an automatic retry loop', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    renderRegistration(); await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    mockAppListener?.('active'); await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    emit('native-a'); await flush(); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates and unregisters a successful post even if storing it locally fails', async () => {
    storage.setItem.mockRejectedValueOnce(new Error('Storage unavailable'));
    renderRegistration(); await flush();
    emit('native-a'); await flush(); expect(fetch).toHaveBeenCalledTimes(1);
    await api.unregisterSharedEventPushNotifications();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'unregister']);
  });

  it('unregisters the in-memory token if storage cannot be read during logout', async () => {
    renderRegistration(); await flush();
    storage.getItem.mockRejectedValueOnce(new Error('Storage unavailable'));
    await api.unregisterSharedEventPushNotifications();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'unregister']);
    expect(mockStored.has(storedKey)).toBe(false);
  });

  it('times out a backend request and permits a later explicit refresh', async () => {
    (fetch as jest.Mock).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const pending = api.registerSharedEventPushNotifications(true); await flush();
    jest.advanceTimersByTime(12_000); await flush();
    expect(await pending).toBe(false);
    expect(await api.registerSharedEventPushNotifications()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not fetch/register without permission, a physical device or a signed-in user', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: 'denied' });
    notifications.requestPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await api.registerSharedEventPushNotifications(true)).toBe(false);
    expect(notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    mockIsDevice = false; expect(await api.registerSharedEventPushNotifications(true)).toBe(false);
    mockIsDevice = true; mockUser = null; expect(await api.registerSharedEventPushNotifications(true)).toBe(false);
  });

  it('preserves Android\'s existing Expo-token call and forced registration behavior', async () => {
    mockOS = 'android'; mockFetchEmissions = 0;
    expect(await api.registerSharedEventPushNotifications(true)).toBe(true);
    expect(await api.registerSharedEventPushNotifications(true)).toBe(true);
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project' });
    expect(fetch).toHaveBeenCalledTimes(2);
    await api.unregisterSharedEventPushNotifications();
    expect(bodies().map((body) => body.action)).toEqual(['register', 'register', 'unregister']);
  });
});
