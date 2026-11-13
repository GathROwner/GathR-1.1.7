import { useSyncExternalStore } from 'react';
import { otaUpdates } from '../lib/otaUpdates';
export function useOtaStatus() { return useSyncExternalStore(otaUpdates.subscribe, otaUpdates.snapshot, otaUpdates.snapshot); }
