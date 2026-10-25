import { getInterestFilterPillIconName } from '../interestFilterPillIcons';

describe('getInterestFilterPillIconName', () => {
  it('uses the canonical church icon for the vertical pill alias Pray', () => {
    expect(getInterestFilterPillIconName('Pray')).toBe('church');
  });

  it('continues to use the church icon for the underlying Religious interest', () => {
    expect(getInterestFilterPillIconName('Religious')).toBe('church');
  });
});
