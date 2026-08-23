import type { Event } from '../../types/events';
import { buildRouteSummaryLightboxSelection } from '../routeEventLightbox';

const makeEvent = (overrides: Partial<Event> = {}): Event =>
  ({
    id: 'route-1',
    type: 'event',
    category: 'Gatherings & Parties',
    title: 'Route Preview: 2026 Gold Cup Parade',
    description: 'Route preview',
    venue: 'Gold Cup Parade Route',
    address: 'Gold Cup Parade Route, Charlottetown, PE',
    startDate: '2026-08-22',
    endDate: '2026-08-22',
    startTime: '10:00',
    endTime: '12:00',
    ticketPrice: '',
    profileUrl: '',
    imageUrl: 'https://example.com/gold-cup.webp',
    SharedPostThumbnail: '',
    latitude: 46.23565,
    longitude: -63.13405,
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    venueId: null,
    locationScope: 'route',
    mapMode: 'route',
    routeData: {
      version: 1,
      status: 'partial',
      stops: [
        {
          id: 'start',
          label: 'Confirmed start',
          coordinates: { longitude: -63.14, latitude: 46.23 },
          kind: 'start',
          certainty: 'confirmed',
        },
      ],
      segments: [],
    },
    ...overrides,
  } as Event);

describe('buildRouteSummaryLightboxSelection', () => {
  it('reopens a drawable route in the event lightbox', () => {
    const event = makeEvent();

    expect(buildRouteSummaryLightboxSelection(event)).toEqual({
      imageUrl: 'https://example.com/gold-cup.webp',
      event,
      source: 'route_summary',
    });
  });

  it('does not open the route lightbox for an ordinary venue event', () => {
    const event = makeEvent({
      locationScope: 'venue',
      mapMode: 'venue',
      routeData: null,
    });

    expect(buildRouteSummaryLightboxSelection(event)).toBeNull();
  });

  it('reopens a multi-location area event without pretending it is a route', () => {
    const event = makeEvent({
      title: 'Charlottetown Busker Festival',
      locationScope: 'area',
      mapMode: 'area',
      routeData: null,
      areaData: {
        version: 1,
        status: 'verified',
        locations: [
          {
            id: 'victoria-row',
            label: 'Victoria Row',
            certainty: 'confirmed',
            coordinates: { longitude: -63.125907, latitude: 46.234294 },
          },
        ],
      },
    });

    expect(buildRouteSummaryLightboxSelection(event)).toEqual({
      imageUrl: 'https://example.com/gold-cup.webp',
      event,
      source: 'route_summary',
    });
  });
});
