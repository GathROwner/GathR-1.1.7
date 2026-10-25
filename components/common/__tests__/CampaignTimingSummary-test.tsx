import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { EventTimingSummaryText } from '../EventTimingSummaryText';
import { useMapStore } from '../../../store';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType } from '../../../types/filter';
import { continuousDonationCampaign } from '../../../utils/__tests__/fixtures/continuousDonationCampaign';
import { continuousCocktailPromotion } from '../../../utils/__tests__/fixtures/continuousCocktailPromotion';
import { EventTimingBadge } from '../EventTimingBadge';

jest.mock('../../../store', () => ({ useMapStore: jest.requireActual('zustand').create(() => ({
  filterCriteria: { eventFilters: { timeFilter: 'today' }, specialFilters: { timeFilter: 'today' } },
})) }));
beforeEach(() => jest.useFakeTimers({ now: new Date('2026-10-25T01:00:00Z') }));
afterEach(() => jest.useRealTimers());
it.each([false, true])('uses special selected-date filters in cocktail carousel and lightbox, with no contradictory unknown badge (%s)', slaymaker => {
  jest.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  act(() => useMapStore.setState({ filterCriteria: { ...DEFAULT_FILTER_CRITERIA,
    eventFilters: { timeFilter: TimeFilterType.TODAY }, specialFilters: { timeFilter: TimeFilterType.TODAY } } }));
  const event = continuousCocktailPromotion(slaymaker);
  let tree: renderer.ReactTestRenderer;
  const view = (carousel: boolean) => <><EventTimingSummaryText event={event} carousel={carousel} remainingCampaignDates={!carousel} />
    <EventTimingBadge event={event} carousel={carousel} remainingCampaignDates={!carousel} /></>;
  act(() => { tree = renderer.create(view(true)); });
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 25–Oct 31');
  expect(JSON.stringify(tree!.toJSON())).not.toMatch(/UNKNOWN|10AM|11:30/);
  act(() => tree!.update(view(false)));
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 25–Oct 31');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('UNKNOWN');
  act(() => useMapStore.setState({ filterCriteria: { ...useMapStore.getState().filterCriteria,
    specialFilters: { timeFilter: TimeFilterType.UPCOMING, upcomingDate: { kind: 'custom', startDate: '2026-10-28', endDate: '2026-10-28' } } } }));
  expect(JSON.stringify(tree!.toJSON())).toContain('Oct 28–Oct 31');
  act(() => tree!.unmount());
});

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
