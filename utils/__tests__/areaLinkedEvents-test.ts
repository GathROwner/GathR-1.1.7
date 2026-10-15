import type { Event, EventAreaLocation } from '../../types/events';
import { buildAreaLocationFeatureCollection, getAreaLocationGroups, getAreaLocationGroupForFeature, getAreaLocationGroupForPress, getAvailableAreaLinkedEvents } from '../areaEvent';

const location: EventAreaLocation = { id: 'tivoli', label: 'Tivoli', venueId: 'tivoli', certainty: 'confirmed',
  coordinates: { latitude: 46.2367313, longitude: -63.1275468 }, linkedEventIds: ['first', 'second', 'missing', 'moved', 'cancelled', 'ended', 'outside', 'recurrence'] };
const umbrella = { id: 'umbrella', startDate: '2026-10-14', endDate: '2026-10-18', startTime: '', endTime: '',
  locationScope: 'area', areaData: { version: 1, status: 'partial', locations: [location] } } as Event;
const child = (id: string, extra: Partial<Event> = {}): Event => ({
  id: `fb_${id}`, type: 'event', venueId: 'tivoli', title: id, startDate: '2026-10-16', endDate: '2026-10-16',
  startTime: '19:00', endTime: '21:00', ...extra,
} as Event);
const now = new Date('2026-10-15T15:00:00Z');

describe('explicit festival membership', () => {
  it('groups identical positions without moving or hiding their distinct venues', () => {
    const trail = { ...location, id: 'trailside', label: 'Trailside', venueId: 'trail', linkedEventIds: ['concert'] };
    const dali = { ...location, id: 'dali', label: 'Dali', venueId: 'dali', linkedEventIds: [] };
    const event = { ...umbrella, areaData: { ...umbrella.areaData!, locations: [location, trail, dali] } };
    expect(getAreaLocationGroups(event)[0].locations.map((point) => point.venueId)).toEqual(['tivoli', 'trail', 'dali']);
    expect(buildAreaLocationFeatureCollection(event).features).toHaveLength(1);
    expect(buildAreaLocationFeatureCollection(event).features[0]).toMatchObject({
      properties: { locationCount: 3, label: '3 venues' }, geometry: { type: 'Point', coordinates: [-63.1275468, 46.2367313] },
    });
    expect(JSON.stringify(buildAreaLocationFeatureCollection(event))).not.toContain('LineString');
    const pin = buildAreaLocationFeatureCollection(event).features[0];
    expect(getAreaLocationGroupForFeature(event, pin.properties.id)?.locations).toEqual([location, trail, dali]);
    expect(getAreaLocationGroupForFeature(event, 'unrelated')).toBeNull();
    const neighbour = { ...location, id: 'comedy', coordinates: { latitude: 46.2374623, longitude: -63.1259052 } };
    const nearby = { ...event, areaData: { ...event.areaData, locations: [...event.areaData.locations, neighbour] } };
    expect(getAreaLocationGroupForPress(nearby, { features: [{ properties: { id: neighbour.id } }, { properties: pin.properties }],
      coordinates: { latitude: 46.236731, longitude: -63.127547 } })?.locations).toHaveLength(3);
  });
  it('shows future festival dates and fresh canonical clocks, excluding unrelated/moved/cancelled/expired/recurring/out-of-window items', () => {
    const records = [child('second', { startTime: '22:00', endTime: '23:00' }), child('first'), child('unrelated'),
      child('moved', { venueId: 'trailside' }), child('cancelled', { isCancelled: true }),
      child('ended', { startDate: '2026-10-14', endDate: '2026-10-14' }),
      child('outside', { startDate: '2026-10-19', endDate: '2026-10-19' }), child('recurrence', { isRecurringInstance: true })];
    expect(getAvailableAreaLinkedEvents(umbrella, location, records, now).map((event) => [event.id, event.startTime]))
      .toEqual([['fb_first', '19:00'], ['fb_second', '22:00']]);
    expect(getAvailableAreaLinkedEvents(umbrella, { ...location, linkedEventIds: [] }, records, now)).toEqual([]);
    expect(getAvailableAreaLinkedEvents(umbrella, { ...location, certainty: 'approximate' }, records, now)).toEqual([]);
  });
  it('requires exact canonical IDs and dates even when titles match', () => {
    expect(getAvailableAreaLinkedEvents(umbrella, location, [child('substitute', { title: 'first' }),
      child('first', { startDate: '' }), child('second', { status: 'canceled' })], now)).toEqual([]);
  });
});
