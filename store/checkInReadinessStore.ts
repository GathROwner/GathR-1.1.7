import { create } from 'zustand';

import type { BoundCheckInReadiness, CheckInReadinessReceipt } from '../types/social';
import { emptyReadiness, type CheckInLocationMode, type ReadinessState } from '../utils/checkInReadiness';

interface CheckInReadinessStore {
  uid: string | null;
  mode: CheckInLocationMode;
  preferencesLoaded: boolean;
  foregroundGranted: boolean;
  appActive: boolean;
  evidence: ReadinessState;
  sessionId: string;
  receipt: CheckInReadinessReceipt | null;
  serviceError: boolean;
  lastPromptAtMs: number;
  grant: BoundCheckInReadiness | null;
}

// Sensitive evidence and bound grants stay in memory only. Never persist raw fixes, place IDs or labels.
export const useCheckInReadinessStore = create<CheckInReadinessStore>(() => ({
  uid: null, mode: 'standard', preferencesLoaded: false, foregroundGranted: false,
  appActive: false, evidence: emptyReadiness(), sessionId: '', receipt: null,
  serviceError: false, lastPromptAtMs: 0, grant: null,
}));

export function resetCheckInReadinessOwner(uid: string | null) {
  useCheckInReadinessStore.setState({
    uid, mode: 'standard', preferencesLoaded: false, foregroundGranted: false,
    evidence: emptyReadiness(), sessionId: '', receipt: null, serviceError: false,
    lastPromptAtMs: 0, grant: null,
  });
}
