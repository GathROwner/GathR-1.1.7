import { useEffect } from 'react';
import { AppState } from 'react-native';
import { hashKey, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { EVENTS_MINIMAL } from '../lib/queryKeys';
import { EVENTS_QUERY_GC_MS, EVENTS_QUERY_STALE_MS } from '../lib/eventCachePolicy';
import type { Event } from '../types/events';
import type { MapState } from '../types/store';
import { recordStartupMilestone } from '../utils/startupTiming';
import { readPublicEventSnapshot } from '../lib/publicEventSnapshot';

type MinimalResult = { combinedData: Event[]; accountId?: string | null };

/** Render saved events after actual restoration, then reconcile the fresh result. */
export function useStartupEventCache(
  fetchEvents: () => Promise<MinimalResult>,
  publish: MapState['setAllEvents'],
  authReady = true,
  accountId: string | null = null,
) {
  const client = useQueryClient();
  const restoring = useIsRestoring();
  useEffect(() => {
    recordStartupMilestone('startup_gate_observed', { authReady, restoring });
    if (authReady) recordStartupMilestone('auth_ready');
    if (!restoring) recordStartupMilestone('cache_restore_ready');
    if (restoring || !authReady) return;
    let active = true;
    let lastResult: unknown;
    let lastUpdatedAt = -1;
    let refreshed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 30000;
    let needsRetry = false;
    let syncing = false;
    let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const publishResult = (result: unknown, source: 'cache' | 'refresh', updatedAt: number) => {
      const feed = result as MinimalResult | undefined;
      if (feed && 'accountId' in feed && feed.accountId !== accountId) return;
      // Legacy query snapshots lack account identity. Only plain public rows
      // can be reused; a private overlay can retain the public source field.
      const items = feed && !('accountId' in feed)
        ? feed.combinedData?.filter(event => event.source !== 'private_shared'
          && event.source !== 'friend_event' && !event.sharedEventProvenance && !event.friendEvent)
        : feed?.combinedData;
      if (!active || !Array.isArray(items) || (source === 'cache' && items.length === 0)) return;
      if (source === 'refresh') refreshed = true;
      if (result === lastResult && updatedAt === lastUpdatedAt) return;
      lastResult = result;
      lastUpdatedAt = updatedAt;
      publish(items, { projectViewport: source });
      recordStartupMilestone(source === 'cache' ? 'startup_cache_published' : 'startup_refresh_published', { items: items.length });
    };
    // Observe successful feed updates without making this an active query or
    // changing its cache lifetime. A request already running before restoration
    // may finish after fetchQuery has returned a fresh restored cache entry.
    const feedHash = hashKey(EVENTS_MINIMAL);
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'success' && event.query.queryHash === feedHash) {
        publishResult(event.query.state.data, 'refresh', event.query.state.dataUpdatedAt);
      }
    });
    const saved = client.getQueryData<MinimalResult>(EVENTS_MINIMAL);
    recordStartupMilestone('startup_cache_checked', {
      items: saved?.combinedData?.length ?? 0,
      ageMs: saved ? Math.max(0, Date.now() - (client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0)) : null,
    });
    publishResult(saved, 'cache', client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0);
    // Never put this public-only copy into React Query as a fresh mixed feed:
    // doing so could suppress the account-aware network refresh.
    void readPublicEventSnapshot().then(snapshot => {
      if (!active || refreshed || !snapshot || snapshot.fetchedAt <= lastUpdatedAt) return;
      publishResult(snapshot, 'cache', snapshot.fetchedAt);
      recordStartupMilestone('durable_public_cache_ready', { items: snapshot.combinedData.length,
        ageMs: Math.max(0, Date.now() - snapshot.fetchedAt) });
    });
    const sync = () => {
      if (!active || syncing) return;
      syncing = true;
      needsRetry = false;
      void client.fetchQuery({
      queryKey: EVENTS_MINIMAL,
      queryFn: fetchEvents,
      staleTime: saved && saved.accountId !== accountId ? 0 : EVENTS_QUERY_STALE_MS,
      gcTime: EVENTS_QUERY_GC_MS,
    }).then(result => {
      needsRetry = false;
      retryDelay = 30000;
      publishResult(result, 'refresh', client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt ?? 0);
    }).catch(error => {
      console.error('[RQ Startup] Refresh failed:', error);
      needsRetry = true;
      if (active && foreground) {
        retryTimer = setTimeout(() => { retryTimer = undefined; sync(); }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 300000);
      }
    }).finally(() => { syncing = false; });
    };
    const appState = AppState.addEventListener('change', state => {
      foreground = state === 'active';
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      retryTimer = undefined;
      if (foreground && needsRetry) sync();
    });
    sync();
    return () => {
      active = false; unsubscribe(); appState.remove();
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [accountId, authReady, client, fetchEvents, publish, restoring]);
}
