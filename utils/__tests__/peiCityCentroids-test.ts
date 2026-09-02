import { applyCityCentroidFallback, resolvePeiCityCentroid } from '../peiCityCentroids';
import type { Event } from '../../types/events';

const makeEvent = (overrides: Partial<Event>): Event =>
  ({
    id: 'e1',
    type: 'event',
    latitude: 0,
    longitude: 0,
    locationScope: 'city',
    locationLabel: 'Charlottetown, PEI',
    locationCity: 'Charlottetown',
    ...overrides,
  } as Event);

describe('resolvePeiCityCentroid', () => {
  it('resolves known cities by locationCity', () => {
    expect(resolvePeiCityCentroid({ locationCity: 'Charlottetown' })).toEqual({
      latitude: 46.2382,
      longitude: -63.1311,
    });
  });

  it('resolves label forms with province suffixes and punctuation', () => {
    expect(resolvePeiCityCentroid({ locationLabel: 'Kensington, PE' })).not.toBeNull();
    expect(resolvePeiCityCentroid({ locationLabel: 'Summerside, P.E.I.' })).not.toBeNull();
    expect(resolvePeiCityCentroid({ locationLabel: 'Downtown Charlottetown' })).toEqual({
      latitude: 46.2343,
      longitude: -63.1258,
    });
  });

  it('prefers locationLabel for area-scope events', () => {
    expect(resolvePeiCityCentroid({
      locationScope: 'area',
      locationLabel: 'Downtown Charlottetown',
      locationCity: 'Charlottetown',
    })).toEqual({
      latitude: 46.2343,
      longitude: -63.1258,
    });
  });

  it('keeps city-scope Charlottetown on the city centroid', () => {
    expect(resolvePeiCityCentroid({
      locationScope: 'city',
      locationLabel: 'Charlottetown, PEI',
      locationCity: 'Charlottetown',
    })).toEqual({
      latitude: 46.2382,
      longitude: -63.1311,
    });
  });

  it('returns null for unknown places and province-only labels', () => {
    expect(resolvePeiCityCentroid({ locationLabel: 'Borden-Carleton, PE' })).toBeNull();
    expect(resolvePeiCityCentroid({ locationLabel: 'PEI' })).toBeNull();
    expect(resolvePeiCityCentroid({})).toBeNull();
  });

  it('does not invent a physical centroid for province-scope discovery', () => {
    expect(resolvePeiCityCentroid({
      locationScope: 'province', locationLabel: 'Across Prince Edward Island', locationCity: null,
    })).toBeNull();
  });
});

describe('applyCityCentroidFallback', () => {
  it('fills coordinates for a scoped event without them', () => {
    const result = applyCityCentroidFallback(makeEvent({}));
    expect(result.latitude).toBe(46.2382);
    expect(result.longitude).toBe(-63.1311);
  });

  it('fills area-scope fallback coordinates from the specific label', () => {
    const result = applyCityCentroidFallback(makeEvent({
      locationScope: 'area',
      locationLabel: 'Downtown Charlottetown',
      locationCity: 'Charlottetown',
    }));
    expect(result.latitude).toBe(46.2343);
    expect(result.longitude).toBe(-63.1258);
  });

  it('leaves existing coordinates untouched', () => {
    const event = makeEvent({ latitude: 46.3, longitude: -63.2 });
    expect(applyCityCentroidFallback(event)).toBe(event);
  });

  it('ignores non-scoped events', () => {
    const event = makeEvent({ locationScope: 'venue' });
    expect(applyCityCentroidFallback(event)).toBe(event);
    expect(event.latitude).toBe(0);
  });

  it('returns the event unchanged when no centroid matches', () => {
    const event = makeEvent({
      locationLabel: 'Borden-Carleton, PEI',
      locationCity: 'Borden-Carleton',
    });
    expect(applyCityCentroidFallback(event)).toBe(event);
  });

  it('leaves province coverage coordinate-less', () => {
    const event = makeEvent({
      locationScope: 'province',
      locationLabel: 'Across Prince Edward Island',
      locationCity: null,
    });
    expect(applyCityCentroidFallback(event)).toBe(event);
    expect(event.latitude).toBe(0);
    expect(event.longitude).toBe(0);
  });
});
