import type { Event } from '../../../types/events';
import { createLegacyTimingContract } from '../../eventTiming';

/** Coats for Kids source fields; the identifier is not used for presentation classification. */
export function continuousDonationCampaign(overrides: Partial<Event> = {}): Event {
  const event = {
    id: 'campaign_fixture', type: 'event', title: 'Coats for Kids Campaign', category: 'Gatherings & Parties',
    description: "Donation collection for new or gently used children's outerwear. Donations are accepted October 13-31, 2026, at the drop-off depot at the base of the escalators on the main level.",
    venue: 'The Confederation Court Mall', venueId: 'campaign_venue', address: '', latitude: 0, longitude: 0,
    startDate: '2026-10-13', endDate: '2026-10-31', startTime: '08:00', endTime: '21:00',
    isRecurring: false, recurringPattern: 'none', isRecurringInstance: false, ...overrides,
  } as Event;
  event.timing = overrides.timing || createLegacyTimingContract(event, {
    endStatus: 'unknown', endResolutionMethod: 'category_default', estimateConfidence: 'low',
  });
  return event;
}
