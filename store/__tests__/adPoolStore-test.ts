const mockCreateForAdRequest = jest.fn();

jest.mock('react-native-google-mobile-ads', () => ({
  NativeAd: {
    createForAdRequest: (...args: unknown[]) => mockCreateForAdRequest(...args),
  },
  TestIds: {
    NATIVE: 'test-native-ad-unit',
  },
}));

import { useAdPoolStore } from '../adPoolStore';

const makeAd = () => ({
  headline: 'Test Ad',
  advertiser: 'Same advertiser',
  body: 'Same creative returned for each test request',
  callToAction: 'Learn more',
  icon: { url: 'https://example.com/icon.png' },
  mediaContent: { aspectRatio: 1.91, hasVideoContent: true },
  destroy: jest.fn(),
});

describe('adPoolStore instance ownership', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockCreateForAdRequest.mockReset();
    useAdPoolStore.getState().cleanup();
    useAdPoolStore.setState({
      eventsAds: [],
      specialsAds: [],
      lastLoadTime: { events: 0, specials: 0 },
      isLoading: { events: false, specials: false },
      isPreloaded: { events: false, specials: false },
    });
  });

  afterEach(() => {
    useAdPoolStore.getState().cleanup();
    consoleLogSpy.mockRestore();
  });

  it('keeps separate NativeAd instances even when their creative text is identical', async () => {
    const ads = [makeAd(), makeAd(), makeAd()];
    ads.forEach((ad) => mockCreateForAdRequest.mockResolvedValueOnce(ad));

    await useAdPoolStore.getState().loadAds('events', ads.length);

    expect(useAdPoolStore.getState().eventsAds).toEqual(ads);
    expect(mockCreateForAdRequest).toHaveBeenCalledTimes(ads.length);
  });

  it('does not cycle one NativeAd instance into several display slots', () => {
    const ad = makeAd();
    useAdPoolStore.setState({ eventsAds: [ad as never] });

    expect(useAdPoolStore.getState().getAdsForDisplay('events', 3)).toEqual([ad]);
    expect(useAdPoolStore.getState().claimAds('events', 'feed-owner', 3)).toEqual([
      ad,
      null,
      null,
    ]);
  });
});
