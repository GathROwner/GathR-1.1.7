import { EVENTS_MINIMAL } from './queryKeys';
import { useMapStore } from '../store/mapStore';

type QueryClientLike = {
  removeQueries?: (options: { queryKey: readonly unknown[]; exact?: boolean }) => void;
};

export async function refreshMapAfterSharedEventSave(
  queryClient: QueryClientLike | null | undefined = (global as any)?.__RQ_CLIENT ?? null
): Promise<void> {
  // A save can finish while an older event request is still in flight. The
  // first pass drains that request; the second pass is guaranteed to begin
  // after it and therefore includes the newly saved private event.
  queryClient?.removeQueries?.({ queryKey: EVENTS_MINIMAL, exact: true });
  await useMapStore.getState().fetchEvents();

  queryClient?.removeQueries?.({ queryKey: EVENTS_MINIMAL, exact: true });
  await useMapStore.getState().fetchEvents({ forcePrivateSharedServer: true });
}
