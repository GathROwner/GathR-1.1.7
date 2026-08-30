import { linkedFriendHandle, parseDeepLink } from '../../utils/deepLinks';

describe('GathR deep links', () => {
  it('accepts the HTTPS friend profile link used by QR sharing', () => {
    expect(linkedFriendHandle('https://www.gathrapp.ca/app/?friend=%40Craig_123')).toBe('craig_123');
  });

  it('rejects malformed handles rather than navigating to an unsafe query', () => {
    expect(linkedFriendHandle('https://www.gathrapp.ca/app/?friend=bad%2Fpath')).toBeNull();
    expect(linkedFriendHandle('https://www.gathrapp.ca/app/?friend=ab')).toBeNull();
  });

  it('preserves existing public event deep-link parsing', () => {
    expect(parseDeepLink('gathr://event/event-123')).toEqual({ eventId: 'event-123', type: 'event' });
  });
});
