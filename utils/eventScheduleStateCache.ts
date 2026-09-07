import type { Event, EventTiming } from '../types/events';
import {
  getEventScheduleState,
  type EventScheduleState,
} from './eventTiming';

type ScheduleEvent = Pick<
  Event,
  'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'
>;

type ScheduleStateCacheEntry = {
  minuteKey: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timing: EventTiming | null | undefined;
  state: EventScheduleState;
};

let scheduleStateCache = new WeakMap<object, ScheduleStateCacheEntry>();

const minuteKeyFor = (now: Date): number => Math.floor(now.getTime() / 60000);

/**
 * Event schedule state has minute precision. Reuse one result per immutable
 * event object during that minute, while still invalidating if a caller
 * updates any legacy time scalar or replaces the v2 timing contract in place.
 */
export const getCachedEventScheduleState = (
  event: ScheduleEvent,
  now = new Date(),
  evaluate: () => EventScheduleState = () => getEventScheduleState(event, now)
): EventScheduleState => {
  const minuteKey = minuteKeyFor(now);
  const cached = scheduleStateCache.get(event);

  if (
    cached &&
    cached.minuteKey === minuteKey &&
    cached.startDate === event.startDate &&
    cached.startTime === event.startTime &&
    cached.endDate === event.endDate &&
    cached.endTime === event.endTime &&
    cached.timing === event.timing
  ) {
    return cached.state;
  }

  const state = evaluate();
  scheduleStateCache.set(event, {
    minuteKey,
    startDate: event.startDate,
    startTime: event.startTime,
    endDate: event.endDate,
    endTime: event.endTime,
    timing: event.timing,
    state,
  });
  return state;
};

export const resetEventScheduleStateCache = (): void => {
  scheduleStateCache = new WeakMap<object, ScheduleStateCacheEntry>();
};
