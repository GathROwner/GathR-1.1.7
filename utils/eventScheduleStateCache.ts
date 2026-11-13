import type { Event, EventTiming } from '../types/events';
import { offerAvailabilityCacheIdentity } from './offerAvailability';
import {
  getEventScheduleLocalScalar,
  getEventScheduleState,
  type EventScheduleState,
} from './eventTiming';

type ScheduleEvent = Pick<
  Event,
  'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing' | 'locationScope'
  | 'isRecurring' | 'isRecurringInstance' | 'recurringPattern'
> & Partial<Pick<Event, 'venueId' | 'sourceUniqueId' | 'sourceUniqueIds' | 'offerAvailabilityBinding'>>;

type ScheduleStateCacheEntry = {
  evaluatedLocalScalar: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timing: EventTiming | null | undefined;
  venueId?: Event['venueId'];
  visitingHours?: EventTiming['visitingHours'];
  availability?: EventTiming['availability'];
  availabilityRevision?: string;
  evaluatedAt: number;
  availabilityExpiresAt?: string;
  timeZone?: string;
  sourceUniqueId?: string;
  sourceUniqueIds?: string[];
  availabilityGeneration?: string;
  offerAvailabilityBinding?: Event['offerAvailabilityBinding'];
  availabilityIdentity?: string | null;
  locationScope: Event['locationScope'];
  isRecurring: Event['isRecurring'];
  isRecurringInstance: Event['isRecurringInstance'];
  recurringPattern: Event['recurringPattern'];
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
  const availabilityIdentity = event.timing?.availability ? offerAvailabilityCacheIdentity(event) : undefined;

  if (
    cached &&
    Number.isFinite(localScalar) &&
    localScalar >= cached.evaluatedLocalScalar &&
    (!Number.isFinite(nextTransition) || localScalar < Number(nextTransition)) &&
    cached.startDate === event.startDate &&
    cached.startTime === event.startTime &&
    cached.endDate === event.endDate &&
    cached.endTime === event.endTime &&
    cached.locationScope === event.locationScope &&
    cached.isRecurring === event.isRecurring &&
    cached.isRecurringInstance === event.isRecurringInstance &&
    cached.recurringPattern === event.recurringPattern &&
    cached.timing === event.timing && cached.venueId === event.venueId
    && cached.visitingHours === event.timing?.visitingHours
    && cached.availability === event.timing?.availability
    && cached.availabilityRevision === event.timing?.availability?.revision
    && cached.availabilityExpiresAt === event.timing?.availability?.expiresAt
    && cached.timeZone === event.timing?.timeZone
    && cached.sourceUniqueId === event.sourceUniqueId && cached.sourceUniqueIds === event.sourceUniqueIds
    && cached.availabilityGeneration === event.timing?.availability?.sourceOffer?.generationId
    && cached.offerAvailabilityBinding === event.offerAvailabilityBinding
    && cached.availabilityIdentity === availabilityIdentity
    // Rich hours are freshness-bound even when the date-only parent has no transition.
    && (!event.timing?.availability || (now.getTime() >= cached.evaluatedAt
      && now.getTime() < cached.evaluatedAt + 60000
      && now.getTime() < Date.parse(event.timing.availability.expiresAt)))
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
    venueId: event.venueId,
    visitingHours: event.timing?.visitingHours,
    availability: event.timing?.availability,
    availabilityRevision: event.timing?.availability?.revision,
    availabilityExpiresAt: event.timing?.availability?.expiresAt,
    evaluatedAt: now.getTime(),
    timeZone: event.timing?.timeZone,
    sourceUniqueId: event.sourceUniqueId,
    sourceUniqueIds: event.sourceUniqueIds,
    availabilityGeneration: event.timing?.availability?.sourceOffer?.generationId,
    offerAvailabilityBinding: event.offerAvailabilityBinding,
    availabilityIdentity,
    locationScope: event.locationScope,
    isRecurring: event.isRecurring,
    isRecurringInstance: event.isRecurringInstance,
    recurringPattern: event.recurringPattern,
    state,
  });
  return state;
};

export const resetEventScheduleStateCache = (): void => {
  scheduleStateCache = new WeakMap<object, ScheduleStateCacheEntry>();
};
