import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { setReadinessMode } from '../checkInReadinessPreferences';

jest.mock('@react-native-async-storage/async-storage', () => ({ setItem: jest.fn(), getItem: jest.fn() }));

describe('explicit check-in location preference revocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCheckInReadinessOwner('preference-user');
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    const arrival = { sessionId: 'arrival-session', expiresAtMs: Date.now() + 180_000,
      latitude: 46.2, longitude: -63.1, accuracyMeters: 17, capturedAtMs: Date.now(), here: true, place: true };
    const current = useCheckInReadinessStore.getState();
    useCheckInReadinessStore.setState({ arrival, attempt: { arrival, capturedAtMs: Date.now() }, sessionId: arrival.sessionId,
      preparation: { ...current.preparation, sessionId: arrival.sessionId, expiresAtMs: arrival.expiresAtMs,
        canonical: { status: 'ready', candidates: [], error: '', retryAtMs: 0 } } });
  });

  it('revokes all prepared evidence and in-flight confirmation generation when browsing without location', async () => {
    const revision = useCheckInReadinessStore.getState().revocationRevision;
    await setReadinessMode('basic');
    const state = useCheckInReadinessStore.getState();
    expect(state).toMatchObject({ mode: 'basic', arrival: null, attempt: null, grant: null, sessionId: '', receipt: null });
    expect(state.preparation.canonical.status).toBe('idle');
    expect(state.revocationRevision).toBe(revision + 1);
  });

  it('persists only preference metadata and never the qualified location or candidates', async () => {
    await setReadinessMode('basic');
    const [, json] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['lastPromptAtMs', 'mode']);
  });

  it('keeps local evidence revoked when preference persistence fails', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Local storage unavailable'));
    await expect(setReadinessMode('basic')).rejects.toThrow('Local storage unavailable');
    expect(useCheckInReadinessStore.getState()).toMatchObject({ mode: 'basic', arrival: null, attempt: null, sessionId: '' });
  });
});
