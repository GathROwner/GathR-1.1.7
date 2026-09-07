import type { Event, EventTiming } from '../types/events';
import {
  getEventScheduleLocalScalar,
  getEventScheduleState,
  type EventScheduleState,
} from './eventTiming';

type ScheduleEvent = Pick<
  Event,
  'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'
>;

type ScheduleStateCacheEntry = {
  evaluatedLocalScalar: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timing: EventTiming | null | undefined;
  state: EventScheduleState;
};

let scheduleStateCache = new WeakMap<object, ScheduleStateCacheEntry>();

/**
 * Reuse one result per immutable event object until the event can actually
 * cross a schedule boundary. This avoids invalidating every visible event at
 * once on each wall-clock minute while retaining minute-accurate transitions.
 */
export const getCachedEventScheduleState = (
  event: ScheduleEvent,
  now = new Date(),
  evaluate: () => EventScheduleState = () => getEventScheduleState(event, now)
): EventScheduleState => {
  const localScalar = getEventScheduleLocalScalar(
    now,
    event.timing?.timeZone || 'America/Halifax'
  );
  const cached = scheduleStateCache.get(event);
  const nextTransition = cached?.state.nextTransitionLocalScalar;

  if (
    cached &&
    Number.isFinite(localScalar) &&
    localScalar >= cached.evaluatedLocalScalar &&
    (!Number.isFinite(nextTransition) || localScalar < Number(nextTransition)) &&
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
    evaluatedLocalScalar: localScalar,
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
