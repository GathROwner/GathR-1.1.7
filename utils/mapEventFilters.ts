import type { Event } from '../types/events';
import { TimeFilterType, type FilterCriteria, type TypeFilterCriteria, type UpcomingDateFilter } from '../types/filter';
import { addDaysToDateKey, formatLocalDateKey, getEventDateKey, isEventPastFast } from './eventExpiry';
import { getEventScheduleState } from './eventTiming';
import { getCachedEventScheduleState } from './eventScheduleStateCache';
import { doesEventMatchCategoryOrFacet } from './familyFriendly';
import { MAP_TRACE_ENABLED, measureMapScheduleState, type MapScheduleStateCaller } from './mapTrace';
import { eventOverlapsDateWindow, getUpcomingDateWindow } from './upcomingDateWindow';

export type EventTimeContext = {
  todayKey: string;
  tomorrowKey: string;
  yesterdayKey: string;
  nowMinutes: number;
  now?: Date;
  windows?: Map<UpcomingDateFilter | undefined, ReturnType<typeof getUpcomingDateWindow>>;
};

export const createEventTimeContext = (now = new Date()): EventTimeContext => {
  const todayKey = formatLocalDateKey(now);
  return { todayKey, tomorrowKey: addDaysToDateKey(todayKey, 1),
    yesterdayKey: addDaysToDateKey(todayKey, -1), nowMinutes: now.getHours() * 60 + now.getMinutes(),
    now, windows: new Map() };
};

export const getFilterScheduleState = (
  event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>,
  context: EventTimeContext,
  caller: MapScheduleStateCaller = 'map_filtering'
): ReturnType<typeof getEventScheduleState> => {
  let now = context.now;
  if (!now) {
    const [year, month, day] = context.todayKey.split('-').map(Number);
    now = new Date(year, month - 1, day, Math.floor(context.nowMinutes / 60), context.nowMinutes % 60);
  }
  return getCachedEventScheduleState(event, now, () => MAP_TRACE_ENABLED
    ? measureMapScheduleState(caller, () => getEventScheduleState(event, now))
    : getEventScheduleState(event, now));
};

export const matchesUpcomingDate = (event: Event, selection: UpcomingDateFilter | undefined, context: EventTimeContext): boolean => {
  const windows = context.windows ?? (context.windows = new Map());
  if (!windows.has(selection)) windows.set(selection, getUpcomingDateWindow(selection, context.todayKey));
  return eventOverlapsDateWindow(event, windows.get(selection)!);
};

export const getEventFilterTimeFacts = (
  event: Event, context: EventTimeContext, caller: MapScheduleStateCaller = 'map_filtering'
) => {
  const state = getFilterScheduleState(event, context, caller);
  const past = event.timing?.version === 2 ? state.code === 'confirmed_ended' : isEventPastFast(event, context);
  const now = state.nowEligibility === 'confirmed';
  const today = state.todayEligible;
  return { past, now, today, tomorrow: getEventDateKey(event.startDate) === context.tomorrowKey,
    upcoming: state.code !== 'confirmed_ended' && !today && !now };
};

export const matchesTimeFacts = (
  event: Event, filters: TypeFilterCriteria, context: EventTimeContext,
  facts: ReturnType<typeof getEventFilterTimeFacts>
): boolean => {
  if (facts.past) return false;
  switch (filters.timeFilter) {
    case TimeFilterType.NOW: return facts.now;
    case TimeFilterType.TODAY: return facts.today;
    case TimeFilterType.TOMORROW: return facts.tomorrow;
    case TimeFilterType.UPCOMING: return facts.upcoming &&
      (event.type !== 'event' || matchesUpcomingDate(event, filters.upcomingDate, context));
    default: return true;
  }
};

export const eventMatchesSearch = (event: Event, search?: string): boolean => {
  const term = search?.trim().toLowerCase();
  return !term || event.title.toLowerCase().includes(term) ||
    event.description.toLowerCase().includes(term) || event.venue.toLowerCase().includes(term);
};

/** Shared map / counts / personalized-carousel time, category and search contract. */
export const doesEventMatchTypeFilters = (
  event: Event, filters: TypeFilterCriteria, context = createEventTimeContext()
): boolean => matchesTimeFacts(event, filters, context, getEventFilterTimeFacts(event, context)) &&
  (!filters.category || doesEventMatchCategoryOrFacet(event, filters.category)) && eventMatchesSearch(event, filters.search);

export const countUpcomingDateEvents = (
  events: Event[], criteria: FilterCriteria, selection: UpcomingDateFilter,
  context = createEventTimeContext()
): number => {
  if (!criteria.showEvents) return 0;
  const filters = { ...criteria.eventFilters, timeFilter: TimeFilterType.UPCOMING, upcomingDate: selection };
  return events.reduce((count, event) => count + Number(event.type === 'event' &&
    doesEventMatchTypeFilters(event, filters, context) && eventMatchesSearch(event, criteria.search)), 0);
};
