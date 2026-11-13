jest.mock('../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
import type { Event } from '../../types/events';
import { offerAvailabilityFixture, offerFixtureNow } from './fixtures/offerAvailability';
import fixture from './fixtures/offerAvailability.json';
import { readOfferAvailability, offerAvailabilityView, offerHoursText, offerHoursSummary, offerMatchesWindow } from '../offerAvailability';
import { getEventScheduleState, getEventTimingBadge, getEventTimeRangeParts, getEventTimingDisclosure } from '../eventTiming';
import { normalizeFirestoreEvent } from '../../lib/api/firestoreEvents';
import { createEventTimeContext, doesEventMatchTypeFilters, countUpcomingDateItems } from '../mapEventFilters';
import { getCachedEventScheduleState, resetEventScheduleStateCache } from '../eventScheduleStateCache';
import { TimeFilterType } from '../../types/filter';
import { formatEventTimingSummary } from '../dateUtils';
import { visitingViewDate } from '../visitingHours';
import { softInternet } from './fixtures/softInternet';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import { getCarouselTimeParts } from '../carouselEventTiming';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(offerFixtureNow); });
afterEach(() => { jest.useRealTimers(); resetEventScheduleStateCache(); });
const match = (event: Event, timeFilter: TimeFilterType, date?: string, now = offerFixtureNow) => doesEventMatchTypeFilters(event, {timeFilter, ...(date ? {upcomingDate: {kind: 'custom',startDate: date,endDate: date}} : {})}, createEventTimeContext(now));

it('consumes the exact producer fixture including source binding through API normalization and JSON persistence', () => {
  const event = offerAvailabilityFixture();
  const api = { ...event, isEvent: false, timing: undefined, offerAvailabilityBinding: undefined, metadata: {timing: event.timing, offerAvailabilityBinding: event.offerAvailabilityBinding, uniqueId: 'offer-source', sourceUniqueIds: ['offer-source']}};
  const normalized = normalizeFirestoreEvent(api as any);
  expect(normalized.startTime).toBe(''); expect(normalized.endTime).toBe('');
  expect(normalized.timing?.availability).toEqual(fixture.timing.availability);
  expect(normalized.offerAvailabilityBinding).toEqual(fixture.binding);
  expect(readOfferAvailability(normalized)).toEqual(event.timing?.availability);
  expect(readOfferAvailability(JSON.parse(JSON.stringify(normalized)))).toEqual(event.timing?.availability);
  expect(EVENTS_MINIMAL).toContain('offer-availability-v1'); expect(EVENT_DETAILS_SCHEMA_VERSION).toContain('offer-availability-v1');
});

it.each(Object.entries(fixture.expected).filter(([key]) => key !== 'afterExpiry'))('matches the producer view checkpoint for %s', (date, expected) => {
  expect(offerAvailabilityView(offerAvailabilityFixture(), date)).toMatchObject(expected as object);
});

it('uses selected day, Tomorrow and range context without ever promising confirmed Now', () => {
  const event = offerAvailabilityFixture();
  expect(getEventScheduleState(event)).toMatchObject({code: 'expected_happening',nowEligibility: 'none',todayEligible: true});
  expect(match(event,TimeFilterType.NOW)).toBe(false);
  expect(match(event,TimeFilterType.TODAY)).toBe(true);
  expect(match(event,TimeFilterType.TOMORROW)).toBe(false);
  expect(match(event,TimeFilterType.UPCOMING,'2026-11-03')).toBe(false);
  expect(match(event,TimeFilterType.UPCOMING,'2026-11-11')).toBe(true);
  expect(match(event,TimeFilterType.ALL)).toBe(true);
  const selection = {timeFilter: TimeFilterType.UPCOMING,upcomingDate: {kind: 'custom' as const,startDate:'2026-11-06',endDate:'2026-11-06'}};
  const viewed = visitingViewDate(event,selection,offerFixtureNow);
  expect(viewed).toBe('2026-11-06');
  expect(formatEventTimingSummary(event,viewed)).toBe('Nov 6 • 11:00 AM – 12:00 AM (+1 day) (estimated)');
  expect(getCarouselTimeParts(event,offerFixtureNow,viewed).prefix).toBe('Nov 6 · 11AM–12AM (+1 day) (estimated)');
  expect(getEventTimingBadge(event,offerFixtureNow,'2026-11-03')).toBeNull();
  expect(getEventTimingBadge(event,offerFixtureNow,'2026-11-11')?.text).toBe('TIMES\nUNKNOWN');
  expect(getEventTimingBadge(event,offerFixtureNow,'2026-11-02')?.text).toBe('TIMES\nESTIMATED');
  expect(getEventTimingBadge(event,offerFixtureNow,null)?.text).toBe('HOURS\nVARY');
  expect(offerHoursSummary(event,null)).toBe('Nov 1 – Nov 15 • Hours vary by date');
  expect(getEventTimingDisclosure(event,offerFixtureNow,'2026-11-11')).toContain('Hours have not been confirmed for this date');
  expect(getEventTimingDisclosure(event,offerFixtureNow,'2026-11-11')).toContain('Usual restaurant hours:');
});

it('keeps unknown holiday visible and usual hours separate from specific-date truth', () => {
  const event = offerAvailabilityFixture();
  expect(offerHoursText(event,'2026-11-11')).toBe('Times unknown');
  expect(offerAvailabilityView(event,'2026-11-11').usualIntervals).toHaveLength(1);
  expect(offerAvailabilityView(event,'2026-11-04').usualIntervals).toEqual([]);
});

it('scans beyond eight days and shares range counts with consumer filtering', () => {
  const event = offerAvailabilityFixture(), h = event.timing!.availability!;
  h.hoursSources[0].provider = 'official'; h.hoursSources[0].validFrom = h.startDate; h.hoursSources[0].validThrough = h.endDate;
  h.dateRules = {};
  for (let day=1;day<=15;day++) h.dateRules[`2026-11-${String(day).padStart(2,'0')}`] = {state:'closed',segments:[],sourceId:'current_dated'};
  h.dateRules['2026-11-14'] = {state:'open',segments:[{open:'12:00',close:'14:00',endDayOffset:0}],sourceId:'current_dated'};
  expect(offerMatchesWindow(event,'2026-11-02','2026-11-13')).toBe(false);
  expect(offerMatchesWindow(event,'2026-11-02','2026-11-15')).toBe(true);
  const upcomingDate = {kind:'custom' as const,startDate:'2026-11-02',endDate:'2026-11-15'};
  const filters = {timeFilter:TimeFilterType.UPCOMING,upcomingDate};
  expect(doesEventMatchTypeFilters(event,filters,createEventTimeContext(offerFixtureNow))).toBe(true);
  expect(countUpcomingDateItems([event],{showEvents:true,showSpecials:true,eventFilters:filters,specialFilters:filters} as any,upcomingDate,'special',createEventTimeContext(offerFixtureNow))).toBe(1);
});

it('retains split gaps, prior-date overnight tails, and conservative source bounds', () => {
  const event = offerAvailabilityFixture(), h = event.timing!.availability!;
  h.dateRules['2026-11-02'].segments = [{open:'11:00',close:'13:00',endDayOffset:0},{open:'17:00',close:'22:00',endDayOffset:0}];
  expect(offerAvailabilityView(event,'2026-11-02',new Date('2026-11-02T19:00:00Z')).withinEstimatedWindow).toBe(false);
  expect(offerHoursText(event,'2026-11-02')).toBe('11:00 AM – 1:00 PM, 5:00 PM – 10:00 PM (estimated)');
  h.dateRules['2026-11-02'].segments = [{open:'18:00',close:'02:00',endDayOffset:1}];
  expect(offerAvailabilityView(event,'2026-11-03',new Date('2026-11-03T05:00:00Z'))).toMatchObject({state:'scheduled',withinEstimatedWindow:true,intervals:[{open:0,close:120,serviceDate:'2026-11-02'}]});
  expect(offerAvailabilityView(event,'2026-11-01').intervals).toEqual([]);
  h.hoursSources[0].provider = 'official'; h.hoursSources[0].validThrough = h.endDate;
  h.dateRules[h.endDate] = {state:'open',segments:[{open:'18:00',close:'02:00',endDayOffset:1}],sourceId:'current_dated'};
  expect(offerAvailabilityView(event,h.endDate).intervals[0].close).toBe(1440);
  expect(offerAvailabilityView(event,'2026-11-16').state).toBe('outside');
});

it('keeps known overnight tail with unknown daytime rather than inventing the rest of the day', () => {
  const event = offerAvailabilityFixture();
  event.timing!.availability!.dateRules['2026-11-06'].segments = [{open:'18:00',close:'02:00',endDayOffset:1}];
  expect(offerAvailabilityView(event,'2026-11-07')).toMatchObject({state:'unknown',intervals:[{open:0,close:120}]});
  expect(offerHoursText(event,'2026-11-07')).toBe('12:00 AM – 2:00 AM (estimated); other times unknown');
});

it('rejects malformed, stale, wrong branch/source/clock metadata to an honest parent fallback', () => {
  for (const mutate of [
    (e:any)=>e.venueId='other', (e:any)=>e.sourceUniqueId='other',
    (e:any)=>delete e.offerAvailabilityBinding,
    (e:any)=>e.offerAvailabilityBinding.generationId='other-generation',
    (e:any)=>e.offerAvailabilityBinding.placeId='other-place',
    (e:any)=>e.offerAvailabilityBinding.sourceOfferId='other-source',
    (e:any)=>e.offerAvailabilityBinding.startDate='2026-11-02',
    (e:any)=>e.type='event', (e:any)=>e.category='Live Music', (e:any)=>e.description='November 1–15 lunch special',
    (e:any)=>{e.sourceUniqueId='other';e.sourceUniqueIds=['other'];},
    (e:any)=>e.timing.availability.hoursSources[0].returnedPlaceId='other',
    (e:any)=>e.timing.availability.hoursSources[0].returnedAddress='99 Other Road, Truro, NS',
    (e:any)=>e.timing.availability.hoursSources[0].types=['bar'],
    (e:any)=>e.timing.availability.dateRules['2026-11-02'].segments[0].truncated=true,
    (e:any)=>e.timing.availability.dateRules['2026-11-02'].segments[0].endDayOffset=2,
    (e:any)=>e.timing.availability.timeZone='Not/A_Zone', (e:any)=>e.timing.availability.timeZone='',
    (e:any)=>e.timing.availability.endDate='2026-11-16', (e:any)=>e.timing.availability.dateRules=null,
    (e:any)=>e.timing.availability.sourceOffer.generationId='', (e:any)=>e.timing.schedule=null,
    (e:any)=>e.startTime='19:00', (e:any)=>e.endTime='21:00', (e:any)=>e.isRecurring=true,
  ]) {
    const event=offerAvailabilityFixture();mutate(event);
    if (event.sourceUniqueIds?.includes('offer-source') && event.sourceUniqueId === 'other') {
      expect(readOfferAvailability(event)).not.toBeNull(); // Proven source union is still exact.
    } else expect(readOfferAvailability(event)).toBeNull();
  }
  const event=offerAvailabilityFixture(), expired=new Date('2026-11-08T16:00:00Z');
  expect(readOfferAvailability(event,expired)).toBeNull();
  expect(getEventScheduleState(event,expired)).toMatchObject({nowEligibility:'none',todayEligible:true});
  expect(getEventTimeRangeParts(event,expired).text).toBe('Time not provided');
  expect(match(event,TimeFilterType.ALL,undefined,expired)).toBe(true);
});

it('invalidates at interval/date/expiry/revision and preserves rollback-to-unknown', () => {
  const event=offerAvailabilityFixture(), at=(iso:string)=>getCachedEventScheduleState(event,new Date(iso));
  event.timing!.availability!.generatedAt='2026-11-01T17:00:00Z';
  event.timing!.availability!.hoursSources.forEach(s=>{s.provider='official';s.capturedAt='2026-11-01T17:00:00Z';});
  expect(at('2026-11-02T14:59:00Z').code).toBe('date_only_today');
  expect(at('2026-11-02T15:00:00Z').code).toBe('expected_happening');
  expect(at('2026-11-03T02:00:00Z').code).toBe('date_only_today');
  expect(at('2026-11-03T04:00:00Z').todayEligible).toBe(false);
  event.timing!.availability!.revision='v2'; event.timing!.availability!.dateRules['2026-11-03']={state:'unknown',segments:[],sourceId:'current_dated',reason:'New review'};
  expect(at('2026-11-03T04:00:01Z').todayEligible).toBe(true);
  expect(at('2026-11-08T16:00:00Z').nowEligibility).toBe('none');
  expect(at('2026-11-16T04:00:00Z').code).toBe('confirmed_ended');
});

it('uses Halifax local dates through DST, with no repeated-hour cache assumption', () => {
  const event=offerAvailabilityFixture(), h=event.timing!.availability!;
  h.generatedAt='2026-10-31T12:00:00Z';h.expiresAt='2026-11-06T12:00:00Z';
  h.hoursSources.forEach(s=>{s.provider='official';s.capturedAt='2026-10-31T12:00:00Z';s.expiresAt=h.expiresAt;s.validFrom=h.startDate;});
  h.dateRules['2026-11-01']={state:'open',segments:[{open:'01:00',close:'02:00',endDayOffset:0}],sourceId:'current_dated'};
  for(const instant of ['2026-11-01T04:30:00Z','2026-11-01T05:30:00Z']) {
    const now=new Date(instant);
    expect(offerAvailabilityView(event,'2026-11-01',now).withinEstimatedWindow).toBe(true);
    expect(getCachedEventScheduleState(event,now).nowEligibility).toBe('none');
  }
});

it('rejects in-place detached source proof immediately, including the shared schedule cache', () => {
  const event=offerAvailabilityFixture();
  expect(getCachedEventScheduleState(event,offerFixtureNow).code).toBe('expected_happening');
  event.sourceUniqueIds!.splice(0,event.sourceUniqueIds!.length,'detached'); event.sourceUniqueId='detached';
  expect(readOfferAvailability(event)).toBeNull();
  expect(getCachedEventScheduleState(event,new Date(offerFixtureNow.getTime()+1)).code).toBe('date_only_today');
  expect(match(event,TimeFilterType.ALL)).toBe(true);
});

it('preserves gallery source-explicit Now and single-day/ordinary date-only controls', () => {
  const gallery=softInternet();
  expect(readOfferAvailability(gallery)).toBeNull();
  expect(getEventScheduleState(gallery,new Date('2026-10-21T15:00:00Z')).nowEligibility).toBe('confirmed');
  const single=dateOnlyActivity({type:'special'});
  expect(readOfferAvailability(single)).toBeNull();
  expect(getEventTimingBadge(single)?.text).toBe('TIMES\nUNKNOWN');
});
