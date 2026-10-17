const AUTHENTICATED_SOCIAL_ROUTE_SEGMENTS = new Set([
  'friends',
  'social-profile',
  'check-in',
  'check-in-settings',
  'create-event',
  'my-events',
  'friend-event',
]);

export const isAuthenticatedSocialRoute = (
  rootSegment: string | undefined,
  socialFeatureEnabled: boolean,
): boolean => Boolean(
  socialFeatureEnabled &&
  rootSegment &&
  AUTHENTICATED_SOCIAL_ROUTE_SEGMENTS.has(rootSegment)
);
