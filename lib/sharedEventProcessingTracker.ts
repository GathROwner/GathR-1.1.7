import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@gathr/shared-event-processing/v1';

export type PendingSharedEventIngest = {
  ingestId: string;
  sourceLabel?: string;
  createdAt: number;
};

async function readMap(): Promise<Record<string, PendingSharedEventIngest>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: Record<string, PendingSharedEventIngest>): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export async function trackPendingSharedEventIngest(params: {
  ingestId: string;
  sourceLabel?: string;
}): Promise<void> {
  const ingestId = params.ingestId.trim();
  if (!ingestId) return;
  const map = await readMap();
  map[ingestId] = {
    ingestId,
    sourceLabel: params.sourceLabel,
    createdAt: Date.now(),
  };
  await writeMap(map);
}

export async function listPendingSharedEventIngests(): Promise<PendingSharedEventIngest[]> {
  const map = await readMap();
  return Object.values(map)
    .filter((entry) => entry && typeof entry.ingestId === 'string')
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function removePendingSharedEventIngest(ingestId: string): Promise<void> {
  const map = await readMap();
  delete map[ingestId];
  await writeMap(map);
}
