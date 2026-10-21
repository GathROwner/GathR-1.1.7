jest.mock('../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
import { softInternet, softInternetApi } from './fixtures/softInternet';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import { readVisitingHours, visitingHoursText, visitingViewDate, visitingHoursSummary, visitingIntervals } from '../visitingHours';
import { getEventScheduleState, getEventTimingBadge, getEventTimeRangeParts, getEventTimingDisclosure } from '../eventTiming';
import { getCachedEventScheduleState, resetEventScheduleStateCache } from '../eventScheduleStateCache';
import { createEventTimeContext, doesEventMatchTypeFilters } from '../mapEventFilters';
import { TimeFilterType } from '../../types/filter';
import { normalizeFirestoreEvent } from '../../lib/api/firestoreEvents';
import { formatEventTimingSummary } from '../dateUtils';

const match = (e: ReturnType<typeof softInternet>, timeFilter: TimeFilterType, now: string, upcomingDate?: any) =>
  doesEventMatchTypeFilters(e, {timeFilter,upcomingDate}, createEventTimeContext(new Date(now)));
afterEach(() => { jest.useRealTimers(); resetEventScheduleStateCache(); });

it('preserves exact canonical/API date-only clocks while normalizing source-backed gallery hours', () => {
  const e = softInternet(), timing = e.timing;
  const n = normalizeFirestoreEvent(softInternetApi());
  expect(n.startDate).toBe('2026-10-03'); expect(n.endDate).toBe('2027-01-24');
  expect(n.startTime).toBe('');expect(n.endTime).toBe('');expect(n.timing?.visitingHours).toEqual(timing!.visitingHours);
  expect(readVisitingHours(n)?.facilityId).toBe('slug_ccoagallery');
  const persisted = JSON.parse(JSON.stringify(n));expect(readVisitingHours(persisted)).toEqual(readVisitingHours(n));
  expect(visitingHoursText(n,'2026-10-25')).toBe('1:00 PM – 5:00 PM');
});

it.each([
  ['2026-10-21T12:59:00Z',true,false], ['2026-10-21T13:00:00Z',true,true],
  ['2026-10-21T20:00:00Z',true,false], ['2026-10-25T15:59:00Z',true,false],
  ['2026-10-25T16:00:00Z',true,true], ['2026-10-26T15:00:00Z',false,false],
  ['2026-11-01T16:59:00Z',true,false], ['2026-11-01T17:00:00Z',true,true],
  ['2026-11-01T22:00:00Z',true,false], ['2026-10-02T17:00:00Z',false,false],
  ['2026-10-03T13:00:00Z',true,true], ['2027-01-24T17:00:00Z',true,true],
  ['2027-01-25T04:00:00Z',false,false],
])('resolves weekday/date/DST at %s', (instant,today,now) => {
  const e=softInternet();expect(match(e,TimeFilterType.TODAY,instant)).toBe(today);
  expect(match(e,TimeFilterType.NOW,instant)).toBe(now);
  expect(getEventScheduleState(e,new Date(instant)).code === 'confirmed_ended').toBe(instant.startsWith('2027-01-25'));
});

it('uses selected Sunday/Monday rather than device weekday, including Tomorrow and ongoing Upcoming', () => {
  const e=softInternet(), now=new Date('2026-10-21T15:00:00Z');
  const sunday={timeFilter:TimeFilterType.UPCOMING,upcomingDate:{kind:'custom' as const,startDate:'2026-10-25',endDate:'2026-10-25'}};
  const monday={...sunday,upcomingDate:{kind:'custom' as const,startDate:'2026-10-26',endDate:'2026-10-26'}};
  expect(visitingViewDate(e,sunday,now)).toBe('2026-10-25');
  expect(visitingHoursSummary(e,visitingViewDate(e,sunday,now),now)).toBe('Oct 25 • 1:00 PM – 5:00 PM');
  expect(match(e,TimeFilterType.UPCOMING,now.toISOString(),sunday.upcomingDate)).toBe(true);
  expect(match(e,TimeFilterType.UPCOMING,now.toISOString(),monday.upcomingDate)).toBe(false);
  expect(match(e,TimeFilterType.UPCOMING,now.toISOString())).toBe(true);
  expect(match(e,TimeFilterType.TOMORROW,'2026-10-25T15:00:00Z')).toBe(false);
  expect(match(e,TimeFilterType.TOMORROW,'2026-10-24T15:00:00Z')).toBe(true);
  expect(match(e,TimeFilterType.TOMORROW,'2026-10-26T15:00:00Z')).toBe(true);
  expect(getEventScheduleState(e,new Date('2026-10-26T15:00:00Z')).defaultMapEligible).toBe(true);
  expect(visitingHoursText(e,'2026-10-26')).toBe('Closed');
  expect(visitingViewDate(e,{timeFilter:TimeFilterType.UPCOMING},now)).toBeNull();
  expect(visitingHoursText(e,null)).toBe('Hours vary by day');
});

it('refreshes cached state at opening, closing and local midnight without expiring the exhibition', () => {
  const e=softInternet(), state=(iso:string)=>getCachedEventScheduleState(e,new Date(iso));
  expect(state('2026-10-25T15:59:00Z').nowEligibility).toBe('none');
  expect(state('2026-10-25T16:00:00Z').nowEligibility).toBe('confirmed');
  expect(state('2026-10-25T20:00:00Z').nowEligibility).toBe('none');
  expect(state('2026-10-26T03:00:00Z').todayEligible).toBe(false);
  expect(state('2026-10-27T03:00:00Z').todayEligible).toBe(true);
});

it('shows visiting hours and supporting source instead of falsely unknown times', () => {
  jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-21T15:00:00Z'));
  const e=softInternet();expect(formatEventTimingSummary(e)).toBe('Today • 10:00 AM – 5:00 PM');
  expect(getEventTimeRangeParts(e,new Date(),'2026-10-25').text).toBe('1:00 PM – 5:00 PM');
  expect(getEventTimingBadge(e)?.text).toBe('VISITING\nHOURS');
  expect(getEventTimingDisclosure(e)).toContain('closed Mondays');expect(getEventTimingDisclosure(e)).toContain('holiday-hour changes');
});

it('rejects malformed, mismatched, estimated or unsupported schedules and never borrows a building schedule', () => {
  for(const mutate of [
    (e:any)=>e.timing.visitingHours.week[0]=null,(e:any)=>e.timing.visitingHours.week[0].segments=[null],
    (e:any)=>e.timing.visitingHours.week.pop(),(e:any)=>e.timing.visitingHours.facilityId='parent_building',
    (e:any)=>e.venueId=null,(e:any)=>delete e.venueId,(e:any)=>e.timing.schedule=null,
    (e:any)=>e.timing.schedule.start=null,(e:any)=>e.timing.schedule.end=null,
    (e:any)=>e.timing.visitingHours.source.type='google_unverified',(e:any)=>e.timing.visitingHours.exceptions={},
    (e:any)=>e.timing.estimate.invalidatedAt='2026-10-21T00:00:00Z',
    (e:any)=>e.startTime='19:00',(e:any)=>e.endTime='21:00',(e:any)=>e.isRecurring=true,
  ]) {const e=softInternet();mutate(e);expect(readVisitingHours(e)).toBeNull();}
  const e=dateOnlyActivity();expect(readVisitingHours(e)).toBeNull();expect(getEventTimingBadge(e)?.text).toBe('TIMES\nUNKNOWN');
});

it('supports split hours and overnight carry without altering ordinary overnight events', () => {
  const e=softInternet(), h=e.timing!.visitingHours!;
  h.week.find(d=>d.weekday==='Wednesday')!.segments=[{open:'10:00',close:'12:00',overnight:false},{open:'13:00',close:'17:00',overnight:false}];
  expect(visitingIntervals(e,'2026-10-21')).toHaveLength(2);expect(match(e,TimeFilterType.NOW,'2026-10-21T15:30:00Z')).toBe(false);
  h.week.find(d=>d.weekday==='Sunday')!.segments=[{open:'22:00',close:'02:00',overnight:true}];
  expect(match(e,TimeFilterType.NOW,'2026-10-26T04:00:00Z')).toBe(true);
});
