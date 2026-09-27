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

/**
 * The detail grid reserves its hero for the selected event image and shows at
 * most three additional source pages beside it.
 */
export const getEventImageGallerySideTileIndexes = (
  gallery: readonly string[]
): number[] => gallery.slice(1, 4).map((_, index) => index + 1);

export const getEventImageGalleryHiddenCount = (
  gallery: readonly string[]
): number => Math.max(gallery.length - 4, 0);
