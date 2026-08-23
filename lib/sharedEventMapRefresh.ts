import { EVENTS_MINIMAL } from './queryKeys';
import { useMapStore } from '../store/mapStore';

type QueryClientLike = {
  removeQueries?: (options: { queryKey: readonly unknown[]; exact?: boolean }) => void;
};

export async function refreshMapAfterSharedEventSave(
  queryClient: QueryClientLike | null | undefined = (global as any)?.__RQ_CLIENT ?? null
): Promise<void> {
  // A saved private event must bypass the normal three-minute event cache.
  // Removing only this query keeps every other app cache and session intact.
  queryClient?.removeQueries?.({ queryKey: EVENTS_MINIMAL, exact: true });
  await useMapStore.getState().fetchEvents();
}
