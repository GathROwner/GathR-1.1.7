import type { Event } from '../types/events';

const FACEBOOK_HOST_PATTERN = /(^|\.)facebook\.com$/i;
const FACEBOOK_SHORT_HOST_PATTERN = /(^|\.)fb\.watch$/i;
const INSTAGRAM_HOST_PATTERN = /(^|\.)instagram\.com$/i;

const firstText = (...values: Array<string | null | undefined>): string =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';

const parseHttpUrl = (rawUrl?: string | null): URL | null => {
  const value = rawUrl?.trim();
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * True when a URL identifies an individual source item rather than a social
 * profile/page. This prevents "View original post" from opening a venue page.
 */
export const isOriginalEventSourceUrl = (rawUrl?: string | null): boolean => {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed) return false;

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (FACEBOOK_SHORT_HOST_PATTERN.test(hostname)) return true;

  if (FACEBOOK_HOST_PATTERN.test(hostname)) {
    if (/\/(posts|videos|reel|events)\//.test(pathname)) return true;
    if (/\/groups\/[^/]+\/(posts|permalink)\//.test(pathname)) return true;
    if (/\/share\/(p|r|v)\//.test(pathname)) return true;
    if (/\/(permalink|story|photo)\.php$/.test(pathname)) {
      return Boolean(
        parsed.searchParams.get('story_fbid') ||
        parsed.searchParams.get('fbid') ||
        parsed.searchParams.get('v')
      );
    }
    if (pathname === '/watch/' && parsed.searchParams.get('v')) return true;
    return false;
  }

  if (INSTAGRAM_HOST_PATTERN.test(hostname)) {
    return /^\/(p|reel|tv)\//.test(pathname);
  }

  // Other first-party or organizer source URLs are retained. The venue-page
  // regression this guard addresses is specific to social profile URLs.
  return true;
};

const extractLegacyFacebookPostId = (sourceUniqueId?: string | null): string => {
  const match = sourceUniqueId?.trim().match(/^(\d{8,})(?:_|$)/);
  return match?.[1] || '';
};

const extractFacebookPageIdentifier = (rawUrl?: string | null): string => {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed || !FACEBOOK_HOST_PATTERN.test(parsed.hostname)) return '';

  const profileId = parsed.searchParams.get('id')?.trim();
  if (/^\d{5,}$/.test(profileId || '')) return profileId!;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '';

  if (segments[0].toLowerCase() === 'people' || segments[0].toLowerCase() === 'p') {
    const numericId = [...segments].reverse().find((segment) => /^\d{5,}$/.test(segment));
    return numericId || '';
  }

  const reservedRoots = new Set([
    'events',
    'groups',
    'login',
    'permalink.php',
    'photo.php',
    'reel',
    'share',
    'story.php',
    'videos',
    'watch',
  ]);
  return reservedRoots.has(segments[0].toLowerCase()) ? '' : segments[0];
};

/**
 * Older Firestore rows retained the Facebook post ID in metadata.uniqueId but
 * stored only the venue page URL. Facebook accepts /{page}/posts/{postId} and
 * redirects it to the canonical post, video, or reel URL.
 */
export const buildLegacyFacebookPostUrl = (
  facebookPageUrl?: string | null,
  sourceUniqueId?: string | null
): string => {
  const postId = extractLegacyFacebookPostId(sourceUniqueId);
  const pageIdentifier = extractFacebookPageIdentifier(facebookPageUrl);
  if (!postId || !pageIdentifier) return '';

  return `https://www.facebook.com/${encodeURIComponent(pageIdentifier)}/posts/${postId}`;
};

export const getEventOriginalSourceUrl = (
  event: Pick<
    Event,
    'sourceUrl' | 'sourceUniqueId' | 'facebookUrl' | 'timing' | 'sharedEventProvenance'
  >
): string => {
  const directCandidates = [
    event.sourceUrl,
    event.sharedEventProvenance?.sourceUrl,
    event.timing?.schedule.start.sourceUrl,
    event.timing?.schedule.end.sourceUrl,
    event.facebookUrl,
  ];

  const directSource = directCandidates
    .map((candidate) => firstText(candidate))
    .find((candidate) => isOriginalEventSourceUrl(candidate));
  if (directSource) return directSource;

  return buildLegacyFacebookPostUrl(event.facebookUrl, event.sourceUniqueId);
};
