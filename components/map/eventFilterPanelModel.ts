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

export const getEventCategoryOptions = (counts: Record<string, number>, selected?: string) =>
  Array.from(new Set<string>([
    ...EVENT_CATEGORIES,
    ...Object.keys(counts).filter(category => category.trim().length > 0),
    ...(selected ? [selected] : []),
  ]));

export const getEventFilterReset = (): Partial<TypeFilterCriteria> => ({
  timeFilter: TimeFilterType.TODAY,
  category: undefined,
  upcomingDate: undefined,
});

export const isUpcomingDatesVisible = (timeFilter: TimeFilterType) =>
  timeFilter === TimeFilterType.UPCOMING;
