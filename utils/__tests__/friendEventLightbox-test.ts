import {
  formatFriendEventGuestResponse,
  getFriendEventLightboxAction,
} from '../friendEventLightbox';

describe('getFriendEventLightboxAction', () => {
  it('keeps host controls on the dedicated management screen', () => {
    expect(getFriendEventLightboxAction({
      viewerRole: 'host',
      guestListVisible: true,
      guestInviteMode: 'host_only',
      guestCount: 3,
    })).toEqual({ kind: 'manage', label: 'Manage' });
  });

  it('opens an in-lightbox guest list when guests are allowed to see it', () => {
    expect(getFriendEventLightboxAction({
      viewerRole: 'guest',
      guestListVisible: true,
      guestInviteMode: 'guests_can_invite',
      guestCount: 3,
    })).toEqual({ kind: 'guests', label: 'Guests (3)' });
  });

  it('offers an invitation sheet without exposing a hidden guest list', () => {
    expect(getFriendEventLightboxAction({
      viewerRole: 'guest',
      guestListVisible: false,
      guestInviteMode: 'guests_can_invite',
      guestCount: 3,
    })).toEqual({ kind: 'invite', label: 'Invite' });
  });

  it('shows no redundant details action when guest names and invites are unavailable', () => {
    expect(getFriendEventLightboxAction({
      viewerRole: 'guest',
      guestListVisible: false,
      guestInviteMode: 'host_only',
      guestCount: 3,
    })).toEqual({ kind: 'none', label: '' });
  });
});

describe('formatFriendEventGuestResponse', () => {
  it('uses end-user RSVP copy', () => {
    expect(formatFriendEventGuestResponse('invited')).toBe('No response');
    expect(formatFriendEventGuestResponse('going')).toBe('Going');
    expect(formatFriendEventGuestResponse('maybe')).toBe('Maybe');
    expect(formatFriendEventGuestResponse('cant_go')).toBe("Can't go");
  });
});
