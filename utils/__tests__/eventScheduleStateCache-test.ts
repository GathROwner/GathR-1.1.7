import type { Event } from '../../types/events';
import {
  getEventScheduleLocalScalar,
  createLegacyTimingContract,
  type EventScheduleState,
} from '../eventTiming';
import {
  getCachedEventScheduleState,
  resetEventScheduleStateCache,
} from '../eventScheduleStateCache';

const scheduleState: EventScheduleState = {
  code: 'upcoming_confirmed',
  nowEligibility: 'none',
  defaultMapEligible: true,
  todayEligible: true,
  muted: false,
};

const makeEvent = (): Event => {
  const schedule = {
    startDate: '2026-09-07',
    startTime: '7:00 PM',
    endDate: '2026-09-07',
    endTime: '9:00 PM',
  };
  return {
    id: 'cache-event',
    type: 'event',
    category: 'Live Music',
    title: 'Cache event',
    description: '',
    venue: 'Cache venue',
    address: '1 Main Street',
    latitude: 46.23,
    longitude: -63.12,
    usersResponded: '0',
    ...schedule,
    timing: createLegacyTimingContract(schedule, { endStatus: 'observed' }),
  } as Event;
};

describe('event schedule state cache', () => {
  beforeEach(resetEventScheduleStateCache);

  it('evaluates an unchanged event only once before its next transition', () => {
    const event = makeEvent();
    const transitionAt = getEventScheduleLocalScalar(
      new Date('2026-09-07T23:00:00.000Z'),
      'America/Halifax'
    );
    const evaluate = jest.fn(() => ({
      ...scheduleState,
      nextTransitionLocalScalar: transitionAt,
    }));
    const now = new Date('2026-09-07T22:03:10.000Z');

    const first = getCachedEventScheduleState(event, now, evaluate);
    getCachedEventScheduleState(event, new Date('2026-09-07T22:59:59.000Z'), evaluate);
    expect(first.nextTransitionLocalScalar).toBe(transitionAt);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate merely because the wall-clock minute changes', () => {
    const event = makeEvent();
    const evaluate = jest.fn(() => scheduleState);

    getCachedEventScheduleState(event, new Date('2026-09-07T22:03:59.000Z'), evaluate);
    getCachedEventScheduleState(event, new Date('2026-09-07T22:04:00.000Z'), evaluate);

    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('invalidates exactly when the cached state reaches its transition minute', () => {
    const event = makeEvent();
    const transitionTime = new Date('2026-09-07T23:00:00.000Z');
    const transitionAt = getEventScheduleLocalScalar(transitionTime, 'America/Halifax');
    const evaluate = jest.fn(() => ({
      ...scheduleState,
      nextTransitionLocalScalar: transitionAt,
    }));

    getCachedEventScheduleState(event, new Date('2026-09-07T22:59:59.000Z'), evaluate);
    getCachedEventScheduleState(event, transitionTime, evaluate);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('invalidates when the local clock moves backwards', () => {
    const event = makeEvent();
    const evaluate = jest.fn(() => scheduleState);

    getCachedEventScheduleState(event, new Date('2026-09-07T22:04:00.000Z'), evaluate);
    getCachedEventScheduleState(event, new Date('2026-09-07T22:03:00.000Z'), evaluate);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('invalidates when a legacy time scalar changes on the same object', () => {
    const event = makeEvent();
    const evaluate = jest.fn(() => scheduleState);
    const now = new Date('2026-09-07T22:03:10.000Z');

    getCachedEventScheduleState(event, now, evaluate);
    event.endTime = '10:00 PM';
    getCachedEventScheduleState(event, now, evaluate);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('invalidates when the v2 timing object is replaced', () => {
    const event = makeEvent();
    const evaluate = jest.fn(() => scheduleState);
    const now = new Date('2026-09-07T22:03:10.000Z');

    getCachedEventScheduleState(event, now, evaluate);
    event.timing = event.timing ? { ...event.timing } : event.timing;
    getCachedEventScheduleState(event, now, evaluate);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('can be explicitly reset between independent runs', () => {
    const event = makeEvent();
    const evaluate = jest.fn(() => scheduleState);
    const now = new Date('2026-09-07T22:03:10.000Z');

    getCachedEventScheduleState(event, now, evaluate);
    resetEventScheduleStateCache();
    getCachedEventScheduleState(event, now, evaluate);

    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});
