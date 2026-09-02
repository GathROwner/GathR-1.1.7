import type { Event } from '../../types/events';
import { getEventViewportMembership } from '../eventViewport';

const charlottetownViewport = {
  west: -63.2,
  south: 46.18,
  east: -63.05,
  north: 46.3,
};

const bufferedViewport = {
  west: -63.24,
  south: 46.14,
  east: -63.01,
  north: 46.34,
};

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: 'event-1',
  type: 'event',
  latitude: 46.2382,
  longitude: -63.1311,
  ...overrides,
} as Event);

describe('getEventViewportMembership', () => {
  it('keeps a province event discoverable in every PEI viewport without treating its anchor as physical', () => {
    const event = makeEvent({
      locationScope: 'province',
      mapMode: 'none',
      latitude: 46.5107,
      longitude: -63.4168,
    });

    expect(getEventViewportMembership(event, charlottetownViewport, bufferedViewport)).toEqual({
      hasPhysicalCoordinates: false,
      includeInViewport: true,
      includeInClusterSource: true,
      includeOutsideViewport: false,
    });
  });

  it('keeps ordinary venue events partitioned by their coordinates', () => {
    const event = makeEvent({ latitude: 46.3959, longitude: -63.7876 });

    expect(getEventViewportMembership(event, charlottetownViewport, bufferedViewport)).toEqual({
      hasPhysicalCoordinates: true,
      includeInViewport: false,
      includeInClusterSource: false,
      includeOutsideViewport: true,
    });
  });

  it('retains unresolved scoped events only in the outside-viewport feed', () => {
    const event = makeEvent({
      locationScope: 'route',
      latitude: 0,
      longitude: 0,
    });

    expect(getEventViewportMembership(event, charlottetownViewport, bufferedViewport)).toEqual({
      hasPhysicalCoordinates: false,
      includeInViewport: false,
      includeInClusterSource: false,
      includeOutsideViewport: true,
    });
  });
});
