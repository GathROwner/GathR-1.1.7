import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAutomaticOtaUpdates } from '../useAutomaticOtaUpdates';
import { otaUpdates } from '../../lib/otaUpdates';

let mockNative: any;
let mockGeneration = 0;
let mockExternal = false;
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-updates', () => ({ useUpdates: () => mockNative, updateId: 'new' }));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: () => ({ remove: jest.fn() }),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../lib/sharedEventUploadQueue', () => ({ subscribeSharedEventUploadJobs: (callback: any) => { callback([]); return jest.fn(); } }));
jest.mock('../../lib/otaUpdates', () => ({
  otaEnabled: true, OTA_RETURN_KEY: 'return', OTA_SAFE_PATHS: ['/map', '/events', '/specials', '/profile'],
  initializeOtaUpdates: jest.fn(async () => undefined), isOtaSafe: () => true,
  setOtaContext: jest.fn(), setOtaQueueBlocked: jest.fn(),
  otaInteractionGeneration: () => mockGeneration, hasOtaExternalIntent: () => mockExternal,
  noteOtaExternalIntent: () => { mockExternal = true; mockGeneration++; }, resetOtaExternalIntent: () => { mockExternal = false; },
  otaUpdates: { check: jest.fn(), foreground: jest.fn(), background: jest.fn(), nativeDownload: jest.fn(), ready: jest.fn() },
}));

describe('OTA host lifecycle and navigation restoration', () => {
  let tree: renderer.ReactTestRenderer;
  let onState: (state: string) => void;
  const Host = ({ path = '/map', uid = 'user', blocked = false }: { path?: string; uid?: string; blocked?: boolean }) => { useAutomaticOtaUpdates(path, uid, blocked); return null; };
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks(); mockGeneration = 0; mockExternal = false;
    mockNative = { isStartupProcedureRunning: false, isDownloading: false, isUpdatePending: false };
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_event: string, callback: any) => { onState = callback; return { remove: jest.fn() }; }) as any);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  });
  afterEach(async () => { if (tree) await act(async () => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
  const mount = async (path = '/map') => { await act(async () => { tree = renderer.create(<Host path={path} />); }); };
  it('restores Profile over its previous tab so Back has a destination', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ id: 'new', uid: 'user', path: '/profile', basePath: '/events', expires: Date.now() + 120_000 }));
    await mount(); expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/events'); expect(mockRouter.push).not.toHaveBeenCalled();
    await act(async () => tree.update(<Host path="/events" />)); expect(mockRouter.push).toHaveBeenCalledWith('/profile');
    await act(async () => tree.update(<Host path="/profile" />)); expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
  it('restores Profile even when the base tab is already active', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ id: 'new', uid: 'user', path: '/profile', basePath: '/map', expires: Date.now() + 120_000 }));
    await mount(); expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/map'); expect(mockRouter.push).toHaveBeenCalledWith('/profile');
  });
  it('does not override a new interaction while storage resolves', async () => {
    let resolve!: (value: string) => void;
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    await mount(); mockGeneration++;
    await act(async () => resolve(JSON.stringify({ id: 'new', uid: 'user', path: '/events', expires: Date.now() + 120_000 })));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  it.each(['wrong-user', 'expired', 'other-update', 'incoming-link'])('ignores %s restore token', async (scenario) => {
    if (scenario === 'incoming-link') (Linking.getInitialURL as jest.Mock).mockResolvedValue('gathr://event/example');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ id: scenario === 'other-update' ? 'old' : 'new', uid: scenario === 'wrong-user' ? 'other' : 'user', path: '/events', expires: Date.now() + (scenario === 'expired' ? -1 : 120_000) }));
    await mount(); expect(mockRouter.replace).not.toHaveBeenCalled();
  });
  it('does not run foreground logic during native startup or download', async () => {
    mockNative.isStartupProcedureRunning = true; mockNative.isDownloading = true;
    await mount();
    await act(async () => { onState('background'); onState('active'); jest.advanceTimersByTime(600); });
    expect(otaUpdates.check).not.toHaveBeenCalled(); expect(otaUpdates.foreground).not.toHaveBeenCalled();
  });
  it('does not treat inactive permission prompts as actual absence', async () => {
    await mount(); await act(async () => { onState('inactive'); onState('active'); jest.advanceTimersByTime(600); });
    expect(otaUpdates.background).not.toHaveBeenCalled();
  });
  it('cancels automatic return application after a touch', async () => {
    await mount('/events'); await act(async () => { onState('background'); onState('active'); mockGeneration++; jest.advanceTimersByTime(600); });
    expect(otaUpdates.foreground).toHaveBeenCalledWith(false);
  });
  it('defers map automatic return and recovers native pending readiness', async () => {
    mockNative.isUpdatePending = true; mockNative.downloadedUpdate = { updateId: 'pending' };
    await mount(); await act(async () => { onState('background'); });
    expect(otaUpdates.background).toHaveBeenCalledWith(false); expect(otaUpdates.ready).toHaveBeenCalledWith('pending');
  });
});
