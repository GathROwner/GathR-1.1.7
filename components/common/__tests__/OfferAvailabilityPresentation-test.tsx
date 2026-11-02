import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Alert,Text} from 'react-native';
import {EventTimingSummaryText} from '../EventTimingSummaryText';
import {EventTimingBadge} from '../EventTimingBadge';
import {useViewedEventTimeStatus} from '../../../hooks/useVisitingHoursView';
import {offerAvailabilityFixture,offerFixtureNow} from '../../../utils/__tests__/fixtures/offerAvailability';
import {useMapStore} from '../../../store';
import {DEFAULT_FILTER_CRITERIA,TimeFilterType} from '../../../types/filter';
jest.mock('../../../store',()=>({useMapStore:jest.requireActual('zustand').create(()=>({filterCriteria:{eventFilters:{timeFilter:'today'},specialFilters:{timeFilter:'today'}}}))}));
const select=(date?:string)=>act(()=>useMapStore.setState({filterCriteria:{...DEFAULT_FILTER_CRITERIA,
  eventFilters:{timeFilter:TimeFilterType.TODAY},specialFilters:{timeFilter:TimeFilterType.UPCOMING,...(date?{upcomingDate:{kind:'custom',startDate:date,endDate:date}}:{})}}}));
beforeEach(()=>jest.useFakeTimers({now:offerFixtureNow}));
afterEach(()=>jest.useRealTimers());
const renderedText = (node: renderer.ReactTestRendererJSON | renderer.ReactTestRendererJSON[] | string | null): string =>
  typeof node === 'string' ? node : Array.isArray(node) ? node.map(renderedText).join('') : node?.children?.map(renderedText).join('') || '';

it('shares selected special date across actual summary, carousel and badge without using event filters',()=>{
  select('2026-11-03');const event=offerAvailabilityFixture();let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<><EventTimingSummaryText event={event}/><EventTimingBadge event={event}/></>);});
  expect(renderedText(c!.toJSON())).toContain('Tomorrow • Closed');
  expect(c!.root.findAllByProps({testID:'event-timing-badge'})).toHaveLength(0);
  select('2026-11-06');
  expect(JSON.stringify(c!.toJSON())).toContain('12:00 AM (+1 day) (estimated)');
  expect(JSON.stringify(c!.toJSON())).toContain('TIMES\\nESTIMATED');
  act(()=>c!.update(<><EventTimingSummaryText event={event} carousel/><EventTimingBadge event={event} carousel/></>));
  expect(JSON.stringify(c!.toJSON())).toContain('Nov 6 · 11AM–12AM (+1 day) (estimated)');
  select();
  expect(JSON.stringify(c!.toJSON())).toContain('Hours vary by date');
  expect(JSON.stringify(c!.toJSON())).toContain('HOURS\\nVARY');
  act(()=>c!.unmount());
});

it('shows unknown holiday with separately labeled usual-hours disclosure',()=>{
  select('2026-11-11');const event=offerAvailabilityFixture(), alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<><EventTimingSummaryText event={event}/><EventTimingBadge event={event}/></>);});
  expect(renderedText(c!.toJSON())).toContain('Nov 11 • Times unknown');
  expect(JSON.stringify(c!.toJSON())).toContain('TIMES\\nUNKNOWN');
  const badge=c!.root.findByProps({testID:'event-timing-badge'});
  act(()=>badge.props.onPress({stopPropagation:jest.fn()}));
  expect(alert).toHaveBeenCalledWith('Offer availability',expect.stringContaining('Usual restaurant hours:'));
  expect(alert.mock.calls[0][1]).toContain('do not confirm this date’s offer hours');
  act(()=>c!.unmount());alert.mockRestore();
});

it('withholds Now and falls back honestly when independent proof disappears',()=>{
  const event=offerAvailabilityFixture();select('2026-11-02');
  const Status=()=> <Text>{useViewedEventTimeStatus(event)}</Text>;let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<><Status/><EventTimingSummaryText event={event}/></>);});
  expect(JSON.stringify(c!.toJSON())).toContain('today');
  expect(JSON.stringify(c!.toJSON())).not.toContain('EXPECTED NOW');
  delete event.offerAvailabilityBinding;
  act(()=>c!.update(<EventTimingSummaryText event={{...event}}/>));
  expect(JSON.stringify(c!.toJSON())).toContain('Time not provided');
  act(()=>c!.unmount());
});

it('omits repeated estimate wording only while the adjacent estimated badge supplies that context',()=>{
  const event=offerAvailabilityFixture();select('2026-11-06');let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<><EventTimingSummaryText event={event} estimateBadgeVisible/><EventTimingBadge event={event}/></>);});
  expect(renderedText(c!.toJSON())).toContain('12:00 AM (+1 day)');
  expect(renderedText(c!.toJSON())).not.toContain('(estimated)');
  expect(renderedText(c!.toJSON())).toContain('TIMES\nESTIMATED');
  act(()=>c!.update(<EventTimingSummaryText event={event}/>));
  expect(renderedText(c!.toJSON())).toContain('(estimated)');
  act(()=>c!.unmount());
});
