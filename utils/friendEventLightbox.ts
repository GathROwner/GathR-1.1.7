import type {
  FriendEventGuestInviteMode,
} from '../types/social';

export type FriendEventLightboxAction =
  | { kind: 'manage'; label: 'Manage' }
  | { kind: 'guests'; label: string }
  | { kind: 'invite'; label: 'Invite' }
  | { kind: 'none'; label: '' };

export function isFriendEventDetailPath(pathname: string): boolean {
  return pathname.startsWith('/friend-event/');
}

interface FriendEventLightboxActionInput {
  viewerRole: 'host' | 'guest';
  guestListVisible: boolean;
  guestInviteMode: FriendEventGuestInviteMode;
  guestCount: number;
}

export function getFriendEventLightboxAction({
  viewerRole,
  guestListVisible,
  guestInviteMode,
  guestCount,
}: FriendEventLightboxActionInput): FriendEventLightboxAction {
  if (viewerRole === 'host') {
    return { kind: 'manage', label: 'Manage' };
  }

  if (guestListVisible) {
    return {
      kind: 'guests',
      label: `Guests (${Math.max(0, Math.floor(guestCount))})`,
    };
  }

  if (guestInviteMode === 'guests_can_invite') {
    return { kind: 'invite', label: 'Invite' };
  }

  return { kind: 'none', label: '' };
}

export function formatFriendEventGuestResponse(
  response: 'invited' | 'going' | 'maybe' | 'cant_go' | 'host'
): string {
  if (response === 'going') return 'Going';
  if (response === 'maybe') return 'Maybe';
  if (response === 'cant_go') return "Can't go";
  if (response === 'host') return 'Host';
  return 'No response';
}
