import type { Event } from '../types/events';
import type { MultiDayOfferAvailability, AvailabilityView } from '../types/offerAvailability';
import { visitingClock, visitingDateAfter, visitingLocalNow } from './visitingHours';

type Input = Pick<Event, 'startDate'> & Partial<Pick<Event, 'endDate' | 'startTime' | 'endTime' | 'timing' | 'venueId' | 'sourceUniqueId' | 'sourceUniqueIds' | 'offerAvailabilityBinding' | 'type' | 'category' | 'title' | 'description' | 'locationScope' | 'isRecurring' | 'isRecurringInstance' | 'recurringPattern'>>;
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const url = (v: unknown) => typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v);
const instant = (v: unknown) => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const dayNumber = (v: string) => Date.parse(`${v}T00:00:00Z`) / 86400000;
const minute = (v: unknown) => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3)) : NaN;
const recurring = (v: unknown) => v === true || /^(yes|true|1)$/i.test(String(v || '').trim());
const MAX_AGE = 7 * 86400000;
const DATE_CUE = /\b(?:today|tomorrow|halloween|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b/i;
const RESTRICTED = /\b(?:breakfast|brunch|lunch|dinner|supper|happy\s+hour|tonight|evening|afternoon|morning|after|before|until|from\s+\d|limited\s+hours?|while\s+(?:supplies|quantities)\s+last)\b|\b\d{1,2}(?::\d{2}|\s*[ap]\.?m\.?)\b/i;
const SESSION = /\b(?:concert|party|show|screening|movie|class|workshop|lesson|tasting|performance|reservation|seating|session)\b/i;
// Same exact numbered-street/locality checks as the producer checkpoint.
const street = (value: string) => {
  if (/\b(?:room|studio|suite|unit|hall|theatre|theater|building|floor|entrance)\b/i.test(value)) return '';
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\./g, '')
    .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave').replace(/\bdrive\b/g, 'dr');
  return normalized.match(/^(\d+[a-z]?(?:[-/]\d+)?\s+[a-z0-9 '-]+?\s+(?:st|rd|ave|dr|lane|ln|blvd|boulevard|court|ct))\b/)?.[1] || '';
};
const locality = (value: string) => value.match(/,\s*([^,]+),\s*(?:PEI?|NS|NB|NL|ON|QC|BC|AB)(?:\b|\s)/i)?.[1].toLowerCase().trim() || '';
const province = (value: string) => value.match(/,\s*(PEI?|NS|NB|NL|ON|QC|BC|AB)\b/i)?.[1].toUpperCase().replace(/^PEI$/, 'PE') || '';
const serviceMatches = (types: string[], service: string) => service === 'bar'
  ? types.some(t => ['bar','pub','cocktail_bar'].includes(t))
  : types.some(t => ['restaurant','fast_food_restaurant','hamburger_restaurant'].includes(t))
    && !types.some(t => ['bar','pub','night_club','casino','amusement_center','hotel','shopping_mall'].includes(t));
const validationCache = new WeakMap<object, {key: string; at: number; expires: number; value: MultiDayOfferAvailability}>();
export function offerAvailabilityCacheIdentity(event: Input): string | null {
  try {
    return JSON.stringify([event.timing, event.offerAvailabilityBinding, event.venueId,
      event.startDate, event.endDate, event.startTime, event.endTime, event.sourceUniqueId, event.sourceUniqueIds,
      event.type, event.category, event.title, event.description, event.locationScope,
      event.isRecurring, event.isRecurringInstance, event.recurringPattern]);
  } catch { return null; }
}

/** Consumer of the producer's availability v1 checkpoint. No provider lookup or hours inference. */
export function readOfferAvailability(event: Input, now = new Date()): MultiDayOfferAvailability | null {
  const child = event.timing?.availability;
  if (!record(child)) return null;
  // Reuse validated evidence across the card, badge, filters and counts. The
  // content key also catches in-place producer/store updates, not only identity.
  const key = offerAvailabilityCacheIdentity(event);
  if (key === null) return null;
  const at = now.getTime(), cached = validationCache.get(child);
  if (cached?.key === key && at >= cached.at && at < cached.expires) return cached.value;
  const value = validateOfferAvailability(event, now);
  if (value) validationCache.set(child, {key, at, expires: Date.parse(value.expiresAt), value});
  return value;
}

function validateOfferAvailability(event: Input, now: Date): MultiDayOfferAvailability | null {
  const t = event.timing, h: unknown = t?.availability, binding = event.offerAvailabilityBinding;
  const sourceText = `${event.title || ''} ${event.description || ''}`;
  if (!record(h) || t?.version !== 2 || t.scheduleKind !== 'multi_day' || t.visitingHours
    || event.type !== 'special' || !['Food Special','Drink Special'].includes(event.category || '')
    || (event.locationScope && event.locationScope !== 'venue') || !DATE_CUE.test(sourceText) || RESTRICTED.test(sourceText) || SESSION.test(sourceText)
    || event.startTime?.trim() || event.endTime?.trim() || recurring(event.isRecurring) || recurring(event.isRecurringInstance)
    || (event.recurringPattern && event.recurringPattern !== 'none')
    || t.schedule?.start?.status !== 'unknown' || t.schedule?.end?.status !== 'unknown'
    || t.schedule.start.at || t.schedule.end.at || t.schedule.start.localTime || t.schedule.end.localTime
    || t.schedule.start.localDate !== event.startDate || t.schedule.end.localDate !== event.endDate
    || t.policyVersion !== 'honest-end-times-v2' || t.estimate?.method !== 'source_dated_activity_unknown_clock'
    || t.estimate?.estimateVersion !== 'date-only-activity-v1' || t.estimate.invalidatedAt
    || t.estimate.displayEndAt || t.estimate.endAt || t.estimate.displayEndDate || t.estimate.displayEndTime
    || t.estimate.discoveryCutoffDate !== event.endDate || !/^(?:23:59|11:59(?::00)?\s*PM)$/i.test(t.estimate.discoveryCutoffTime || '')
    || h.version !== 1 || h.kind !== 'offer_availability' || !text(h.venueId) || h.venueId !== event.venueId
    || !text(h.placeId) || !['food', 'bar'].includes(h.service) || !date(h.startDate) || !date(h.endDate)
    || h.startDate !== event.startDate || h.endDate !== event.endDate || h.endDate <= h.startDate
    || dayNumber(h.endDate) - dayNumber(h.startDate) >= 366 || !text(h.timeZone) || h.timeZone !== t.timeZone
    || !text(h.revision) || !Number.isFinite(now.getTime()) || !Number.isFinite(instant(h.generatedAt))
    || instant(h.generatedAt) > now.getTime() + 60000 || !Number.isFinite(instant(h.expiresAt))
    || instant(h.expiresAt) <= now.getTime() || instant(h.expiresAt) <= instant(h.generatedAt)
    || instant(h.expiresAt) - instant(h.generatedAt) > MAX_AGE
    || !record(h.sourceOffer) || !text(h.sourceOffer.id) || !url(h.sourceOffer.url)
    || !text(h.sourceOffer.evidence) || !text(h.sourceOffer.generationId)
    || ![event.sourceUniqueId, ...(Array.isArray(event.sourceUniqueIds) ? event.sourceUniqueIds : [])].includes(h.sourceOffer.id)
    || !record(binding) || binding.venueId !== event.venueId || binding.venueId !== h.venueId
    || binding.placeId !== h.placeId || binding.startDate !== event.startDate || binding.endDate !== event.endDate
    || binding.sourceOfferId !== h.sourceOffer.id || binding.generationId !== h.sourceOffer.generationId
    || h.service !== (event.category === 'Drink Special' ? 'bar' : 'food')
    || !Array.isArray(h.hoursSources) || !h.hoursSources.length || h.hoursSources.length > 32
    || !record(h.dateRules) || !record(h.usualWeek)) return null;
  try { new Intl.DateTimeFormat('en', {timeZone: h.timeZone}).format(); } catch { return null; }
  const sources = new Map<string, Record<string, any>>();
  for (const s of h.hoursSources) {
    if (!record(s) || !text(s.id) || sources.has(s.id) || !['google_places', 'official'].includes(s.provider)
      || !['current_dated', 'regular_weekly'].includes(s.kind) || !url(s.url)
      || !Number.isFinite(instant(s.capturedAt)) || instant(s.capturedAt) > now.getTime() + 60000
      || instant(s.capturedAt) > instant(h.generatedAt) + 60000 || now.getTime() - instant(s.capturedAt) > MAX_AGE
      || !Number.isFinite(instant(s.expiresAt)) || instant(s.expiresAt) < instant(h.expiresAt)
      || instant(s.expiresAt) <= instant(s.capturedAt) || instant(s.expiresAt) - instant(s.capturedAt) > MAX_AGE
      || !date(s.validFrom) || !date(s.validThrough) || s.validThrough < s.validFrom
      || s.venueId !== h.venueId || s.placeId !== h.placeId || s.returnedPlaceId !== h.placeId
      || s.service !== h.service || s.businessStatus !== 'OPERATIONAL' || !Array.isArray(s.types)
      || !s.types.every((v: unknown) => typeof v === 'string')
      || !serviceMatches(s.types, h.service)
      || !text(s.canonicalAddress) || !text(s.returnedAddress) || !street(s.canonicalAddress)
      || street(s.canonicalAddress) !== street(s.returnedAddress)
      || (locality(s.canonicalAddress) && locality(s.returnedAddress) && locality(s.canonicalAddress) !== locality(s.returnedAddress))
      || (province(s.canonicalAddress) && province(s.returnedAddress) && province(s.canonicalAddress) !== province(s.returnedAddress))) return null;
    if (s.provider === 'google_places' && s.kind === 'current_dated') {
      const capturedDate = visitingLocalNow(event, new Date(s.capturedAt)).date;
      if (s.validFrom < capturedDate || s.validThrough > visitingDateAfter(capturedDate, 6)) return null;
    }
    sources.set(s.id, s);
  }
  const validRule = (r: unknown) => {
    if (!record(r) || !['open','closed','unknown'].includes(r.state) || !Array.isArray(r.segments)
      || (r.state === 'unknown' && !text(r.reason))) return false;
    if (r.state !== 'open') return r.segments.length === 0;
    if (!r.segments.length || r.segments.length > 4) return false;
    let previousEnd = -1;
    for (const s of r.segments) {
      if (!record(s) || 'truncated' in s || ![0,1].includes(s.endDayOffset)) return false;
      const open = minute(s.open), close = minute(s.close) + s.endDayOffset * 1440;
      if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open || close - open > 1440 || open < previousEnd) return false;
      previousEnd = close;
    }
    return true;
  };
  for (const [d,r] of Object.entries(h.dateRules)) {
    const s = record(r) ? sources.get(r.sourceId) : undefined;
    if (!date(d) || d < h.startDate || d > h.endDate || !validRule(r) || s?.kind !== 'current_dated' || d < s.validFrom || d > s.validThrough) return null;
  }
  for (const [weekday,r] of Object.entries(h.usualWeek)) {
    if (!/^[0-6]$/.test(weekday) || !validRule(r) || !record(r) || sources.get(r.sourceId)?.kind !== 'regular_weekly') return null;
  }
  return h as unknown as MultiDayOfferAvailability;
}

/** Service-date rules; a closure today does not cancel a known overnight tail. */
export function offerAvailabilityView(event: Input, viewedDate: string, now = new Date()): AvailabilityView {
  return evaluateAvailability(event, readOfferAvailability(event, now), viewedDate, now);
}

function evaluateAvailability(event: Input, h: MultiDayOfferAvailability | null, viewedDate: string, now: Date): AvailabilityView {
  const empty = (state: AvailabilityView['state'], reason: string): AvailabilityView => ({state, intervals: [], usualIntervals: [], certainty: 'unknown', nowEligibility: 'none', withinEstimatedWindow: false, reason});
  if (!h || !date(viewedDate)) return empty('unknown', 'Unsupported, stale or unbound availability');
  if (viewedDate < h.startDate || viewedDate > h.endDate) return empty('outside', 'Outside advertised offer dates');
  const today = h.dateRules[viewedDate];
  const result = empty(today?.state === 'closed' ? 'closed' : today?.state === 'open' ? 'scheduled' : 'unknown', today?.reason || (today ? 'Estimated from dated service hours; promotion clocks were not advertised' : 'Date-specific hours unknown'));
  const add = (serviceDate: string, tail: boolean) => {
    const rule = h.dateRules[serviceDate];
    if (rule?.state !== 'open') return;
    for (const s of rule.segments) {
      const open = minute(s.open), close = minute(s.close) + s.endDayOffset * 1440;
      if (tail && close <= 1440) continue;
      result.intervals.push({open: tail ? 0 : open, close: tail ? close - 1440 : Math.min(close, viewedDate === h.endDate ? 1440 : close), serviceDate, sourceId: rule.sourceId});
    }
  };
  add(viewedDate, false);
  if (viewedDate > h.startDate) add(visitingDateAfter(viewedDate, -1), true);
  result.intervals.sort((a,b) => a.open - b.open);
  if (result.intervals.length) result.certainty = 'estimated';
  if (result.intervals.length && result.state === 'closed') result.state = 'scheduled';
  // Usual weekly hours never establish date-specific availability or holiday truth.
  if (!today) {
    const rule = h.usualWeek[String(new Date(`${viewedDate}T12:00:00Z`).getUTCDay())];
    const source = h.hoursSources.find(s => s.id === rule?.sourceId);
    if (rule?.state === 'open' && source && viewedDate >= source.validFrom && viewedDate <= source.validThrough) result.usualIntervals = rule.segments.map(s => ({...s}));
  }
  const local = visitingLocalNow(event, now);
  result.withinEstimatedWindow = local.date === viewedDate && result.intervals.some(s => local.minute >= s.open && local.minute < s.close);
  return result;
}

/** Entire bounded range, including exceptions beyond one repeating week. */
export function offerMatchesWindow(event: Input, from: string, to?: string, now = new Date()): boolean {
  const h = readOfferAvailability(event, now);
  if (!h || !date(from) || (to !== undefined && !date(to)) || (to && to < from)) return false;
  const start = from > h.startDate ? from : h.startDate, end = to && to < h.endDate ? to : h.endDate;
  for (let d = start; d <= end; d = visitingDateAfter(d, 1)) {
    const view = evaluateAvailability(event, h, d, now);
    if (view.state === 'unknown' || view.state === 'scheduled') return true;
  }
  return false;
}

export function offerHoursText(event: Input, viewedDate: string | null, now = new Date()): string {
  const h = readOfferAvailability(event, now); if (!h) return '';
  if (viewedDate === null) return 'Hours vary by date';
  const view = offerAvailabilityView(event, viewedDate, now);
  if (view.state === 'outside') return viewedDate < h.startDate ? 'Offer not yet started' : 'Offer ended';
  const clocks = view.intervals.map(s => `${visitingClock(s.open)} – ${visitingClock(s.close)}${s.close >= 1440 ? ' (+1 day)' : ''}`).join(', ');
  if (view.state === 'unknown') return clocks ? `${clocks} (estimated); other times unknown` : 'Times unknown';
  return view.state === 'closed' ? 'Closed' : `${clocks} (estimated)`;
}
const label = (d: string) => new Intl.DateTimeFormat('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric'}).format(new Date(`${d}T12:00:00Z`));
export function offerHoursSummary(event: Input, viewedDate: string | null, now = new Date()): string {
  const h = readOfferAvailability(event, now); if (!h) return '';
  if (viewedDate === null) return `${label(h.startDate)} – ${label(h.endDate)} • ${offerHoursText(event, null, now)}`;
  const today = visitingLocalNow(event, now).date;
  return `${viewedDate === today ? 'Today' : viewedDate === visitingDateAfter(today,1) ? 'Tomorrow' : label(viewedDate)} • ${offerHoursText(event, viewedDate, now)}`;
}
