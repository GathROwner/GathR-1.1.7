import { TimeFilterType } from '../../../types/filter';
import {
  EVENT_TIME_OPTIONS, formatCategoryAvailability, formatFilterCount, getAvailableFilterCategoryCount,
  getEventCategoryOptions, getFilterCategoryOptions, getEventFilterReset, getEventTimeColumns,
  isUpcomingDatesVisible,
  shouldShowEventCategoryScrollCue,
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

  it('orders available categories by count and hides unselected zero-count options', () => {
    const options = getEventCategoryOptions({
      'Live Music': 18, Sports: 24, 'Local Festival': 7, Comedy: 0,
    });
    expect(options).toEqual(['Sports', 'Live Music', 'Local Festival']);
    expect(options).not.toContain('Comedy');
    expect(options).not.toContain('Trivia Night');
    expect(options.filter(option => option === 'Live Music')).toHaveLength(1);
  });

  it('keeps a selected zero-count category visible and first', () => {
    expect(getEventCategoryOptions({ 'Live Music': 18, Comedy: 0 }, 'Comedy'))
      .toEqual(['Comedy', 'Live Music']);
  });

  it('applies the same non-zero category contract to specials', () => {
    expect(getFilterCategoryOptions('special', {
      'Happy Hour': 3, 'Food Special': 0, 'Drink Special': 7,
    })).toEqual(['Drink Special', 'Happy Hour']);
    expect(getFilterCategoryOptions('special', { 'Happy Hour': 3, 'Food Special': 0 }, 'Food Special'))
      .toEqual(['Food Special', 'Happy Hour']);
  });

  it('summarizes available categories compactly and names an active selection', () => {
    expect(getAvailableFilterCategoryCount('special', {
      'Happy Hour': 3, 'Food Special': 10, 'Drink Special': 0,
    })).toBe(2);
    expect(formatCategoryAvailability(2)).toBe('2 available');
    expect(formatCategoryAvailability(2, 'Happy Hour')).toBe('Happy Hour selected');
    expect(formatCategoryAvailability(1)).toBe('1 available');
  });

  it('shows the category scroll cue only beyond three two-column rows', () => {
    expect(shouldShowEventCategoryScrollCue(6)).toBe(false);
    expect(shouldShowEventCategoryScrollCue(7)).toBe(true);
  });

  it('resets Today, category and Upcoming refinement together', () => {
    expect(getEventFilterReset()).toEqual({
      timeFilter: TimeFilterType.TODAY, category: undefined, upcomingDate: undefined,
    });
  });
});
