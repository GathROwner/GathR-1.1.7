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

type FetchLike = (input: string) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

const storageMd5ByUrl = new Map<string, Promise<string>>();

const getPublicStorageMetadataUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'storage.googleapis.com') return null;

    const [bucket, ...objectParts] = parsed.pathname.split('/').filter(Boolean);
    if (!bucket || objectParts.length === 0) return null;

    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectParts.join('/'))}`;
  } catch {
    return null;
  }
};

const getStorageMd5 = (
  url: string,
  request: FetchLike
): Promise<string> => {
  const metadataUrl = getPublicStorageMetadataUrl(url);
  if (!metadataUrl) return Promise.resolve('');

  const cached = storageMd5ByUrl.get(url);
  if (cached) return cached;

  const result = request(metadataUrl)
    .then(async (response) => {
      if (!response.ok) return '';
      const body = await response.json() as { md5Hash?: unknown };
      return typeof body.md5Hash === 'string' ? body.md5Hash.trim() : '';
    })
    .catch(() => '');

  storageMd5ByUrl.set(url, result);
  return result;
};

/**
 * Storage-managed media can be re-uploaded under a fresh URL by a scraper or
 * duplicate merge. The regular gallery builder intentionally only removes
 * duplicate URLs synchronously. This asynchronous pass removes byte-identical
 * Cloud Storage objects while preserving the hero and source order.
 */
export const dedupeEventImageGalleryByContent = async (
  gallery: readonly string[],
  request: FetchLike = (url) => fetch(url)
): Promise<string[]> => {
  const fingerprints = await Promise.all(gallery.map((url) => getStorageMd5(url, request)));
  const seenFingerprints = new Set<string>();

  return gallery.filter((_, index) => {
    const fingerprint = fingerprints[index];
    // If metadata is unavailable, retain the page rather than accidentally
    // hiding legitimate source media.
    if (!fingerprint) return true;
    if (seenFingerprints.has(fingerprint)) return false;
    seenFingerprints.add(fingerprint);
    return true;
  });
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
