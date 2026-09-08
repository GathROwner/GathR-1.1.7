import {
  buildLegacyFacebookPostUrl,
  getEventOriginalSourceUrl,
  isOriginalEventSourceUrl,
} from '../eventSourceUrl';

describe('event original source URLs', () => {
  it('accepts post-level Facebook URLs and rejects venue profile pages', () => {
    expect(isOriginalEventSourceUrl('https://www.facebook.com/slaymakerandnichols')).toBe(false);
    expect(isOriginalEventSourceUrl('https://www.facebook.com/slaymakerandnichols/posts/123456789')).toBe(true);
    expect(isOriginalEventSourceUrl('https://www.facebook.com/reel/1676272290104313/')).toBe(true);
  });

  it('reconstructs a legacy post URL from the venue page and unique ID', () => {
    expect(
      buildLegacyFacebookPostUrl(
        'https://www.facebook.com/slaymakerandnichols',
        '1636582355145006_94374787eb7abb39'
      )
    ).toBe('https://www.facebook.com/slaymakerandnichols/posts/1636582355145006');
  });

  it.each([
    [
      'https://www.facebook.com/downstreetdance/',
      '1714014287396138_0da1d25da28f7ee1',
      'https://www.facebook.com/downstreetdance/posts/1714014287396138',
    ],
    [
      'https://www.facebook.com/CityCinemaChtown',
      '1611535574316691_86ecb4c0b73b4c8a',
      'https://www.facebook.com/CityCinemaChtown/posts/1611535574316691',
    ],
  ])('resolves the pictured live event source %#', (pageUrl, uniqueId, expected) => {
    expect(buildLegacyFacebookPostUrl(pageUrl, uniqueId)).toBe(expected);
  });

  it('prefers a stored post permalink over a reconstructed fallback', () => {
    expect(getEventOriginalSourceUrl({
      sourceUrl: 'https://www.facebook.com/reel/1676272290104313/',
      sourceUniqueId: '1636582355145006_94374787eb7abb39',
      facebookUrl: 'https://www.facebook.com/slaymakerandnichols',
    })).toBe('https://www.facebook.com/reel/1676272290104313/');
  });

  it('returns no source when only a profile page is known', () => {
    expect(getEventOriginalSourceUrl({
      facebookUrl: 'https://www.facebook.com/slaymakerandnichols',
    })).toBe('');
  });
});
