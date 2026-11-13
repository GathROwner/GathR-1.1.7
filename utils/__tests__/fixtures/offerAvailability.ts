import type { Event } from '../../../types/events';
import type { EventTiming } from '../../../types/events';
import fixture from './offerAvailability.json';
import { dateOnlyActivity } from './dateOnlyActivity';

/** Exact synthetic producer checkpoint; never live offer evidence. */
export const offerAvailabilityFixture = (): Event => dateOnlyActivity({
  type: 'special', id: 'qa_offer_availability', title: fixture.eventFields.name, category: fixture.eventFields.category,
  venueId: fixture.binding.venueId, sourceUniqueId: fixture.binding.sourceOfferId,
  sourceUniqueIds: [...fixture.eventFields.sourceUniqueIds],
  offerAvailabilityBinding: {...fixture.eventFields.offerAvailabilityBinding},
  startDate: fixture.binding.startDate, endDate: fixture.binding.endDate,
  description: fixture.eventFields.description,
  timing: JSON.parse(JSON.stringify(fixture.timing)) as EventTiming,
});
export const offerFixtureNow = new Date(fixture.now);
