import type { Cluster, Venue } from '../../types/events';
import {
  appendTutorialClusterTarget,
  doesTutorialCalloutMatchAnchor,
  getTutorialClusterAnchorVenueKey,
  getTutorialClusterBindingSignature,
  isTutorialClusterCalloutTarget,
  isTutorialClusterBindingCurrent,
  resolveTutorialClusterTarget,
} from '../tutorialClusterTarget';

const venue = (locationKey: string, latitude = 46.24, longitude = -63.13): Venue => ({
  latitude,
  locationKey,
  longitude,
} as Venue);
const cluster = (id: string, venueKeys: string[]): Cluster => ({
  eventCount: 1,
  id,
  specialCount: 0,
  venues: venueKeys.map((venueKey) => venue(venueKey)),
} as Cluster);

describe('tutorial cluster target', () => {
  it('keeps a stable venue anchor when the map regroups into a new cluster ID', () => {
    const initial = cluster('a|b', ['a', 'b']);
    const regrouped = cluster('a|c', ['a', 'c']);

    expect(getTutorialClusterAnchorVenueKey(initial)).toBe('a');
    expect(resolveTutorialClusterTarget(
      [cluster('b', ['b']), regrouped],
      'a',
      initial.id,
    )).toBe(regrouped);
  });

  it('selects the same anchor when venue order changes', () => {
    const far = venue('a', 46.1, -63.3);
    const middle = venue('b', 46.24, -63.13);
    const near = venue('c', 46.25, -63.12);
    const forward = { ...cluster('a|b|c', []), venues: [far, middle, near] } as Cluster;
    const reverse = { ...forward, venues: [near, middle, far] } as Cluster;
    expect(getTutorialClusterAnchorVenueKey(forward)).toBe('b');
    expect(getTutorialClusterAnchorVenueKey(reverse)).toBe('b');
  });

  it('falls back to the current matching ID when there is no venue anchor', () => {
    const current = cluster('current', ['c']);
    expect(resolveTutorialClusterTarget([current], null, 'current')).toBe(current);
  });

  it('does not return a stale requested cluster that is absent from current state', () => {
    expect(resolveTutorialClusterTarget([cluster('other', ['b'])], 'a', 'old')).toBeNull();
  });

  it('does not accept a matching old ID after its anchor venue disappeared', () => {
    expect(resolveTutorialClusterTarget([cluster('old', ['b'])], 'a', 'old')).toBeNull();
  });

  it('excludes single-venue city markers that open a lightbox instead of a callout', () => {
    const city = {
      ...cluster('city', ['city']),
      containsCityLevelEvent: true,
    } as Cluster;
    expect(isTutorialClusterCalloutTarget(city)).toBe(false);
    expect(isTutorialClusterCalloutTarget({
      ...city,
      id: 'city|venue',
      venues: [venue('city'), venue('venue')],
    } as Cluster)).toBe(true);
  });

  it('drops an anchor that regroups into a lightbox-only city marker', () => {
    const lightboxOnly = {
      ...cluster('city', ['a']),
      containsCityLevelEvent: true,
    } as Cluster;
    expect(resolveTutorialClusterTarget([lightboxOnly], 'a', 'previous')).toBeNull();
  });

  it('adds the live target after a staged or interest-filtered render list', () => {
    const staged = Array.from({ length: 12 }, (_, index) =>
      cluster(`visible-${index}`, [`venue-${index}`])
    );
    const target = cluster('target', ['target-venue']);

    expect(appendTutorialClusterTarget(staged, target)).toHaveLength(13);
    expect(appendTutorialClusterTarget(staged, target)[12]).toBe(target);
    expect(appendTutorialClusterTarget([...staged, target], target)).toHaveLength(13);
  });

  it('matches an opened callout only through the stable tutorial anchor', () => {
    expect(doesTutorialCalloutMatchAnchor([venue('other'), venue('anchor')], 'anchor'))
      .toBe(true);
    expect(doesTutorialCalloutMatchAnchor([venue('other')], 'anchor')).toBe(false);
    expect(doesTutorialCalloutMatchAnchor([venue('anchor')], null)).toBe(false);
  });

  it('changes the binding signature when a same-ID marker moves or changes shape', () => {
    const initial = {
      ...cluster('same', ['anchor']),
      categories: ['Music'],
      clusterType: 'single',
      interestLevel: 'medium',
      isBroadcasting: false,
      timeStatus: 'today',
    } as Cluster;
    const moved = {
      ...initial,
      venues: [venue('anchor', 46.25, -63.11)],
    } as Cluster;
    const reshaped = {
      ...initial,
      categories: ['Food', 'Music'],
      eventCount: 10,
    } as Cluster;

    expect(getTutorialClusterBindingSignature(moved))
      .not.toBe(getTutorialClusterBindingSignature(initial));
    expect(getTutorialClusterBindingSignature(reshaped))
      .not.toBe(getTutorialClusterBindingSignature(initial));
  });

  it('keeps the binding signature deterministic when venue/category order changes', () => {
    const forward = {
      ...cluster('same', []),
      categories: ['Music', 'Food'],
      clusterType: 'multi',
      interestLevel: 'medium',
      isBroadcasting: false,
      timeStatus: 'today',
      venues: [venue('a'), venue('b')],
    } as Cluster;
    const reverse = {
      ...forward,
      categories: ['Food', 'Music'],
      venues: [venue('b'), venue('a')],
    } as Cluster;

    expect(getTutorialClusterBindingSignature(reverse))
      .toBe(getTutorialClusterBindingSignature(forward));
  });

  it('rejects a stale A binding after an A to B to A revision cycle', () => {
    expect(isTutorialClusterBindingCurrent(
      { clusterId: 'a', revision: 1 },
      { clusterId: 'a', revision: 3 },
    )).toBe(false);
    expect(isTutorialClusterBindingCurrent(
      { clusterId: 'a', revision: 3 },
      { clusterId: 'a', revision: 3 },
    )).toBe(true);
  });
});
