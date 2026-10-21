import React from 'react';
import renderer, {act} from 'react-test-renderer';
import { EventTimingSummaryText } from '../EventTimingSummaryText';
import { EventTimingBadge } from '../EventTimingBadge';
import { softInternet } from '../../../utils/__tests__/fixtures/softInternet';
import { dateOnlyActivity } from '../../../utils/__tests__/fixtures/dateOnlyActivity';
import { useViewedEventTimeStatus } from '../../../hooks/useVisitingHoursView';
import { Text } from 'react-native';
jest.mock('../../../store/mapStore',()=>({useMapStore:(selector:any)=>selector({filterCriteria:{eventFilters:mockFilter,specialFilters:mockFilter}})}));
let mockFilter = {timeFilter:'today',upcomingDate:undefined as any};

beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-21T15:00:00Z'));mockFilter={timeFilter:'today',upcomingDate:undefined};});
afterEach(()=>jest.useRealTimers());
it('renders the real shared components for selected Sunday, closed Monday and a range',()=>{
  const e=softInternet();let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<EventTimingSummaryText event={e}/>);});
  expect(JSON.stringify(c!.toJSON())).toContain('10:00 AM – 5:00 PM');
  mockFilter={timeFilter:'upcoming',upcomingDate:{kind:'custom',startDate:'2026-10-25',endDate:'2026-10-25'}};
  act(()=>c!.update(<EventTimingSummaryText event={{...e}}/>));
  expect(JSON.stringify(c!.toJSON())).toContain('Oct 25');expect(JSON.stringify(c!.toJSON())).toContain('1:00 PM – 5:00 PM');
  mockFilter={timeFilter:'upcoming',upcomingDate:{kind:'custom',startDate:'2026-10-26',endDate:'2026-10-26'}};
  act(()=>c!.update(<EventTimingSummaryText event={{...e}}/>));expect(JSON.stringify(c!.toJSON())).toContain('Closed');
  mockFilter={timeFilter:'upcoming',upcomingDate:undefined};act(()=>c!.update(<EventTimingSummaryText event={{...e}}/>));
  expect(JSON.stringify(c!.toJSON())).toContain('Hours vary by day');act(()=>c!.unmount());
});
it('shows a visiting-hours information badge while retaining ordinary unknown-time badges',()=>{
  let c:renderer.ReactTestRenderer;act(()=>{c=renderer.create(<EventTimingBadge event={softInternet()}/>);});
  expect(JSON.stringify(c!.toJSON())).toContain('VISITING');expect(JSON.stringify(c!.toJSON())).not.toContain('TIMES');
  act(()=>c!.update(<EventTimingBadge event={dateOnlyActivity()}/>));expect(JSON.stringify(c!.toJSON())).toContain('TIMES');act(()=>c!.unmount());
});
it.each([{kind:'next7'},{kind:'custom',startDate:'2026-10-25',endDate:'2026-10-31'}])('does not mark a future-only selected window Now while today is open: %j',upcomingDate=>{
  const e=softInternet();mockFilter={timeFilter:'upcoming',upcomingDate};
  const Status=()=> <Text>{useViewedEventTimeStatus(e)}</Text>;let c:renderer.ReactTestRenderer;
  act(()=>{c=renderer.create(<Status/>);});expect(JSON.stringify(c!.toJSON())).toContain('future');
  mockFilter={timeFilter:'today',upcomingDate:undefined};act(()=>c!.update(<Status/>));
  // A fresh render is explicit because this mocked store has no real subscription.
  act(()=>c!.unmount());act(()=>{c=renderer.create(<Status/>);});expect(JSON.stringify(c!.toJSON())).toContain('now');act(()=>c!.unmount());
});
