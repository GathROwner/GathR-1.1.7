import AsyncStorage from '@react-native-async-storage/async-storage';

import { useCheckInReadinessStore } from '../store/checkInReadinessStore';
import { pauseReadiness, type CheckInLocationMode } from '../utils/checkInReadiness';

const preferenceKey = (uid: string) => `check-in-readiness-preferences-v1:${uid}`;

export async function loadReadinessPreferences(uid: string) {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(preferenceKey(uid)) || '{}');
    if (useCheckInReadinessStore.getState().uid !== uid) return;
    useCheckInReadinessStore.setState({
      mode: saved.mode === 'basic' ? 'basic' : 'standard',
      lastPromptAtMs: typeof saved.lastPromptAtMs === 'number' && Number.isFinite(saved.lastPromptAtMs)
        ? Math.max(0, saved.lastPromptAtMs) : 0,
      preferencesLoaded: true,
    });
  } catch {
    // If persistence is unavailable, disable automatic prompts for this session.
    if (useCheckInReadinessStore.getState().uid === uid) {
      useCheckInReadinessStore.setState({ preferencesLoaded: true, lastPromptAtMs: Date.now() });
    }
  }
}

async function savePreferences() {
  const { uid, mode, lastPromptAtMs } = useCheckInReadinessStore.getState();
  if (uid) await AsyncStorage.setItem(preferenceKey(uid), JSON.stringify({ mode, lastPromptAtMs }));
}

export async function setReadinessMode(mode: Exclude<CheckInLocationMode, 'proactive'>) {
  const { evidence } = useCheckInReadinessStore.getState();
  useCheckInReadinessStore.setState({ mode, evidence: pauseReadiness(evidence), receipt: null, sessionId: '', grant: null });
  await savePreferences();
}

/** Claim before displaying. Failure suppresses the prompt, never creates a repeat loop. */
export async function claimReadinessPrompt(nowMs: number): Promise<boolean> {
  useCheckInReadinessStore.setState({ lastPromptAtMs: nowMs });
  try { await savePreferences(); return true; } catch { return false; }
}
