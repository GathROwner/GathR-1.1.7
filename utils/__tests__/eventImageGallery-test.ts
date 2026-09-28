import {
  buildEventImageGallery,
  dedupeEventImageGalleryByContent,
  getEventImageGalleryHiddenCount,
  getEventImageGallerySideTileIndexes,
} from '../eventImageGallery';

describe('buildEventImageGallery', () => {
  it('keeps the selected flyer first and preserves the remaining carousel order', () => {
    expect(buildEventImageGallery('https://images.example/flyer.jpg', [
      'https://images.example/flyer.jpg',
      'https://images.example/friday-saturday.jpg',
      'https://images.example/sunday.jpg',
    ])).toEqual([
      'https://images.example/flyer.jpg',
      'https://images.example/friday-saturday.jpg',
      'https://images.example/sunday.jpg',
    ]);
  });

  it('removes duplicate and unusable media without reordering the valid pages', () => {
    expect(buildEventImageGallery('https://images.example/flyer.jpg', [
      '',
      'https://images.example/flyer.jpg',
      'not-a-url',
      'https://images.example/schedule.jpg',
    ])).toEqual([
      'https://images.example/flyer.jpg',
      'https://images.example/schedule.jpg',
    ]);
  });

  it('keeps a generated fallback as a single hero when the source supplied no media', () => {
    expect(buildEventImageGallery('https://images.example/fallback-live-music.jpg', undefined)).toEqual([
      'https://images.example/fallback-live-music.jpg',
    ]);
  });

  it('shows at most three source tiles beside a stable hero and counts the remainder', () => {
    const gallery = [
      'https://images.example/hero.jpg',
      'https://images.example/page-1.jpg',
      'https://images.example/page-2.jpg',
      'https://images.example/page-3.jpg',
      'https://images.example/page-4.jpg',
      'https://images.example/page-5.jpg',
    ];

    expect(getEventImageGallerySideTileIndexes(gallery)).toEqual([1, 2, 3]);
    expect(getEventImageGalleryHiddenCount(gallery)).toBe(2);
  });
});

describe('dedupeEventImageGalleryByContent', () => {
  it('keeps the hero and removes a later managed URL with the same object hash', async () => {
    const requests: string[] = [];
    const request = async (url: string) => {
      requests.push(url);
      return {
        ok: true,
        json: async () => ({
          md5Hash:
            url.includes('hero.webp') || url.includes('reupload.webp')
              ? 'same-image'
              : 'different-image',
        }),
      };
    };

    await expect(dedupeEventImageGalleryByContent([
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/hero.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/reupload.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/schedule.webp',
    ], request)).resolves.toEqual([
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/hero.webp',
      'https://storage.googleapis.com/gathr-uploaded-images/postimages/schedule.webp',
    ]);
    expect(requests).toHaveLength(3);
  });

  it('keeps non-managed media when object metadata cannot identify it', async () => {
    await expect(dedupeEventImageGalleryByContent([
      'https://images.example/flyer.jpg',
      'https://images.example/schedule.jpg',
    ], async () => {
      throw new Error('A non-managed URL must not be fetched');
    })).resolves.toEqual([
      'https://images.example/flyer.jpg',
      'https://images.example/schedule.jpg',
    ]);
  });
});
