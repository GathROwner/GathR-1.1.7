import React from 'react';
import { Alert } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import CheckInScreen from '../../../app/check-in';
import { bindCheckInReadiness, createCheckIn, createSocialOperationId } from '../../../services/socialService';
import { requestCheckInPreparationRetry } from '../../../services/checkInPreparation';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams = { readinessVersion: '1', readinessSessionId: 'prepared-session-01', venueId: 'holy-whale', placeType: 'gathr_venue', placeName: 'Holy Whale', placeAddress: 'Public address' };
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
  bindCheckInReadiness: jest.fn(), createCheckIn: jest.fn(), checkOut: jest.fn(), createSocialOperationId: jest.fn(), SocialServiceError: class extends Error {},
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
