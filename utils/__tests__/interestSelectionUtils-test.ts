import { normalizeUserInterests } from '../interestSelectionUtils';

describe('normalizeUserInterests', () => {
  it('keeps supported interests in their stored order', () => {
    expect(normalizeUserInterests(['Sports', 'Live Music', 'Happy Hour'])).toEqual([
      'Sports',
      'Live Music',
      'Happy Hour',
    ]);
  });

  it('removes duplicate, obsolete, and invalid values', () => {
    expect(
      normalizeUserInterests([
        'Live Music',
        'Legacy Category',
        'Live Music',
        null,
        42,
        'Drink Special',
      ])
    ).toEqual(['Live Music', 'Drink Special']);
  });

  it('returns an empty list for non-array data', () => {
    expect(normalizeUserInterests('Live Music')).toEqual([]);
  });
});
