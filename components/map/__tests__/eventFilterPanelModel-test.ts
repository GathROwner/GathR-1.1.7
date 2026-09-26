import { EVENT_CATEGORIES } from '../../../constants/eventCategories';
import { TimeFilterType } from '../../../types/filter';
import {
  EVENT_TIME_OPTIONS, formatFilterCount, getEventCategoryOptions,
  getEventFilterReset, getEventTimeColumns, isUpcomingDatesVisible,
} from '../eventFilterPanelModel';

describe('Events filter panel choices', () => {
  it('keeps all four time choices visible at supported phone widths', () => {
    expect(EVENT_TIME_OPTIONS.map(option => option.value)).toEqual([
      TimeFilterType.NOW, TimeFilterType.TODAY,
      TimeFilterType.TOMORROW, TimeFilterType.UPCOMING,
    ]);
    expect(getEventTimeColumns(360)).toBe(2);
    expect(getEventTimeColumns(425)).toBe(4);
  });

  it('shows upcoming dates only for Upcoming and formats live counts inline', () => {
    expect(isUpcomingDatesVisible(TimeFilterType.UPCOMING)).toBe(true);
    expect(isUpcomingDatesVisible(TimeFilterType.TODAY)).toBe(false);
    expect(formatFilterCount('Tomorrow', 0)).toBe('Tomorrow (0)');
    expect(formatFilterCount('Live Music', 28)).toBe('Live Music (28)');
  });

  it('keeps the full event taxonomy, plus current data and selected categories', () => {
    const options = getEventCategoryOptions({ 'Live Music': 18, 'Local Festival': 0 }, 'Retired Festival');
    expect(options.slice(0, EVENT_CATEGORIES.length)).toEqual(EVENT_CATEGORIES);
    expect(options).toContain('Local Festival');
    expect(options).toContain('Retired Festival');
    expect(options.filter(option => option === 'Live Music')).toHaveLength(1);
  });

  it('resets Today, category and Upcoming refinement together', () => {
    expect(getEventFilterReset()).toEqual({
      timeFilter: TimeFilterType.TODAY, category: undefined, upcomingDate: undefined,
    });
  });
});
