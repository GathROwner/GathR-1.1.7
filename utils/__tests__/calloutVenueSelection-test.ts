import { prioritizeCalloutVenues } from '../calloutVenueSelection';

const hunters = { locationKey: 'venue:hunters', name: "Hunter's Ale House" };
const cinema = { locationKey: 'venue:city-cinema', name: 'City Cinema' };
const studio = { locationKey: 'venue:studio', name: 'Buenos Island Studio' };

describe('prioritizeCalloutVenues', () => {
  it('lets an explicitly requested venue override the relevance result', () => {
    const venues = [hunters, cinema, studio];

    expect(prioritizeCalloutVenues(venues, 0, cinema.locationKey)).toEqual([
      cinema,
      hunters,
      studio,
    ]);
    expect(venues).toEqual([hunters, cinema, studio]);
  });

  it('preserves relevance ordering when there is no explicit venue request', () => {
    expect(prioritizeCalloutVenues([hunters, cinema, studio], 2, null)).toEqual([
      studio,
      hunters,
      cinema,
    ]);
  });

  it('falls back to relevance when the requested venue is not in the callout', () => {
    expect(prioritizeCalloutVenues([hunters, cinema, studio], 1, 'venue:missing')).toEqual([
      cinema,
      hunters,
      studio,
    ]);
  });
});
