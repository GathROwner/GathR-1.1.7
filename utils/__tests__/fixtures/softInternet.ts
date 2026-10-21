import type { Event, EventVisitingHours } from '../../../types/events';
import { dateOnlyActivity } from './dateOnlyActivity';
import type { FirestoreEvent } from '../../../types/firestore';

/** Exact October 15 canonical dates/blank clocks and original caption/primary-source hours. */
export const softInternetHours = (): EventVisitingHours => ({
  version: 1, facilityId: 'slug_ccoagallery', startDate: '2026-10-03', endDate: '2027-01-24',
  week: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(weekday => ({
    weekday, closed: weekday === 'Monday', segments: weekday === 'Monday' ? [] : [
      { open: weekday === 'Sunday' ? '13:00' : '10:00', close: '17:00', overnight: false },
    ],
  })),
  source: { type: 'source_explicit', url: 'https://confederationcentre.com/exhibition/soft-internet-theory/',
    postIds: ['1729449245853296','1512241067607930'], verifiedAt: '2026-10-21T11:53:42.426Z',
    evidence: 'Tuesday–Saturday 10 a.m.–5 p.m.; Sunday 1–5 p.m.; closed Mondays.' },
  caveat: 'Check the gallery for holiday-hour changes.',
});
export const softInternet = (): Event => {
  const e = dateOnlyActivity({ id: 'fb_XDJ0vlTopBBg3rEibyOj', title: 'SOFT INTERNET THEORY',
    venue: 'Confederation Centre Art Gallery', venueId: 'slug_ccoagallery', category: 'Workshops & Classes',
    address: '145 Richmond St, Charlottetown', startDate: '2026-10-03', endDate: '2027-01-24',
    description: 'Soft Internet Theory is on view October 3, 2026 through January 24, 2027. Admission is by donation.' });
  e.timing!.visitingHours = softInternetHours(); return e;
};

/** Public API projection from the exact captured record, with only the proposed optional extension. */
export const softInternetApi = (): FirestoreEvent => ({
  id:'XDJ0vlTopBBg3rEibyOj', type:'event', title:'SOFT INTERNET THEORY',
  description:softInternet().description, startDate:'2026-10-03',endDate:'2027-01-24',startTime:'',endTime:'',
  venueId:'slug_ccoagallery',venue:'Confederation Centre Art Gallery',address:'145 Richmond St, Charlottetown, PE C1A 4B3, Canada',
  latitude:46.2348678,longitude:-63.1268533,category:'Workshops & Classes',isEvent:true,
  isRecurring:false,recurringPattern:'none',isRecurringInstance:false,
  metadata:{timing:softInternet().timing,sourceUniqueIds:['1729449245853296','1512241067607930'],
    timeResolution:{hoursUsed:false,reason:'reviewed_exhibition_date_range'}},
} as unknown as FirestoreEvent);
