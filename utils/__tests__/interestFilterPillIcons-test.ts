import { getInterestFilterPillIconName } from '../interestFilterPillIcons';

describe('getInterestFilterPillIconName', () => {
  it('uses the canonical church icon for the vertical pill alias Pray', () => {
    expect(getInterestFilterPillIconName('Pray')).toBe('church');
  });

  it('continues to use the church icon for the underlying Religious interest', () => {
    expect(getInterestFilterPillIconName('Religious')).toBe('church');
  });

  it.each([
    ['Music', 'audiotrack'], ['Live Music', 'audiotrack'],
    ['Laugh', 'sentiment-very-satisfied'], ['Comedy', 'sentiment-very-satisfied'],
    ['Sports', 'sports-basketball'], ['Trivia', 'psychology-alt'],
    ['Workshop', 'history-edu'], ['Class', 'history-edu'], ['Learn', 'category'],
    ['Church', 'church'], ['Family', 'family-restroom'], ['Party', 'nightlife'],
    ['Gatherings & Parties', 'nightlife'], ['Cinema', 'theaters'], ['Movie', 'theaters'],
    ['Film', 'theaters'], ['Happy Hour', 'local-bar'], ['Food', 'restaurant'],
    ['Wings', 'restaurant'], ['Drink', 'wine-bar'], ['Other', 'category'], ['Spray Painting', 'category'],
  ])('preserves the existing %s icon', (label, icon) => {
    expect(getInterestFilterPillIconName(label)).toBe(icon);
  });
});
