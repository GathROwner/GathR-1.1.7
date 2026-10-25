import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { EventTimingSummaryText } from '../EventTimingSummaryText';
import { useMapStore } from '../../../store';
import { TimeFilterType } from '../../../types/filter';
import { continuousDonationCampaign } from '../../../utils/__tests__/fixtures/continuousDonationCampaign';

jest.mock('../../../store', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({
  filterCriteria: { eventFilters: { timeFilter: 'today' }, specialFilters: { timeFilter: 'today' } },
})) }));
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-25T01:00:00Z') }));
afterEach(() => jest.useRealTimers());

it('uses the same remaining dates in carousel and opted-in lightbox, reacts to selected days, and preserves default surfaces', () => {
  let tree: renderer.ReactTestRenderer;
  const event = continuousDonationCampaign();
  act(() => { tree = renderer.create(<EventTimingSummaryText event={event} carousel />); });
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 24–Oct 31');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('8AM');
  act(() => tree!.update(<EventTimingSummaryText event={event} remainingCampaignDates />));
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 24–Oct 31');
  act(() => useMapStore.setState({ filterCriteria: { ...useMapStore.getState().filterCriteria,
    eventFilters: { timeFilter: TimeFilterType.UPCOMING, upcomingDate: { kind: 'custom', startDate: '2026-10-29', endDate: '2026-10-29' } },
  } }));
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 29–Oct 31');
  act(() => tree!.update(<EventTimingSummaryText event={event} />));
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Oct 29–Oct 31');
  expect(JSON.stringify(tree!.toJSON())).toContain('8:00 AM');
  act(() => tree!.unmount());
});
