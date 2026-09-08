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
