import type { FriendEventLocationProjection, FriendEventProjection } from '../../types/social';
import {
  resolveFriendEventAudience,
  resolveFriendEventDetail,
  resolveFriendEventLocation,
} from '../friendEventAccess';

const event = { eventId: 'event-1' } as FriendEventProjection;
const location = { eventId: 'event-1', address: 'Private address' } as FriendEventLocationProjection;

describe('friend event host access and loading', () => {
  it('treats a zero-friend event as host-only while preserving a valid server audience', () => {
    expect(resolveFriendEventAudience('selected_friends', 0, 0, false)).toEqual({
      effectiveVisibility: 'all_friends',
      audienceCount: 0,
      hostOnly: true,
    });
  });

  it('does not rewrite the audience of an existing event', () => {
    expect(resolveFriendEventAudience('selected_friends', 0, 0, true)).toEqual({
      effectiveVisibility: 'selected_friends',
      audienceCount: 0,
      hostOnly: false,
    });
  });

  it('shows loading instead of unavailable until the server confirms a miss', () => {
    expect(resolveFriendEventDetail(null, null, 'checking')).toBeNull();
    expect(resolveFriendEventDetail(event, null, 'checking')).toBe(event);
    expect(resolveFriendEventDetail(event, null, 'unavailable')).toBeNull();
  });

  it('uses the focused authoritative event and fails closed for a revoked location', () => {
    const focused = { eventId: 'event-1', title: 'Focused' } as FriendEventProjection;
    expect(resolveFriendEventDetail(event, focused, 'available')).toBe(focused);
    expect(resolveFriendEventLocation(location, null, true)).toBeNull();
    expect(resolveFriendEventLocation(location, null, false)).toBe(location);
  });
});
