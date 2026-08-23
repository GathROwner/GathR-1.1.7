import { useMapStore } from '../store/mapStore';

export async function refreshMapAfterSharedEventSave(privateEventIds?: string[]): Promise<void> {
  await useMapStore.getState().refreshPrivateSharedEventsFromServer(privateEventIds);
}
