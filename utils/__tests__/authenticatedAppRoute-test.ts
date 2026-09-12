import { isAuthenticatedSocialRoute } from '../authenticatedAppRoute';

describe('isAuthenticatedSocialRoute', () => {
  it.each([
    'friends',
    'social-profile',
    'check-in',
    'check-in-settings',
    'create-event',
    'my-events',
    'friend-event',
  ])('allows the authenticated social route %s', (segment) => {
    expect(isAuthenticatedSocialRoute(segment, true)).toBe(true);
  });

  it('does not allow social routes when the feature is disabled', () => {
    expect(isAuthenticatedSocialRoute('check-in-settings', false)).toBe(false);
  });

  it('does not classify unrelated routes as authenticated social flows', () => {
    expect(isAuthenticatedSocialRoute('interest-selection', true)).toBe(false);
    expect(isAuthenticatedSocialRoute(undefined, true)).toBe(false);
  });
});
