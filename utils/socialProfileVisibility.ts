import type {
  BlockProjection,
  FriendEventProjection,
  FriendProjection,
  FriendRequestProjection,
} from '../types/social';
import { isFriendEventCurrent, socialTimeToMillis } from './friendEvents';

export type ProfileRelationship =
  | 'self'
  | 'friend'
  | 'incoming'
  | 'outgoing'
  | 'blocked'
  | 'public';

export function deriveProfileRelationship({
  profileUid,
  currentUid,
  friends,
  requests,
  blocks,
}: {
  profileUid: string;
  currentUid: string;
  friends: FriendProjection[];
  requests: FriendRequestProjection[];
  blocks: BlockProjection[];
}): ProfileRelationship {
  if (profileUid === currentUid) return 'self';
  if (blocks.some((block) => block.blockedUid === profileUid)) return 'blocked';
  if (friends.some((friend) => friend.uid === profileUid)) return 'friend';
  const request = requests.find((item) => item.uid === profileUid);
  if (request?.direction === 'incoming') return 'incoming';
  if (request?.direction === 'outgoing') return 'outgoing';
  return 'public';
}

export function selectSharedFriendEvents(
  friendUid: string,
  events: FriendEventProjection[],
  nowMs = Date.now()
) {
  return events
    .filter((event) => {
      if (!isFriendEventCurrent(event, nowMs)) return false;
      if (event.hostUid === friendUid) return true;
      const guestListAuthorized = event.viewerRole === 'host' || event.guestListVisible;
      return guestListAuthorized && event.guests.some((guest) => guest.uid === friendUid);
    })
    .sort((first, second) =>
      (socialTimeToMillis(first.startAt) || Number.MAX_SAFE_INTEGER)
      - (socialTimeToMillis(second.startAt) || Number.MAX_SAFE_INTEGER)
    );
}
