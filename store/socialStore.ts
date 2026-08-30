import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { subscribeToSocialData } from '../services/socialService';
import type {
  BlockProjection,
  FriendActivityProjection,
  FriendEventLocationProjection,
  FriendEventProjection,
  FriendProjection,
  FriendRequestProjection,
  OwnCheckIn,
} from '../types/social';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../types/social';
import { findFriendEventLocation, friendEventToMapEvent } from '../utils/friendEvents';
import { isFriendActivityActive, socialTimestampToMillis } from '../utils/friendPresence';
import { useMapStore } from './mapStore';

interface SocialState {
  uid: string | null;
  friends: FriendProjection[];
  requests: FriendRequestProjection[];
  activity: FriendActivityProjection[];
  blocks: BlockProjection[];
  ownCheckIn: OwnCheckIn | null;
  friendEvents: FriendEventProjection[];
  friendEventLocations: FriendEventLocationProjection[];
  loading: boolean;
  fromCache: boolean;
  error: string | null;
  lastUpdatedAt: number | null;
  listenerReadyCount: number;
  activityReceivedCount: number;
  activityExpiredCount: number;
  mapFriendClusterCount: number;
  mapFriendVenueCount: number;
}

const EMPTY_STATE: SocialState = {
  uid: null,
  friends: [],
  requests: [],
  activity: [],
  blocks: [],
  ownCheckIn: null,
  friendEvents: [],
  friendEventLocations: [],
  loading: false,
  fromCache: false,
  error: null,
  lastUpdatedAt: null,
  listenerReadyCount: 0,
  activityReceivedCount: 0,
  activityExpiredCount: 0,
  mapFriendClusterCount: 0,
  mapFriendVenueCount: 0,
};

export const useSocialStore = create<SocialState>(() => ({ ...EMPTY_STATE }));

let unsubscribeSocial: (() => void) | null = null;
let expiryTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: { remove: () => void } | null = null;
let readyListeners = new Set<string>();

function markListenerReady(name: string, fromCache: boolean) {
  readyListeners.add(name);
  useSocialStore.setState({
    loading: readyListeners.size < (SOCIAL_RELEASE_TWO_ENABLED ? 7 : 5),
    fromCache,
    error: null,
    lastUpdatedAt: Date.now(),
    listenerReadyCount: readyListeners.size,
  });
}

export function pruneExpiredSocialData(nowMs = Date.now()) {
  const state = useSocialStore.getState();
  const activity = state.activity.filter((item) => isFriendActivityActive(item, nowMs));
  const ownExpiry = socialTimestampToMillis(state.ownCheckIn?.expiresAt);
  const ownCheckIn = ownExpiry !== null && ownExpiry > nowMs ? state.ownCheckIn : null;
  if (activity.length !== state.activity.length || ownCheckIn !== state.ownCheckIn) {
    useSocialStore.setState({
      activity,
      ownCheckIn,
      activityExpiredCount: state.activityExpiredCount + (state.activity.length - activity.length),
    });
  }
}

export function setSocialMapDiagnostics(friendClusterCount: number, friendVenueCount: number) {
  const current = useSocialStore.getState();
  if (
    current.mapFriendClusterCount === friendClusterCount
    && current.mapFriendVenueCount === friendVenueCount
  ) return;
  useSocialStore.setState({ mapFriendClusterCount: friendClusterCount, mapFriendVenueCount: friendVenueCount });
}

export function filterAuthoritativeFriendActivity(
  activity: FriendActivityProjection[],
  fromCache: boolean
) {
  if (fromCache) return [];
  return activity.filter((item) => isFriendActivityActive(item));
}

function handleAppState(nextState: AppStateStatus) {
  if (nextState === 'active') pruneExpiredSocialData();
}

function syncFriendEventsToMap() {
  const { friendEvents, friendEventLocations } = useSocialStore.getState();
  const mapEvents = friendEvents.flatMap((event) => {
    const converted = friendEventToMapEvent(
      event,
      findFriendEventLocation(event.eventId, friendEventLocations)
    );
    return converted ? [converted] : [];
  });
  useMapStore.getState().setFriendEvents(mapEvents);
}

export function stopSocialListeners() {
  unsubscribeSocial?.();
  unsubscribeSocial = null;
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  readyListeners = new Set<string>();
  useSocialStore.setState({ ...EMPTY_STATE });
  useMapStore.getState().setFriendEvents([]);
}

export function startSocialListeners(uid: string) {
  if (!SOCIAL_FEATURE_ENABLED || !uid) {
    stopSocialListeners();
    return;
  }
  if (useSocialStore.getState().uid === uid && unsubscribeSocial) return;
  stopSocialListeners();
  useSocialStore.setState({ ...EMPTY_STATE, uid, loading: true });

  unsubscribeSocial = subscribeToSocialData(uid, {
    onFriends: (friends, fromCache) => {
      useSocialStore.setState({ friends });
      markListenerReady('friends', fromCache);
    },
    onRequests: (requests, fromCache) => {
      useSocialStore.setState({ requests });
      markListenerReady('requests', fromCache);
    },
    onActivity: (activity, fromCache) => {
      // Friend presence is authorization-sensitive. A cached projection may have
      // been revoked on the server while this device was offline, so never put
      // cached activity back on the map. The authoritative server snapshot will
      // restore any activity the viewer is still allowed to see after reconnect.
      const active = filterAuthoritativeFriendActivity(activity, fromCache);
      useSocialStore.setState({
        activity: active,
        activityReceivedCount: activity.length,
        activityExpiredCount: activity.length - active.length,
      });
      markListenerReady('activity', fromCache);
    },
    onBlocks: (blocks, fromCache) => {
      useSocialStore.setState({ blocks });
      markListenerReady('blocks', fromCache);
    },
    onOwnCheckIn: (ownCheckIn, fromCache) => {
      useSocialStore.setState({ ownCheckIn });
      pruneExpiredSocialData();
      markListenerReady('ownCheckIn', fromCache);
    },
    onFriendEvents: (friendEvents, fromCache) => {
      // Event authorization can be revoked while offline, so never restore a
      // cached private event onto a map or feed before the server confirms it.
      useSocialStore.setState({ friendEvents: fromCache ? [] : friendEvents });
      syncFriendEventsToMap();
      markListenerReady('friendEvents', fromCache);
    },
    onFriendEventLocations: (friendEventLocations, fromCache) => {
      // Exact private addresses fail closed. Cached address projections are
      // discarded until a current authoritative snapshot is available.
      useSocialStore.setState({ friendEventLocations: fromCache ? [] : friendEventLocations });
      syncFriendEventsToMap();
      markListenerReady('friendEventLocations', fromCache);
    },
    onError: (error) => useSocialStore.setState({ loading: false, error: error.message }),
  });

  expiryTimer = setInterval(() => pruneExpiredSocialData(), 15_000);
  appStateSubscription = AppState.addEventListener('change', handleAppState);
}
