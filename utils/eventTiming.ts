import type {
  Event,
  EventScheduleEstimate,
  EventScheduleKind,
  EventTiming,
  EventTimingConfidence,
  EventTimingPoint,
  TimeStatus,
} from '../types/events';

export const EVENT_TIMING_POLICY_VERSION = 'honest-end-times-v2';
export const DEFAULT_UNKNOWN_END_CUTOFF_MINUTES = 120;
export const CONFIRMED_END_GRACE_MINUTES = 5;

export type EventScheduleStateCode =
  | 'upcoming_confirmed'
  | 'upcoming_estimated'
  | 'upcoming_unknown_end'
  | 'happening_confirmed'
  | 'expected_happening'
  | 'started_unknown_end'
  | 'until_close_active'
  | 'all_day_today'
  | 'multi_day_today'
  | 'estimate_passed'
  | 'unknown_cutoff_passed'
  | 'confirmed_ended';

export interface EventScheduleState {
  code: EventScheduleStateCode;
  nowEligibility: 'confirmed' | 'expected' | 'none';
  defaultMapEligible: boolean;
  todayEligible: boolean;
  muted: boolean;
  nextTransitionAt?: string;
}

export interface EventTimingBadge {
  text: string;
  accessibilityLabel: string;
  tone: 'neutral' | 'positive' | 'caution' | 'muted';
  infoTitle?: string;
}

export interface EventTimeRangeParts {
  prefix: string;
  start: string;
  separator: ' – ' | ' ~ ' | '';
  end: string;
  startEstimated: boolean;
  endEstimated: boolean;
  text: string;
}

type LegacyTimingInput = Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime'>;

const TIME_PATTERN = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/i;

export const parseEventTimeMinutes = (value?: string | null): number | null => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'noon') return 12 * 60;
  if (normalized.toLowerCase() === 'midnight') return 0;
  const match = normalized.match(TIME_PATTERN);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'AM') hour = hour === 12 ? 0 : hour;
    if (meridiem === 'PM') hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
};

const formatMinutes = (minutes: number): string => {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

const formatClock = (value?: string | null): string => {
  const minutes = parseEventTimeMinutes(value);
  return minutes === null ? String(value || '').trim() : formatMinutes(minutes);
};

const normalizeDateKey = (value?: string | null): string => {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

const addDays = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const localScalar = (dateKey: string, minutes: number): number => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 60000) + minutes;
};

const getZonedNow = (now: Date, timeZone: string): { dateKey: string; minutes: number } => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value || '';
    const dateKey = `${value('year')}-${value('month')}-${value('day')}`;
    return { dateKey, minutes: Number(value('hour')) * 60 + Number(value('minute')) };
  } catch {
    return {
      dateKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
};

const instantToLocalScalar = (instant: string, timeZone: string): number | null => {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return null;
  const local = getZonedNow(parsed, timeZone);
  return localScalar(local.dateKey, local.minutes);
};

const pointScalar = (
  point: EventTimingPoint | undefined,
  fallbackDate?: string | null,
  fallbackTime?: string | null
): number | null => {
  const dateKey = normalizeDateKey(point?.localDate || fallbackDate);
  const minutes = parseEventTimeMinutes(point?.localTime || fallbackTime);
  if (dateKey && minutes !== null) return localScalar(dateKey, minutes);
  return point?.at ? instantToLocalScalar(point.at, point.timeZone || 'America/Halifax') : null;
};

const estimatePointScalar = (
  estimate: EventScheduleEstimate | null | undefined,
  kind: 'display' | 'cutoff',
  timeZone: string
): number | null => {
  const dateKey = kind === 'display' ? estimate?.displayEndDate : estimate?.discoveryCutoffDate;
  const time = kind === 'display' ? estimate?.displayEndTime : estimate?.discoveryCutoffTime;
  const minutes = parseEventTimeMinutes(time);
  if (dateKey && minutes !== null) return localScalar(normalizeDateKey(dateKey), minutes);
  const instant = kind === 'display' ? estimate?.displayEndAt || estimate?.endAt : estimate?.discoveryCutoffAt;
  return instant ? instantToLocalScalar(instant, timeZone) : null;
};

const estimateLocalDate = (
  estimate: EventScheduleEstimate | null | undefined,
  kind: 'display' | 'cutoff',
  timeZone: string,
  fallbackDate: string
): string => {
  const localDate = kind === 'display' ? estimate?.displayEndDate : estimate?.discoveryCutoffDate;
  const normalized = normalizeDateKey(localDate);
  if (normalized) return normalized;
  const instant = kind === 'display' ? estimate?.displayEndAt || estimate?.endAt : estimate?.discoveryCutoffAt;
  if (!instant) return fallbackDate;
  const parsed = new Date(instant);
  return Number.isNaN(parsed.getTime()) ? fallbackDate : getZonedNow(parsed, timeZone).dateKey;
};

const hasDisplayableEstimate = (estimate?: EventScheduleEstimate | null): boolean =>
  Boolean(
    estimate &&
      !estimate.invalidatedAt &&
      (estimate.confidence === 'high' || estimate.confidence === 'medium') &&
      (estimate.displayEndAt || (estimate.displayEndDate && estimate.displayEndTime))
  );

const hasDisplayableEstimatedPoint = (point?: EventTimingPoint | null): boolean =>
  Boolean(
    point?.status === 'estimated' &&
      !point.invalidatedAt &&
      (point.confidence === 'high' || point.confidence === 'medium') &&
      (point.at || (point.localDate && point.localTime))
  );

const isStartEstimated = (timing: EventTiming): boolean =>
  hasDisplayableEstimatedPoint(timing.schedule.start);

const isEndEstimated = (timing: EventTiming): boolean =>
  hasDisplayableEstimatedPoint(timing.schedule.end) || hasDisplayableEstimate(timing.estimate);

export const createLegacyTimingContract = (
  event: LegacyTimingInput,
  options: {
    timeZone?: string;
    endStatus?: EventTimingPoint['status'];
    scheduleKind?: EventScheduleKind;
    endResolutionMethod?: string | null;
    endEvidence?: string | null;
    sourceUrl?: string | null;
    estimateConfidence?: EventTimingConfidence;
  } = {}
): EventTiming => {
  const startDate = normalizeDateKey(event.startDate);
  const startTime = String(event.startTime || '').trim();
  const rawEndDate = normalizeDateKey(event.endDate) || startDate;
  const rawEndTime = String(event.endTime || '').trim();
  const endStatus = options.endStatus || (rawEndTime ? 'observed' : 'unknown');
  const inferredEnd = endStatus === 'unknown' && rawEndTime;
  const startMinutes = parseEventTimeMinutes(startTime);
  const endMinutes = parseEventTimeMinutes(rawEndTime);
  const crossesMidnight =
    startMinutes !== null && endMinutes !== null && endMinutes < startMinutes && rawEndDate === startDate;
  const resolvedEndDate = crossesMidnight ? addDays(rawEndDate, 1) : rawEndDate;

  let estimate: EventScheduleEstimate | null = null;
  if (inferredEnd) {
    estimate = {
      confidence: options.estimateConfidence || 'low',
      discoveryCutoffDate: resolvedEndDate,
      discoveryCutoffTime: rawEndTime,
      method: options.endResolutionMethod || 'legacy_policy_cutoff',
      estimateVersion: EVENT_TIMING_POLICY_VERSION,
      evidenceRefs: options.endEvidence ? [options.endEvidence] : [],
    };
  } else if (endStatus === 'unknown' && startDate && startMinutes !== null) {
    const cutoffTotal = startMinutes + DEFAULT_UNKNOWN_END_CUTOFF_MINUTES;
    estimate = {
      confidence: 'low',
      discoveryCutoffDate: addDays(startDate, Math.floor(cutoffTotal / 1440)),
      discoveryCutoffTime: formatMinutes(cutoffTotal),
      method: 'conservative_discovery_cutoff',
      estimateVersion: EVENT_TIMING_POLICY_VERSION,
    };
  }

  return {
    version: 2,
    timeZone: options.timeZone || 'America/Halifax',
    scheduleKind:
      options.scheduleKind ||
      (endStatus === 'until_close'
        ? 'until_close'
        : rawEndDate && rawEndDate !== startDate
          ? 'multi_day'
          : 'timed_session'),
    schedule: {
      start: {
        localDate: startDate,
        localTime: startTime,
        timeZone: options.timeZone || 'America/Halifax',
        status: startTime ? 'observed' : 'unknown',
      },
      end: {
        localDate: endStatus === 'unknown' ? null : resolvedEndDate,
        localTime: endStatus === 'unknown' ? null : rawEndTime || null,
        timeZone: options.timeZone || 'America/Halifax',
        status: endStatus,
        evidence: options.endEvidence || null,
        sourceUrl: options.sourceUrl || null,
      },
    },
    estimate,
    policyVersion: EVENT_TIMING_POLICY_VERSION,
  };
};

export const getEventTiming = (event: LegacyTimingInput & { timing?: EventTiming | null }): EventTiming =>
  event.timing?.version === 2 ? event.timing : createLegacyTimingContract(event);

export const getEventScheduleState = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): EventScheduleState => {
  const timing = getEventTiming(event);
  const zonedNow = getZonedNow(now, timing.timeZone || 'America/Halifax');
  const nowScalar = localScalar(zonedNow.dateKey, zonedNow.minutes);
  const startDate = normalizeDateKey(timing.schedule.start.localDate || event.startDate);
  const startMinutes = parseEventTimeMinutes(timing.schedule.start.localTime || event.startTime) ?? 0;
  const startScalar = pointScalar(timing.schedule.start, startDate, event.startTime) ?? localScalar(startDate, startMinutes);
  const displayEstimateScalar = estimatePointScalar(timing.estimate, 'display', timing.timeZone);
  const displayEstimateDate = estimateLocalDate(timing.estimate, 'display', timing.timeZone, startDate);
  const cutoffScalar =
    estimatePointScalar(timing.estimate, 'cutoff', timing.timeZone) ||
    (startScalar + DEFAULT_UNKNOWN_END_CUTOFF_MINUTES);
  const defaultCutoffDate = addDays(
    startDate,
    Math.floor((startMinutes + DEFAULT_UNKNOWN_END_CUTOFF_MINUTES) / 1440)
  );
  const cutoffDate = estimateLocalDate(timing.estimate, 'cutoff', timing.timeZone, defaultCutoffDate);
  const observedEndScalar = pointScalar(
    timing.schedule.end,
    timing.schedule.end.localDate || event.endDate || startDate,
    timing.schedule.end.localTime || event.endTime
  );
  const estimatedEndScalar = hasDisplayableEstimatedPoint(timing.schedule.end)
    ? observedEndScalar
    : displayEstimateScalar;
  const startEstimated = isStartEstimated(timing);
  const endEstimated = isEndEstimated(timing);

  if (nowScalar < startScalar) {
    const code: EventScheduleStateCode = startEstimated || endEstimated
      ? 'upcoming_estimated'
      : timing.schedule.end.status === 'observed' || timing.schedule.end.status === 'until_close'
        ? 'upcoming_confirmed'
        : 'upcoming_unknown_end';
    return {
      code,
      nowEligibility: 'none',
      defaultMapEligible: true,
      todayEligible: zonedNow.dateKey === startDate,
      muted: false,
    };
  }

  if (timing.scheduleKind === 'all_day' || timing.schedule.end.status === 'all_day') {
    if (zonedNow.dateKey === displayEstimateDate) {
      return { code: 'all_day_today', nowEligibility: 'none', defaultMapEligible: true, todayEligible: true, muted: false };
    }
    return { code: 'confirmed_ended', nowEligibility: 'none', defaultMapEligible: false, todayEligible: false, muted: true };
  }

  if (timing.schedule.end.status === 'observed' && observedEndScalar !== null) {
    if (nowScalar <= observedEndScalar + CONFIRMED_END_GRACE_MINUTES) {
      return {
        code: startEstimated
          ? 'expected_happening'
          : timing.scheduleKind === 'multi_day'
            ? 'multi_day_today'
            : 'happening_confirmed',
        nowEligibility: startEstimated ? 'expected' : 'confirmed',
        defaultMapEligible: true,
        todayEligible: true,
        muted: false,
      };
    }
    return { code: 'confirmed_ended', nowEligibility: 'none', defaultMapEligible: false, todayEligible: false, muted: true };
  }

  if (timing.schedule.end.status === 'until_close' && observedEndScalar !== null) {
    if (nowScalar <= observedEndScalar + CONFIRMED_END_GRACE_MINUTES) {
      return {
        code: startEstimated ? 'expected_happening' : 'until_close_active',
        nowEligibility: startEstimated ? 'expected' : 'confirmed',
        defaultMapEligible: true,
        todayEligible: true,
        muted: false,
      };
    }
    return { code: 'confirmed_ended', nowEligibility: 'none', defaultMapEligible: false, todayEligible: false, muted: true };
  }

  if (endEstimated && estimatedEndScalar !== null) {
    if (nowScalar <= estimatedEndScalar) {
      return { code: 'expected_happening', nowEligibility: 'expected', defaultMapEligible: true, todayEligible: true, muted: false };
    }
    if (zonedNow.dateKey === startDate) {
      return { code: 'estimate_passed', nowEligibility: 'none', defaultMapEligible: false, todayEligible: true, muted: true };
    }
    return { code: 'confirmed_ended', nowEligibility: 'none', defaultMapEligible: false, todayEligible: false, muted: true };
  }

  if (nowScalar <= cutoffScalar) {
    return { code: 'started_unknown_end', nowEligibility: 'none', defaultMapEligible: true, todayEligible: true, muted: false };
  }
  if (zonedNow.dateKey === cutoffDate) {
    return { code: 'unknown_cutoff_passed', nowEligibility: 'none', defaultMapEligible: false, todayEligible: true, muted: true };
  }
  return { code: 'confirmed_ended', nowEligibility: 'none', defaultMapEligible: false, todayEligible: false, muted: true };
};

export const getEventTimeStatusFromTiming = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): TimeStatus => {
  const state = getEventScheduleState(event, now);
  if (state.nowEligibility === 'confirmed') return 'now';
  if (state.code === 'confirmed_ended') return 'past';
  if (state.todayEligible) return 'today';
  return 'future';
};

export const isEventConfirmedNow = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): boolean => getEventScheduleState(event, now).nowEligibility === 'confirmed';

export const isEventExpectedNow = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): boolean => getEventScheduleState(event, now).nowEligibility === 'expected';

export const isEventDefaultMapEligible = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): boolean => getEventScheduleState(event, now).defaultMapEligible;

export const isEventTimingPast = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): boolean => getEventScheduleState(event, now).code === 'confirmed_ended';

export const getEventTimingBadge = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): EventTimingBadge | null => {
  const timing = getEventTiming(event);
  const startEstimated = isStartEstimated(timing);
  const endEstimated = isEndEstimated(timing);
  if (startEstimated && endEstimated) {
    return { text: 'TIMES\nESTIMATED', accessibilityLabel: 'Start and end times estimated by GathR', tone: 'neutral' };
  }
  if (startEstimated) {
    return { text: 'START\nESTIMATED', accessibilityLabel: 'Start time estimated by GathR', tone: 'neutral' };
  }
  if (endEstimated) {
    return { text: 'END\nESTIMATED', accessibilityLabel: 'End time estimated by GathR', tone: 'neutral' };
  }
  const state = getEventScheduleState(event, now);
  switch (state.code) {
    case 'upcoming_unknown_end':
    case 'started_unknown_end':
      return {
        text: 'END\nUNKNOWN',
        accessibilityLabel: 'End time not provided',
        tone: 'caution',
        infoTitle: 'End time not provided',
      };
    case 'unknown_cutoff_passed':
      return {
        text: 'STATUS\nUNKNOWN',
        accessibilityLabel: 'Start time passed; current status unknown',
        tone: 'muted',
        infoTitle: 'Current status unknown',
      };
    case 'until_close_active':
      return { text: 'UNTIL\nCLOSE', accessibilityLabel: 'Scheduled until the venue closes', tone: 'neutral' };
    default:
      return null;
  }
};

const getEstimateDisplayTime = (timing: EventTiming): string => {
  if (hasDisplayableEstimatedPoint(timing.schedule.end)) {
    if (timing.schedule.end.localTime) return formatClock(timing.schedule.end.localTime);
    if (timing.schedule.end.at) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: timing.timeZone,
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(timing.schedule.end.at));
      } catch {
        return '';
      }
    }
  }
  if (timing.estimate?.displayEndTime) return formatClock(timing.estimate.displayEndTime);
  const instant = timing.estimate?.displayEndAt || timing.estimate?.endAt;
  if (!instant) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timing.timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(instant));
  } catch {
    return '';
  }
};

export const getEventTimeRangeParts = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): EventTimeRangeParts => {
  const timing = getEventTiming(event);
  const state = getEventScheduleState(event, now);
  const start = formatClock(timing.schedule.start.localTime || event.startTime);
  const observedEnd = formatClock(timing.schedule.end.localTime || '');
  const estimateEnd = getEstimateDisplayTime(timing);
  const startEstimated = isStartEstimated(timing);
  const endEstimated = isEndEstimated(timing) && Boolean(estimateEnd);

  let prefix = '';
  let separator: EventTimeRangeParts['separator'] = '';
  let end = '';

  if (state.code === 'all_day_today' || timing.scheduleKind === 'all_day') {
    return { prefix: 'All day', start: '', separator: '', end: '', startEstimated: false, endEstimated: false, text: 'All day' };
  }

  if (endEstimated && estimateEnd) {
    end = estimateEnd;
    separator = ' ~ ';
  } else if (
    (timing.schedule.end.status === 'observed' || timing.schedule.end.status === 'until_close') &&
    observedEnd
  ) {
    end = observedEnd;
    separator = startEstimated ? ' ~ ' : ' – ';
  } else if (state.code === 'unknown_cutoff_passed') {
    prefix = start ? 'Started ' : 'Start time passed';
  } else if (state.code === 'started_unknown_end') {
    prefix = start ? 'Started ' : 'Started';
  } else {
    prefix = start ? 'Starts ' : 'Time not provided';
  }

  const text = start
    ? `${prefix}${start}${separator}${end}`
    : prefix;
  return { prefix, start, separator, end, startEstimated, endEstimated, text };
};

export const getEventTimeRangeText = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): string => {
  return getEventTimeRangeParts(event, now).text;
};

export const getEventTimingDisclosure = (
  event: LegacyTimingInput & { timing?: EventTiming | null },
  now = new Date()
): string | null => {
  const timing = getEventTiming(event);
  const state = getEventScheduleState(event, now);
  const estimateEnd = getEstimateDisplayTime(timing);
  const start = formatClock(timing.schedule.start.localTime || event.startTime);
  const startEstimated = isStartEstimated(timing);
  const endEstimated = isEndEstimated(timing);
  if (startEstimated && endEstimated) {
    return `GathR estimates the start at ${start || 'the displayed time'} and the end at ${estimateEnd || 'the displayed time'} from supporting schedule evidence. Check the official source before travelling.`;
  }
  if (startEstimated) {
    const endUnknown = timing.schedule.end.status === 'unknown';
    return `The organizer did not provide a confirmed start time. GathR estimates ${start || 'the displayed start'} from supporting schedule evidence.${endUnknown ? ' No end time was provided.' : ''}`;
  }
  if (state.code === 'estimate_passed' && estimateEnd) {
    return `GathR estimated the end at ${estimateEnd} from supporting schedule evidence. That time has passed, so the event may have ended. Check the official source before travelling.`;
  }
  if (state.code === 'unknown_cutoff_passed') {
    return 'The organizer did not provide an end time, so the current status cannot be confirmed. Check the official source before travelling.';
  }
  if (state.code === 'started_unknown_end' || state.code === 'upcoming_unknown_end') {
    return 'The organizer provided a start time but no end time. GathR will not guess an ending.';
  }
  if (endEstimated || state.code === 'expected_happening' || state.code === 'upcoming_estimated') {
    return estimateEnd
      ? `The organizer did not provide a confirmed end time. GathR estimates ${estimateEnd} from supporting schedule evidence.`
      : 'The organizer did not provide an end time. GathR is showing a supported estimate.';
  }
  if (state.code === 'until_close_active') {
    return 'The source says this continues until the venue closes. The closing time is used as a supported ending.';
  }
  return null;
};

export type CalendarEndDecision =
  | { kind: 'confirmed'; endDate: string; endTime: string }
  | { kind: 'estimated'; endDate: string; endTime: string; disclosure: string }
  | { kind: 'user_required'; suggestedDate: string };

export const getCalendarEndDecision = (
  event: LegacyTimingInput & { timing?: EventTiming | null }
): CalendarEndDecision => {
  const timing = getEventTiming(event);
  if (
    (timing.schedule.end.status === 'observed' || timing.schedule.end.status === 'until_close') &&
    timing.schedule.end.localTime
  ) {
    return {
      kind: 'confirmed',
      endDate: timing.schedule.end.localDate || event.endDate || event.startDate,
      endTime: timing.schedule.end.localTime,
    };
  }
  if (hasDisplayableEstimatedPoint(timing.schedule.end)) {
    const estimatedTime = getEstimateDisplayTime(timing);
    const estimatedInstant = timing.schedule.end.at;
    const estimatedLocal = estimatedInstant
      ? getZonedNow(new Date(estimatedInstant), timing.timeZone)
      : null;
    const estimatedDate = timing.schedule.end.localDate || estimatedLocal?.dateKey;
    if (estimatedTime && estimatedDate) {
      return {
        kind: 'estimated',
        endDate: estimatedDate,
        endTime: estimatedTime,
        disclosure: 'End time estimated by GathR',
      };
    }
  }
  if (hasDisplayableEstimate(timing.estimate)) {
    const estimateTime = getEstimateDisplayTime(timing);
    const estimateInstant = timing.estimate?.displayEndAt || timing.estimate?.endAt;
    const estimateLocal = estimateInstant
      ? getZonedNow(new Date(estimateInstant), timing.timeZone)
      : null;
    const estimateDate = timing.estimate?.displayEndDate || estimateLocal?.dateKey;
    if (!estimateTime || !estimateDate) {
      return { kind: 'user_required', suggestedDate: event.endDate || event.startDate };
    }
    return {
      kind: 'estimated',
      endDate: estimateDate,
      endTime: estimateTime,
      disclosure: 'End time estimated by GathR',
    };
  }
  return { kind: 'user_required', suggestedDate: event.endDate || event.startDate };
};
