import { isValidImageUrl } from './imageUtils';

/**
 * Builds an event-detail gallery without inventing a new image ranking.
 * The caller-selected hero stays first, then event media remains in source
 * order with duplicate and unusable URLs removed.
 */
export const buildEventImageGallery = (
  heroUrl: string | null | undefined,
  mediaUrls: readonly string[] | null | undefined
): string[] => {
  const seen = new Set<string>();
  const gallery: string[] = [];

  for (const candidate of [heroUrl, ...(Array.isArray(mediaUrls) ? mediaUrls : [])]) {
    const url = typeof candidate === 'string' ? candidate.trim() : '';
    if (!url || !isValidImageUrl(url) || seen.has(url)) continue;
    seen.add(url);
    gallery.push(url);
  }

  return gallery;
};
