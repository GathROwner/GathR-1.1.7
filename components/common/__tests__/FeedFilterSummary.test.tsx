import { getFeedFilterSummary } from '../FeedFilterSummary';
import { TimeFilterType } from '../../../types/filter';

it('keeps the selected time, category and saved restriction visible in the compact summary', () => {
  expect(getFeedFilterSummary({ timeFilter: TimeFilterType.TODAY })).toBe('Today · All categories');
  expect(getFeedFilterSummary({ timeFilter: TimeFilterType.TOMORROW, category: 'Live Music', savedOnly: true }))
    .toBe('Tomorrow · Live Music · Saved only');
  expect(getFeedFilterSummary({ timeFilter: TimeFilterType.ALL })).toBe('All times · All categories');
  expect(getFeedFilterSummary({ timeFilter: TimeFilterType.UPCOMING, upcomingDate: { kind: 'next7' } }))
    .toBe('Next 7 days · All categories');
});
