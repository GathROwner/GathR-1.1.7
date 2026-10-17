import type { Event } from '../../../types/events';

/** Synthetic public-data shape; no live event/venue IDs, credentials or network. */
export const participationArea = (overrides: Partial<Event> = {}): Event => ({
  id: 'qa_hunt_root', type: 'event', title: 'Harbour Skeleton Selfie Hunt', category: 'Gatherings & Parties',
  description: 'Take a selfie with the skeleton displays at participating businesses. Tag the business and the local chamber. Confirm each location’s access hours before visiting.',
  venue: 'Exampletown', venueId: null, address: '', latitude: 46.5, longitude: -63.5,
  startDate: '2040-10-14', endDate: '2040-10-18', startTime: '', endTime: '',
  ticketPrice: '', profileUrl: '', imageUrl: '', SharedPostThumbnail: '', ticketLinkPosts: '', ticketLinkEvents: '',
  locationScope: 'area', mapMode: 'area', areaData: { version: 1, status: 'verified',
    sourceLabel: 'Community organiser’s public post', locations: [
      { id: 'qa_library', label: 'Example Library', venueId: 'qa_library', certainty: 'confirmed',
        coordinates: { latitude: 46.5, longitude: -63.5 }, address: '10 Example Street, Exampletown' },
      { id: 'qa_shop', label: 'Example Shop', venueId: 'qa_shop', certainty: 'confirmed',
        coordinates: { latitude: 46.51, longitude: -63.51 } },
      { id: 'qa_cafe', label: 'Example Café', venueId: 'qa_cafe', certainty: 'confirmed',
        coordinates: { latitude: 46.52, longitude: -63.52 } },
    ] }, ...overrides,
});
