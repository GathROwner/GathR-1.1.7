import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOtaSafetyBlock } from '../../hooks/useOtaSafetyBlock';
import { initializeOtaUpdates, isOtaSafe, noteOtaExternalIntent, resetOtaExternalIntent, setOtaContext, setOtaQueueBlocked } from '../otaUpdates';

let mockMap: any = {};
let mockTutorial = false;
jest.mock('../../store/mapStore', () => ({ useMapStore: { getState: () => mockMap } }));
jest.mock('../../store/tutorialUiStore', () => ({ useTutorialUiStore: { getState: () => ({ isVisible: mockTutorial }) } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-updates', () => ({ isEnabled: false }));

describe('reload safety across mounted app work', () => {
  beforeEach(async () => {
    mockMap = { selectedVenues: [], searchQuery: '' }; mockTutorial = false;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    await initializeOtaUpdates(); resetOtaExternalIntent(); setOtaQueueBlocked(false);
    setOtaContext({ path: '/profile', uid: 'test-user', blocked: false });
  });
  afterEach(() => jest.restoreAllMocks());
  it('allows a signed-in, guarded idle screen', () => { expect(isOtaSafe()).toBe(true); });
  it.each(['/create-event', '/check-in', '/shared-event', '/interest-selection', '/friends', '/attendance-survey', '/'])('blocks form or unresolved route %s', (path) => {
    setOtaContext({ path, uid: 'test-user', blocked: false }); expect(isOtaSafe()).toBe(false);
  });
  it('blocks auth transitions, keyboard, tutorials, shares, and external intents', () => {
    setOtaContext({ path: '/profile', uid: null, blocked: false }); expect(isOtaSafe()).toBe(true);
    setOtaContext({ path: '/profile', uid: 'test-user', blocked: true }); expect(isOtaSafe()).toBe(false);
    setOtaContext({ path: '/profile', uid: 'test-user', blocked: false });
    setOtaQueueBlocked(true); expect(isOtaSafe()).toBe(false); setOtaQueueBlocked(false);
    (Keyboard.isVisible as jest.Mock).mockReturnValue(true); expect(isOtaSafe()).toBe(false); (Keyboard.isVisible as jest.Mock).mockReturnValue(false);
    mockTutorial = true; expect(isOtaSafe()).toBe(false); mockTutorial = false;
    noteOtaExternalIntent(); expect(isOtaSafe()).toBe(true); // Explicit manual apply still respects real work guards.
  });
  it.each(['selectedImageData', 'selectedVenue', 'selectedCluster', 'activeFilterPanel', 'isHeaderSearchActive', 'pendingRouteEvent', 'searchQuery'])('blocks underlying map flow %s even on Profile', (key) => {
    mockMap[key] = true; expect(isOtaSafe()).toBe(false);
  });
  it('blocks mounted hidden unsaved work until its owner releases it', async () => {
    const Flow = ({ dirty }: { dirty: boolean }) => { useOtaSafetyBlock(dirty); return null; };
    let tree!: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<Flow dirty />); }); expect(isOtaSafe()).toBe(false);
    await act(async () => tree.update(<Flow dirty={false} />)); expect(isOtaSafe()).toBe(true);
    await act(async () => tree.unmount()); expect(isOtaSafe()).toBe(true);
  });
  it('only ignores AppState while capturing a background transition', () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    expect(isOtaSafe()).toBe(false); expect(isOtaSafe(true)).toBe(true);
  });
});
