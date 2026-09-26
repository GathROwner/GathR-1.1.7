import { EVENT_CATEGORIES, SPECIAL_CATEGORIES } from '../../constants/eventCategories';
import { TimeFilterType, type TypeFilterCriteria } from '../../types/filter';

export const EVENT_TIME_OPTIONS = [
  { value: TimeFilterType.NOW, label: 'Now', icon: 'time-outline' },
  { value: TimeFilterType.TODAY, label: 'Today', icon: 'today-outline' },
  { value: TimeFilterType.TOMORROW, label: 'Tomorrow', icon: 'sunny-outline' },
  { value: TimeFilterType.UPCOMING, label: 'Upcoming', icon: 'calendar-outline' },
] as const;

export const getEventTimeColumns = (width: number) => width >= 400 ? 4 : 2;

export const formatFilterCount = (label: string, count: number) => `${label} (${count})`;

const CATEGORY_ORDER = {
  event: new Map<string, number>(EVENT_CATEGORIES.map((category, index) => [category, index])),
  special: new Map<string, number>(SPECIAL_CATEGORIES.map((category, index) => [category, index])),
};

export const EVENT_CATEGORY_COLUMNS = 2;
export const EVENT_CATEGORY_VISIBLE_ROWS = 3;

export const getFilterCategoryOptions = (
  type: 'event' | 'special', counts: Record<string, number>, selected?: string
) => {
  const configuredCategories = type === 'event' ? EVENT_CATEGORIES : SPECIAL_CATEGORIES;
  const categoryOrder = CATEGORY_ORDER[type];

  return Array.from(new Set<string>([
    ...configuredCategories,
    ...Object.keys(counts).filter(category => category.trim().length > 0),
    ...(selected ? [selected] : []),
  ]))
    .filter(category => (counts[category] ?? 0) > 0 || category === selected)
    .sort((left, right) => {
      if (left === selected) return -1;
      if (right === selected) return 1;

      const countDifference = (counts[right] ?? 0) - (counts[left] ?? 0);
      if (countDifference !== 0) return countDifference;

      const orderDifference = (categoryOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (categoryOrder.get(right) ?? Number.MAX_SAFE_INTEGER);
      return orderDifference || left.localeCompare(right);
    });
};

export const getEventCategoryOptions = (counts: Record<string, number>, selected?: string) =>
  getFilterCategoryOptions('event', counts, selected);

export const getAvailableFilterCategoryCount = (
  type: 'event' | 'special', counts: Record<string, number>
) => getFilterCategoryOptions(type, counts).length;

export const formatCategoryAvailability = (availableCount: number, selected?: string) => {
  return selected ? `${selected} selected` : `${availableCount} available`;
};

export const shouldShowEventCategoryScrollCue = (optionCount: number) =>
  Math.ceil(optionCount / EVENT_CATEGORY_COLUMNS) > EVENT_CATEGORY_VISIBLE_ROWS;

export const getEventFilterReset = (): Partial<TypeFilterCriteria> => ({
  timeFilter: TimeFilterType.TODAY,
  category: undefined,
  upcomingDate: undefined,
});

export const isUpcomingDatesVisible = (timeFilter: TimeFilterType) =>
  timeFilter === TimeFilterType.UPCOMING;
