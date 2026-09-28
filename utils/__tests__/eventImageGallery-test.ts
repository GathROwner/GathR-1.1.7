import {
  buildEventImageGallery,
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
