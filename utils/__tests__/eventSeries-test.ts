import { getEventSeriesContext } from '../eventSeries';

const referenceDate = new Date('2026-09-06T12:00:00');

describe('getEventSeriesContext', () => {
  it('labels an explicit select-dates series without treating its boundary as one occurrence end', () => {
    expect(getEventSeriesContext({
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
    expect(getEventSeriesContext({
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
    expect(getEventSeriesContext({
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
    expect(getEventSeriesContext({
      title: 'Come From Away',
      description: 'June 30 - September 26 (select dates).',
      startDate: '2026-06-30',
      endDate: '2026-09-26',
      isRecurring: false,
      recurringPattern: 'none',
    }, referenceDate)?.label).toBe('Select dates through Sep 26');
  });

  it('does not reinterpret an ordinary multi-day event as a recurring series', () => {
    expect(getEventSeriesContext({
      title: 'Three-day festival',
      description: 'One continuous festival weekend.',
      startDate: '2026-09-04',
      endDate: '2026-09-06',
      isRecurring: false,
      recurringPattern: 'none',
    }, referenceDate)).toBeNull();
  });
});

