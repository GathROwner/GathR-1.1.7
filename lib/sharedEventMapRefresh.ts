import { useMapStore } from '../store/mapStore';

export async function refreshMapAfterSharedEventSave(): Promise<void> {
  await useMapStore.getState().refreshPrivateSharedEventsFromServer();
}
