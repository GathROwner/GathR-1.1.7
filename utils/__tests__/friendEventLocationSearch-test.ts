import {
  mergeLocationSuggestions,
  normalizeLocationSearchText,
  rankGathrVenueSuggestions,
} from '../friendEventLocationSearch';

const venues = [
  {
    venueId: 'fb_100064116963888',
    name: "Hunter's Ale House",
    address: '185 Kent St, Charlottetown, PE C1A 1P1',
  },
  {
    venueId: 'venue-hall',
    name: 'Harbour Hall',
    address: '10 Water Street, Charlottetown, PE',
  },
];

describe('friend event unified location search', () => {
  it('matches apostrophe-free typing to a known GathR venue', () => {
    expect(normalizeLocationSearchText("Hunter's")).toBe('hunters');
    expect(rankGathrVenueSuggestions(venues, 'hunters')).toEqual([{
      id: 'gathr:fb_100064116963888',
      source: 'gathr',
      venueId: 'fb_100064116963888',
      mapboxId: '',
      primaryText: "Hunter's Ale House",
      secondaryText: '185 Kent St, Charlottetown, PE C1A 1P1',
      fullAddress: '185 Kent St, Charlottetown, PE C1A 1P1',
      featureType: 'gathr_venue',
    }]);
  });

  it('searches known venue addresses as part of the same field', () => {
    expect(rankGathrVenueSuggestions(venues, '185 kent')[0]?.venueId)
      .toBe('fb_100064116963888');
  });

  it('keeps GathR venues first and removes the duplicate Mapbox POI', () => {
    const known = rankGathrVenueSuggestions(venues, 'hunters');
    const merged = mergeLocationSuggestions(known, [
      {
        id: 'mapbox:hunters',
        mapboxId: 'hunters',
        primaryText: "Hunter's Ale House",
        secondaryText: '185 Kent St, Charlottetown, Canada',
        fullAddress: '185 Kent St, Charlottetown, Canada',
        featureType: 'poi',
      },
      {
        id: 'mapbox:hunter-river',
        mapboxId: 'hunter-river',
        primaryText: 'Hunter River',
        secondaryText: 'Prince Edward Island, Canada',
        fullAddress: 'Hunter River, Prince Edward Island, Canada',
        featureType: 'place',
      },
    ]);
    expect(merged.map((suggestion) => suggestion.primaryText)).toEqual([
      "Hunter's Ale House",
      'Hunter River',
    ]);
    expect(merged[0]?.source).toBe('gathr');
  });
});
