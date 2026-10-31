import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import CheckInScreen from '../../../app/check-in';
import { bindCheckInReadiness, createCheckIn, createPrivateCheckInPlaceCandidate, createSocialOperationId } from '../../../services/socialService';
import { requestCheckInPreparationRetry } from '../../../services/checkInPreparation';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockInitialParams = { readinessVersion: '1', readinessSessionId: 'prepared-session-01', venueId: 'holy-whale', placeType: 'gathr_venue', placeName: 'Holy Whale', placeAddress: 'Public address' };
const mockParams: Record<string, string> = { ...mockInitialParams };
const mockMapState = { allEvents: [], selectedVenues: [] };
const mockSocialState = { friends: [{ uid: 'friend-01', displayName: 'Friend', socialHandle: 'friend' }], ownCheckIn: null, fromCache: false };
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ replace: mockReplace, back: mockBack }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: jest.requireActual('react-native').View }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn().mockResolvedValue(undefined), NotificationFeedbackType: { Success: 'success' } }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: jest.requireActual('react-native').View, SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'check-in-test-user' } }) }));
jest.mock('../../../store', () => ({ useMapStore: (selector: (state: typeof mockMapState) => unknown) => selector(mockMapState) }));
jest.mock('../../../store/socialStore', () => ({ useSocialStore: () => mockSocialState }));
jest.mock('../../../types/social', () => ({ SOCIAL_FEATURE_ENABLED: true, SOCIAL_RELEASE_TWO_ENABLED: true }));
jest.mock('../../../services/checkInPreparation', () => ({ requestCheckInPreparationRetry: jest.fn() }));
jest.mock('../../../utils/friendPresence', () => ({ formatCheckInVisibilityCopy: () => 'Only your friends can see this check-in.', getRecognizedVenueId: () => '' }));
jest.mock('../../../services/socialService', () => ({
  bindCheckInReadiness: jest.fn(), createCheckIn: jest.fn(), createPrivateCheckInPlaceCandidate: jest.fn(), checkOut: jest.fn(), createSocialOperationId: jest.fn(), SocialServiceError: class extends Error {},
}));

describe('qualified-arrival final confirmation', () => {
  let component: renderer.ReactTestRenderer | undefined;
  const control = () => component!.root;
  const confirm = () => control().findByProps({ accessibilityLabel: 'Confirm check-in' });
  const note = () => control().findByProps({ accessibilityLabel: 'Optional check-in note' });
  const mount = async () => { await act(async () => { component = renderer.create(<CheckInScreen />); }); };
  const grant = () => ({ protocolVersion: 1, readinessSessionId: mockParams.readinessSessionId, eligibilitySessionId: mockParams.readinessSessionId,
    venueId: 'holy-whale', locationType: 'gathr_venue', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 });
  const arrival = () => ({ sessionId: mockParams.readinessSessionId, latitude: 46.235, longitude: -63.129,
    accuracyMeters: 10, capturedAtMs: Date.now(), expiresAtMs: Date.now() + 180_000, here: true, place: true });
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(2_000_000_100_000); jest.clearAllMocks();
    for (const key of Object.keys(mockParams)) delete mockParams[key];
    Object.assign(mockParams, mockInitialParams);
    resetCheckInReadinessOwner('check-in-test-user');
    useCheckInReadinessStore.setState({ sessionId: mockParams.readinessSessionId, foregroundGranted: true, appActive: true, preferencesLoaded: true,
      arrival: arrival(), attempt: { arrival: arrival(), capturedAtMs: Date.now() }, receipt: null });
    (createSocialOperationId as jest.Mock).mockReturnValue('operation-unique-01');
    (bindCheckInReadiness as jest.Mock).mockImplementation(async () => grant());
    (createCheckIn as jest.Mock).mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.text === 'Check in')?.onPress?.();
    });
  });
  afterEach(() => { act(() => component?.unmount()); component = undefined; jest.useRealTimers(); jest.restoreAllMocks(); });

  const externalKey = `external:${'a'.repeat(32)}`;
  const seedExternal = () => {
    Object.assign(mockParams, { venueId: '', placeCandidateId: 'original-candidate', placeType: 'external_place', placeName: 'Fox and Crow' });
    const state = useCheckInReadinessStore.getState();
    const candidate = { id: 'original-candidate', locationKey: externalKey, type: 'external_place' as const,
      name: 'Fox and Crow', address: '', category: 'Pub', latitude: 46.235, longitude: -63.129, distanceMetres: 0 };
    useCheckInReadinessStore.setState({ preparation: { ...state.preparation, sessionId: state.sessionId,
      latitude: candidate.latitude, longitude: candidate.longitude, expiresAtMs: Date.now() + 300_000,
      canonical: { status: 'ready', candidates: [], error: '', retryAtMs: 0 },
      external: { status: 'ready', candidates: [candidate], error: '', retryAtMs: 0 } } });
    (bindCheckInReadiness as jest.Mock).mockImplementation(async input => ({ protocolVersion: 1,
      readinessSessionId: input.readinessSessionId, eligibilitySessionId: input.readinessSessionId,
      placeCandidateId: input.placeCandidateId, locationType: 'external_place', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 }));
    return candidate;
  };

  const seedPrivate = () => {
    Object.assign(mockParams, { venueId: '', placeCandidateId: 'expired-private', placeType: 'private_place', placeName: 'Home', placeAddress: '' });
    const candidate = { id: 'fresh-private', type: 'private_place' as const, name: 'Home', address: '', category: 'Private location',
      latitude: 46.235, longitude: -63.129, distanceMetres: 0 };
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockResolvedValue({ candidate });
    (bindCheckInReadiness as jest.Mock).mockImplementation(async input => ({ protocolVersion: 1,
      readinessSessionId: input.readinessSessionId, eligibilitySessionId: input.readinessSessionId,
      placeCandidateId: input.placeCandidateId, locationType: 'private_place', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 }));
    (bindCheckInReadiness as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Refresh this check-in place and try again.'), { code: 'failed-precondition' }));
    return candidate;
  };
  const refresh = () => control().findByProps({ testID: 'refresh-check-in-verification' });

  it('refreshes an expired private selection after21 minutes using current Here-only presence without losing the draft', async () => {
    seedPrivate(); await mount();
    act(() => { note().props.onChangeText('Saved private note'); control().findByProps({ accessibilityLabel: '120 minute check-in' }).props.onPress(); });
    await act(async () => confirm().props.onPress());
    act(() => {
      jest.setSystemTime(Date.now() + 21 * 60_000); jest.advanceTimersByTime(1000);
      const renewed = { ...arrival(), sessionId: 'fresh-here-session', place: false };
      useCheckInReadinessStore.setState({ sessionId: renewed.sessionId, arrival: renewed, attempt: null });
    });
    await act(async () => refresh().props.onPress());
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledTimes(1);
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Home', readinessSessionId: 'fresh-here-session', capturedAtMs: Date.now() }));
    expect(note().props.value).toBe('Saved private note'); expect(confirm().props.disabled).toBe(false);
    expect(control().findByProps({ accessibilityLabel: '120 minute check-in' }).props.accessibilityState.selected).toBe(true);
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenLastCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-private', readinessSessionId: 'fresh-here-session' }));
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-private', durationMinutes: 120,
      audienceMode: 'all_friends', shareExactLocation: false, message: 'Saved private note' }));
    expect(requestCheckInPreparationRetry).not.toHaveBeenCalled();
  }, 20_000);

  it.each(['unqualified', 'departure', 'revoked', 'owner'])('refuses private remint for %s presence and preserves the draft', async reason => {
    seedPrivate(); await mount(); act(() => note().props.onChangeText('Do not discard'));
    await act(async () => confirm().props.onPress());
    act(() => {
      const state = useCheckInReadinessStore.getState();
      if (reason === 'unqualified') useCheckInReadinessStore.setState({ arrival: null, attempt: null });
      if (reason === 'departure') useCheckInReadinessStore.setState({ arrival: { ...arrival(), latitude: 46.245 }, attempt: null });
      if (reason === 'revoked') useCheckInReadinessStore.setState({ revocationRevision: state.revocationRevision + 1 });
      if (reason === 'owner') useCheckInReadinessStore.setState({ uid: 'another-user' });
    });
    await act(async () => refresh().props.onPress());
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled(); expect(createCheckIn).not.toHaveBeenCalled();
    expect(note().props.value).toBe('Do not discard');
  });

  it('deduplicates private refresh taps before React updates busy state', async () => {
    const candidate = seedPrivate(); await mount(); await act(async () => confirm().props.onPress());
    let finish!: (value: unknown) => void;
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const button = refresh();
    await act(async () => { void button.props.onPress(); void button.props.onPress(); });
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledTimes(1);
    await act(async () => finish({ candidate }));
    await act(async () => confirm().props.onPress());
    expect(createCheckIn).toHaveBeenCalledTimes(1);
  });

  it('retains selected audience and explicit precise-sharing intent while expiry pauses authorization', async () => {
    seedPrivate(); await mount();
    act(() => control().findByProps({ accessibilityLabel: 'Selected friends, 0' }).props.onPress());
    act(() => control().findByProps({ accessibilityLabel: 'Friend, @friend' }).props.onPress());
    act(() => control().findByProps({ accessibilityLabel: 'Done choosing friends, 1 selected' }).props.onPress());
    const exact = () => control().findByProps({ accessibilityLabel: 'Share precise location with selected friends' });
    act(() => exact().props.onValueChange(true));
    act(() => jest.advanceTimersByTime(181_000));
    expect(exact().props.value).toBe(true); expect(exact().props.disabled).toBe(true); expect(confirm().props.disabled).toBe(true);
    act(() => {
      const renewed = { ...arrival(), sessionId: 'fresh-private-session', place: false };
      useCheckInReadinessStore.setState({ sessionId: renewed.sessionId, arrival: renewed, attempt: null });
    });
    await act(async () => refresh().props.onPress());
    expect(exact().props.value).toBe(true); expect(exact().props.disabled).toBe(false);
    (bindCheckInReadiness as jest.Mock).mockReset().mockImplementation(async input => ({ protocolVersion: 1,
      readinessSessionId: input.readinessSessionId, eligibilitySessionId: input.readinessSessionId, placeCandidateId: input.placeCandidateId,
      locationType: 'private_place', exactPrivateAllowed: true, expiresAtMs: Date.now() + 300_000 }));
    await act(async () => confirm().props.onPress());
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-private', audienceMode: 'selected_friends',
      selectedUids: ['friend-01'], shareExactLocation: true }));
  });

  it.each(['owner', 'session', 'departure'])('ignores a private refresh response after %s changed', async change => {
    const candidate = seedPrivate(); await mount(); await act(async () => confirm().props.onPress());
    const originalRevision = useCheckInReadinessStore.getState().revocationRevision;
    let finish!: (value: unknown) => void;
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => { void refresh().props.onPress(); });
    act(() => {
      if (change === 'owner') useCheckInReadinessStore.setState({ uid: 'replacement-owner' });
      if (change === 'session') useCheckInReadinessStore.setState({ sessionId: 'replacement-session', arrival: { ...arrival(), sessionId: 'replacement-session' }, attempt: null });
      if (change === 'departure') useCheckInReadinessStore.setState({ revocationRevision: originalRevision + 1 });
    });
    await act(async () => finish({ candidate }));
    act(() => useCheckInReadinessStore.setState({ uid: 'check-in-test-user', sessionId: mockParams.readinessSessionId,
      arrival: arrival(), attempt: null, revocationRevision: originalRevision }));
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenLastCalledWith(expect.objectContaining({ placeCandidateId: 'expired-private' }));
  });

  it('keeps the private draft on refresh failure and permits one explicit retry', async () => {
    seedPrivate(); await mount(); act(() => note().props.onChangeText('Keep after network failure'));
    await act(async () => confirm().props.onPress());
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => refresh().props.onPress());
    expect(note().props.value).toBe('Keep after network failure');
    await act(async () => refresh().props.onPress());
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledTimes(2);
    await act(async () => confirm().props.onPress());
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-private', message: 'Keep after network failure' }));
  });

  it('rejects an invalid refreshed private target without changing the draft or creating', async () => {
    const candidate = seedPrivate(); await mount(); act(() => note().props.onChangeText('Keep safe'));
    await act(async () => confirm().props.onPress());
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockResolvedValueOnce({ candidate: { ...candidate, longitude: candidate.longitude + 360 } });
    await act(async () => refresh().props.onPress());
    expect(note().props.value).toBe('Keep safe'); expect(createCheckIn).not.toHaveBeenCalled();
    expect(JSON.stringify(component!.toJSON())).toContain('could not be refreshed safely');
  });

  it('retries an uncertain private bind with its original candidate and operation instead of reminting', async () => {
    seedPrivate(); (bindCheckInReadiness as jest.Mock).mockReset().mockRejectedValueOnce(new Error('Connection lost')).mockImplementation(async input => ({
      protocolVersion: 1, readinessSessionId: input.readinessSessionId, eligibilitySessionId: input.readinessSessionId,
      placeCandidateId: input.placeCandidateId, locationType: 'private_place', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 }));
    await mount(); await act(async () => confirm().props.onPress());
    await act(async () => refresh().props.onPress());
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled();
    await act(async () => confirm().props.onPress());
    expect((bindCheckInReadiness as jest.Mock).mock.calls[1][0]).toEqual((bindCheckInReadiness as jest.Mock).mock.calls[0][0]);
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'expired-private' }));
  });

  it('reuses the private grant and create operation after an uncertain create even when arrival expires', async () => {
    seedPrivate(); (bindCheckInReadiness as jest.Mock).mockReset().mockImplementation(async input => ({ protocolVersion: 1,
      readinessSessionId: input.readinessSessionId, eligibilitySessionId: input.readinessSessionId, placeCandidateId: input.placeCandidateId,
      locationType: 'private_place', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 }));
    (createCheckIn as jest.Mock).mockRejectedValueOnce(new Error('Connection lost'));
    await mount(); await act(async () => confirm().props.onPress());
    act(() => { jest.advanceTimersByTime(181_000); useCheckInReadinessStore.setState({ arrival: null, attempt: null, sessionId: '' }); });
    await act(async () => refresh().props.onPress());
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled();
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1);
    expect((createCheckIn as jest.Mock).mock.calls[1][0]).toEqual((createCheckIn as jest.Mock).mock.calls[0][0]);
  });

  // Measured local RN setup took8.4s under host load; the fake-clock/store step took40ms.
  // This wall-clock harness allowance changes no product timer or other test budget.
  it('keeps a 21-minute privacy draft and binds/creates the latest same-source candidate without a lookup', async () => {
    const candidate = seedExternal(); await mount(); act(() => note().props.onChangeText('Preserved long-form note'));
    act(() => control().findByProps({ accessibilityLabel: '120 minute check-in' }).props.onPress());
    jest.setSystemTime(Date.now() + 21 * 60_000);
    act(() => {
      jest.advanceTimersByTime(1000);
      const state = useCheckInReadinessStore.getState();
      const renewed = { ...arrival(), sessionId: 'renewed-session' };
      useCheckInReadinessStore.setState({ sessionId: renewed.sessionId, arrival: renewed, attempt: null,
        preparation: { ...state.preparation, sessionId: renewed.sessionId, expiresAtMs: Date.now() + 300_000,
          external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'fresh-candidate' }] } } });
    });
    expect(confirm().props.disabled).toBe(false);
    expect(note().props.value).toBe('Preserved long-form note');
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledWith(expect.objectContaining({ readinessSessionId: 'renewed-session', placeCandidateId: 'fresh-candidate' }));
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-candidate', message: 'Preserved long-form note', audienceMode: 'all_friends', durationMinutes: 120 }));
    expect(requestCheckInPreparationRetry).not.toHaveBeenCalled();
  }, 20_000);

  it('retains a matching bound UUID for retry after candidate rotation and arrival expiry', async () => {
    const candidate = seedExternal();
    (createCheckIn as jest.Mock).mockRejectedValueOnce(new Error('Connection lost'));
    await mount(); await act(async () => confirm().props.onPress());
    act(() => { const state = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ arrival: null, attempt: null,
      preparation: { ...state.preparation, external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'rotated-again' }] } } }); });
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1);
    expect((createCheckIn as jest.Mock).mock.calls[1][0]).toEqual((createCheckIn as jest.Mock).mock.calls[0][0]);
  });

  it('preserves the note and disables confirmation when the same source target is no longer eligible', async () => {
    seedExternal(); await mount(); act(() => note().props.onChangeText('Keep this draft'));
    act(() => { const state = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ preparation: {
      ...state.preparation, external: { ...state.preparation.external, candidates: [] } } }); });
    expect(confirm().props.disabled).toBe(true);
    expect(note().props.value).toBe('Keep this draft');
    expect(bindCheckInReadiness).not.toHaveBeenCalled(); expect(createCheckIn).not.toHaveBeenCalled();
  });

  it('keeps the original eligible UUID usable when an older server omits the optional stable key', async () => {
    seedExternal(); const state = useCheckInReadinessStore.getState();
    useCheckInReadinessStore.setState({ preparation: { ...state.preparation,
      external: { ...state.preparation.external, candidates: state.preparation.external.candidates.map(({ locationKey: _key, ...candidate }) => candidate) } } });
    await mount(); await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'original-candidate' }));
  });

  it('retries the same pending bind target and operation after an uncertain response and pool rotation', async () => {
    const candidate = seedExternal(); let rejectBind!: (error: Error) => void;
    (bindCheckInReadiness as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectBind = reject; }));
    await mount(); await act(async () => confirm().props.onPress());
    act(() => { const state = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ preparation: {
      ...state.preparation, external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'pool-rotated' }] } } }); });
    await act(async () => rejectBind(new Error('Network unavailable')));
    await act(async () => confirm().props.onPress());
    expect((bindCheckInReadiness as jest.Mock).mock.calls[1][0]).toEqual((bindCheckInReadiness as jest.Mock).mock.calls[0][0]);
    expect(createSocialOperationId).toHaveBeenCalledTimes(2); // One bind operation, one final create.
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'original-candidate' }));
  });

  it('uses a newly prepared UUID after a definitive expired-candidate rejection', async () => {
    const candidate = seedExternal();
    (bindCheckInReadiness as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Refresh this place'), { code: 'failed-precondition' }));
    await mount(); await act(async () => confirm().props.onPress());
    act(() => { const state = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ preparation: {
      ...state.preparation, external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'fresh-after-rejection' }] } } }); });
    await act(async () => confirm().props.onPress());
    expect((bindCheckInReadiness as jest.Mock).mock.calls[1][0]).toMatchObject({ placeCandidateId: 'fresh-after-rejection' });
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ placeCandidateId: 'fresh-after-rejection' }));
  });

  it('cancels a pending renewed-UUID bind without creating or retaining its late grant', async () => {
    const candidate = seedExternal(); await mount();
    act(() => { const state = useCheckInReadinessStore.getState(); const renewed = { ...arrival(), sessionId: 'renewed-session' };
      useCheckInReadinessStore.setState({ sessionId: renewed.sessionId, arrival: renewed, attempt: null,
        preparation: { ...state.preparation, sessionId: renewed.sessionId,
          external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'renewed-candidate' }] } } }); });
    let finish!: (value: unknown) => void;
    (bindCheckInReadiness as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => confirm().props.onPress());
    act(() => component?.unmount()); component = undefined;
    expect(useCheckInReadinessStore.getState().sessionId).toBe('');
    await act(async () => finish({ protocolVersion: 1, readinessSessionId: 'renewed-session', eligibilitySessionId: 'renewed-session',
      placeCandidateId: 'renewed-candidate', locationType: 'external_place', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300_000 }));
    expect(createCheckIn).not.toHaveBeenCalled(); expect(useCheckInReadinessStore.getState().grant).toBeNull();
  });

  it('preserves qualification on Back after a definitive bind rejection without a grant', async () => {
    seedExternal();
    (bindCheckInReadiness as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Refresh this place'), { code: 'failed-precondition' }));
    await mount(); await act(async () => confirm().props.onPress());
    const before = useCheckInReadinessStore.getState();
    act(() => component?.unmount()); component = undefined;
    expect(useCheckInReadinessStore.getState()).toMatchObject({ sessionId: before.sessionId, arrival: before.arrival, grant: null });
    expect(before.arrival?.place).toBe(true);
  });

  it('uses the captured server arrival even without a current raw receipt and sends public privacy explicitly', async () => {
    await mount(); act(() => note().props.onChangeText('Meeting friends'));
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledWith(expect.objectContaining({ useQualifiedArrival: true, readinessSessionId: mockParams.readinessSessionId,
      venueId: 'holy-whale', capturedAtMs: 2_000_000_100_000 }));
    expect(createCheckIn).toHaveBeenCalledWith(expect.objectContaining({ venueId: 'holy-whale', eligibilitySessionId: mockParams.readinessSessionId,
      durationMinutes: 60, audienceMode: 'all_friends', shareExactLocation: false, message: 'Meeting friends' }));
  });

  it('accepts a matching bound grant when the arrival lease expires while binding is in flight', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => { confirm().props.onPress(); });
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(181_000); useCheckInReadinessStore.setState({ arrival: null, attempt: null, receipt: null, sessionId: '' }); });
    await act(async () => { finish(grant()); });
    expect(createCheckIn).toHaveBeenCalledTimes(1);
  });

  it('rejects a returned grant after an explicit departure revocation during binding', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => { confirm().props.onPress(); });
    act(() => { const current = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ revocationRevision: current.revocationRevision + 1, arrival: null, attempt: null }); });
    await act(async () => { finish(grant()); });
    expect(createCheckIn).not.toHaveBeenCalled(); expect(Alert.alert).toHaveBeenCalled();
  });

  it('does not create a check-in or retain a late grant after leaving during a pending bind', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => { confirm().props.onPress(); });
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1);
    act(() => component?.unmount()); component = undefined;
    await act(async () => { finish(grant()); });
    expect(createCheckIn).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
    expect(useCheckInReadinessStore.getState().attempt).toBeNull();
    expect(useCheckInReadinessStore.getState().sessionId).toBe('');
  });

  it.each(['owner', 'session'])('leaves replacement %s evidence untouched when a pending screen unmounts', async replacement => {
    let finish: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); await act(async () => { confirm().props.onPress(); });
    const replacementSessionId = replacement === 'owner' ? mockParams.readinessSessionId : 'replacement-readiness-session';
    const replacementArrival = { ...arrival(), sessionId: replacementSessionId };
    const replacementState = { uid: replacement === 'owner' ? 'replacement-check-in-owner' : 'check-in-test-user',
      sessionId: replacementSessionId, arrival: replacementArrival, attempt: { arrival: replacementArrival, capturedAtMs: Date.now() },
      grant: { ...grant(), protocolVersion: 1 as const, locationType: 'gathr_venue' as const,
        readinessSessionId: replacementSessionId, eligibilitySessionId: replacementSessionId } };
    act(() => useCheckInReadinessStore.setState(replacementState));
    act(() => component?.unmount()); component = undefined;
    await act(async () => { finish(grant()); });
    expect(createCheckIn).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState()).toMatchObject(replacementState);
  });

  it('deduplicates rapid confirm taps before React has updated busy state', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await mount(); const button = confirm();
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1);
    await act(async () => { finish(grant()); }); expect(createCheckIn).toHaveBeenCalledTimes(1);
  });

  it('retains audience, duration and note after a failed create and reuses the same operation and bound grant', async () => {
    (createCheckIn as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({});
    await mount(); act(() => note().props.onChangeText('Keep this note'));
    act(() => control().findByProps({ accessibilityLabel: '120 minute check-in' }).props.onPress());
    await act(async () => confirm().props.onPress());
    expect(note().props.value).toBe('Keep this note');
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1); expect(createCheckIn).toHaveBeenCalledTimes(2);
    expect((createCheckIn as jest.Mock).mock.calls[0][0]).toEqual((createCheckIn as jest.Mock).mock.calls[1][0]);
    expect((createCheckIn as jest.Mock).mock.calls[1][0]).toMatchObject({ durationMinutes: 120, message: 'Keep this note' });
  });

  it('keeps expired form choices and offers explicit refresh instead of resetting the form', async () => {
    await mount(); act(() => note().props.onChangeText('Saved across expiry'));
    await act(async () => { jest.advanceTimersByTime(181_000); });
    expect(confirm().props.disabled).toBe(true); expect(note().props.value).toBe('Saved across expiry');
    expect(control().findByProps({ testID: 'check-in-preparation-status' })).toBeTruthy();
    await act(async () => control().findByProps({ testID: 'refresh-check-in-verification' }).props.onPress());
    expect(requestCheckInPreparationRetry).toHaveBeenCalledWith('all'); expect(createCheckIn).not.toHaveBeenCalled();
  });

  it('refreshes an error with a still-valid grant without starting preparation after its arrival expired', async () => {
    (createCheckIn as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({});
    await mount(); await act(async () => confirm().props.onPress());
    await act(async () => { jest.advanceTimersByTime(181_000); useCheckInReadinessStore.setState({ arrival: null, attempt: null, sessionId: '' }); });
    expect(confirm().props.disabled).toBe(false);
    await act(async () => control().findByProps({ testID: 'refresh-check-in-verification' }).props.onPress());
    expect(requestCheckInPreparationRetry).not.toHaveBeenCalled();
    await act(async () => confirm().props.onPress());
    expect(bindCheckInReadiness).toHaveBeenCalledTimes(1); expect(createCheckIn).toHaveBeenCalledTimes(2);
  });

  it('cleans a newly refreshed session grant on cancel after failed create', async () => {
    await mount(); await act(async () => { jest.advanceTimersByTime(181_000); });
    const renewed = { ...arrival(), sessionId: 'renewed-session-02' };
    act(() => {
      const state = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({ sessionId: renewed.sessionId, arrival: renewed, attempt: null,
        preparation: { ...state.preparation, sessionId: renewed.sessionId, latitude: renewed.latitude, longitude: renewed.longitude, expiresAtMs: Date.now() + 300_000,
          canonical: { status: 'ready', candidates: [], error: '', retryAtMs: 0 }, external: { status: 'ready', candidates: [], error: '', retryAtMs: 0 } } });
    });
    await act(async () => control().findByProps({ testID: 'refresh-check-in-verification' }).props.onPress());
    (bindCheckInReadiness as jest.Mock).mockResolvedValue({ ...grant(), readinessSessionId: renewed.sessionId, eligibilitySessionId: renewed.sessionId });
    (createCheckIn as jest.Mock).mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => confirm().props.onPress());
    expect(useCheckInReadinessStore.getState().grant?.readinessSessionId).toBe(renewed.sessionId);
    await act(async () => control().findByProps({ accessibilityLabel: 'Cancel check-in' }).props.onPress());
    act(() => component?.unmount()); component = undefined;
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
    expect(useCheckInReadinessStore.getState().sessionId).toBe('');
  });
});
