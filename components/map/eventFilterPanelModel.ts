import { EVENT_CATEGORIES } from '../../constants/eventCategories';
import { TimeFilterType, type TypeFilterCriteria } from '../../types/filter';

export const EVENT_TIME_OPTIONS = [
  { value: TimeFilterType.NOW, label: 'Now', icon: 'time-outline' },
  { value: TimeFilterType.TODAY, label: 'Today', icon: 'today-outline' },
  { value: TimeFilterType.TOMORROW, label: 'Tomorrow', icon: 'sunny-outline' },
  { value: TimeFilterType.UPCOMING, label: 'Upcoming', icon: 'calendar-outline' },
] as const;

export const getEventTimeColumns = (width: number) => width >= 400 ? 4 : 2;

export const formatFilterCount = (label: string, count: number) => `${label} (${count})`;

const EVENT_CATEGORY_ORDER = new Map<string, number>(
  EVENT_CATEGORIES.map((category, index) => [category, index])
);

export const EVENT_CATEGORY_COLUMNS = 2;
export const EVENT_CATEGORY_VISIBLE_ROWS = 3;

export const getEventCategoryOptions = (counts: Record<string, number>, selected?: string) =>
  Array.from(new Set<string>([
    ...EVENT_CATEGORIES,
    ...Object.keys(counts).filter(category => category.trim().length > 0),
    ...(selected ? [selected] : []),
  ]))
    .filter(category => (counts[category] ?? 0) > 0 || category === selected)
    .sort((left, right) => {
      if (left === selected) return -1;
      if (right === selected) return 1;

      const countDifference = (counts[right] ?? 0) - (counts[left] ?? 0);
      if (countDifference !== 0) return countDifference;

      const orderDifference = (EVENT_CATEGORY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (EVENT_CATEGORY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER);
      return orderDifference || left.localeCompare(right);
    });

export const shouldShowEventCategoryScrollCue = (optionCount: number) =>
  Math.ceil(optionCount / EVENT_CATEGORY_COLUMNS) > EVENT_CATEGORY_VISIBLE_ROWS;

export const getEventFilterReset = (): Partial<TypeFilterCriteria> => ({
  timeFilter: TimeFilterType.TODAY,
  category: undefined,
  upcomingDate: undefined,
});

export const isUpcomingDatesVisible = (timeFilter: TimeFilterType) =>
  timeFilter === TimeFilterType.UPCOMING;
