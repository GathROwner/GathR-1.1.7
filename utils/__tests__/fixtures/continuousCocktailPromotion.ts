import type { Event } from '../../../types/events';
import { createLegacyTimingContract } from '../../eventTiming';

/** Actual source descriptions and legacy clocks; IDs do not determine presentation. */
export function continuousCocktailPromotion(slaymaker = false, overrides: Partial<Event> = {}): Event {
  const event = {
    id: 'cocktail_fixture', type: 'special', category: 'Drink Specials',
    title: slaymaker ? 'Deep Roots Wicked Spirits Cocktail Mix-Off (Slaymaker & Nichols entry)' : 'Deep Roots Distillery Wicked Spirits Cocktail Mix-Off',
    description: slaymaker ? 'Our entry into the Deep Roots Wicked Spirits Cocktail Mix-Off. October 1-31.'
      : 'The Deep Roots Distillery Wicked Spirits Cocktail Mix-Off kicks off TODAY until October 31st!',
    venue: slaymaker ? 'Slaymaker & Nichols' : 'The Local Pub and Oyster Bar',
    venueId: 'cocktail_venue', address: '', latitude: 0, longitude: 0,
    startDate: '2026-10-01', endDate: '2026-10-31', startTime: slaymaker ? '11:30' : '10:00', endTime: slaymaker ? '21:00' : '23:59',
    isRecurring: false, isRecurringInstance: false, recurringPattern: 'none', ...overrides,
  } as Event;
  event.timing = overrides.timing || createLegacyTimingContract(event, { endStatus: 'unknown', estimateConfidence: 'low' });
  return event;
}
