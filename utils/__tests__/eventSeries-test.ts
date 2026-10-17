import { getEventScheduleContext } from '../eventSeries';

const referenceDate = new Date('2026-09-06T12:00:00');

describe('getEventScheduleContext', () => {
  it('labels an explicit select-dates series without treating its boundary as one occurrence end', () => {
    expect(getEventScheduleContext({
      title: 'Come From Away — Select Dates',
      description: 'Performances on select dates.',
      startDate: '2026-09-06',
      endDate: '2026-09-06',
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-09-26',
    }, referenceDate)).toEqual({
      endDate: '2026-09-26',
      label: 'Select dates through Sep 26',
      kind: 'select_dates',
    });
  });

  it('supports trustworthy daily recurrence metadata', () => {
    expect(getEventScheduleContext({
      title: 'Daily tour',
      description: '',
      startDate: '2026-09-06',
      endDate: '2026-09-06',
      isRecurring: true,
      recurringPattern: 'daily',
      recurrenceUntilDate: '2026-09-26',
    }, referenceDate)?.label).toBe('Daily through Sep 26');
  });

  it('supports a single weekly recurrence day', () => {
    expect(getEventScheduleContext({
      title: 'Friday concert',
      description: '',
      startDate: '2026-09-04',
      endDate: '2026-09-04',
      isRecurring: true,
      recurringPattern: 'weekly_friday',
      recurrenceUntilDate: '2026-10-02',
    }, referenceDate)?.label).toBe('Every Friday through Oct 2');
  });

  it('recognizes a legacy long-span record only when its copy explicitly says select dates', () => {
    expect(getEventScheduleContext({
      title: 'Come From Away',
      description: 'June 30 - September 26 (select dates).',
      startDate: '2026-06-30',
      endDate: '2026-09-26',
      isRecurring: false,
      recurringPattern: 'none',
    }, referenceDate)?.label).toBe('Select dates through Sep 26');
  });

  it('places an ordinary multi-day span on its own quieter schedule line', () => {
    expect(getEventScheduleContext({
      title: 'Three-day festival',
      description: 'One continuous festival weekend.',
      startDate: '2026-09-04',
      endDate: '2026-09-06',
      startTime: '10:00',
      endTime: '17:00',
      isRecurring: false,
      recurringPattern: 'none',
    }, referenceDate)).toEqual({
      endDate: '2026-09-06',
      label: 'Runs through Sep 6',
      kind: 'multi_day_span',
    });
  });

  it('describes an overnight ending without calling it a recurring series', () => {
    expect(getEventScheduleContext({
      title: 'PEI International Shellfish Festival Shuttle',
      description: 'Shuttle service from 11:30 AM to midnight.',
      startDate: '2026-09-06',
      endDate: '2026-09-07',
      startTime: '11:30',
      endTime: '00:00',
      isRecurring: true,
      recurringPattern: 'weekly_custom',
    }, referenceDate)).toEqual({
      endDate: '2026-09-07',
      label: 'Ends Mon, Sep 7',
      kind: 'overnight_end',
    });
  });

  it('handles the long-running route-preview shape without relying on title keywords', () => {
    expect(getEventScheduleContext({
      title: 'Route Demo — Temporary Address Lookup',
      description: 'GathR test event.',
      startDate: '2026-09-02',
      endDate: '2026-09-09',
      startTime: '15:30',
      endTime: '23:00',
      isRecurring: false,
      recurringPattern: 'none',
    }, referenceDate)).toEqual({
      endDate: '2026-09-09',
      label: 'Runs through Sep 9',
      kind: 'multi_day_span',
    });
  });
});
