import { cleanAreaPresentationText, getAreaEventPresentation, getAreaParticipationInstructions, getAreaParticipationTimingLabel } from '../areaEventPresentation';
import { participationArea } from './fixtures/areaParticipation';
import { formatEventTimingSummary } from '../dateUtils';
import { getEventTimeRangeParts, getEventScheduleState } from '../eventTiming';

describe('conservative area-event presentation', () => {
  it('recognises an instructed multi-stop selfie hunt from public fields', () => {
    expect(getAreaEventPresentation(participationArea())).toBe('hunt');
  });
  it('recognises a different instructed hunt without name or ID rules', () => {
    expect(getAreaEventPresentation(participationArea({ title: 'Downtown Scavenger Hunt',
      description: 'Visit participating shops and collect clues at each stop.' }))).toBe('hunt');
  });
  it('keeps an unlinked real festival as a programme, rather than inferring one activity from zero children', () => {
    expect(getAreaEventPresentation(participationArea({ title: 'Autumn Arts Festival',
      description: 'A community festival at these locations.' }))).toBe('programme');
  });
  it('uses neutral location wording for a generic area', () => {
    expect(getAreaEventPresentation(participationArea({ title: 'Neighbourhood Art Walk',
      description: 'Outdoor artwork around the neighbourhood.' }))).toBe('location');
  });
  it.each([
    ['Skeleton Selfie Hunt', 'An autumn activity.'],
    ['Skeleton Selfie Hunt', 'Take a selfie at the library.'],
    ['Skeleton Selfie Hunt', 'Participating shops are listed below.'],
    ['Skeleton Selfie Hunt', 'This is not a hunt. Take a selfie at participating shops.'],
    ['A talk about skeletons', 'Take a selfie at participating businesses.'],
  ])('does not affirm a hunt from insufficient or conflicting evidence: %s / %s', (title, description) => {
    expect(getAreaEventPresentation(participationArea({ title, description }))).toBe('location');
  });
  it('retains a separately scheduled programme even with hunt wording and participation instructions', () => {
    expect(getAreaEventPresentation(participationArea({ description: participationArea().description
      + ' There are separate scheduled events and performances at 7 PM.' }))).toBe('programme');
  });
  it('lets any explicit links anywhere win, including approximate/missing-venue links and no available records', () => {
    const event = participationArea();
    event.areaData!.locations[2] = { ...event.areaData!.locations[2], certainty: 'approximate', venueId: undefined, linkedEventIds: ['qa_expired_or_missing'] };
    expect(getAreaEventPresentation(event)).toBe('programme');
  });
  it.each(['route', 'venue'] as const)('leaves %s events out of participation presentation', locationScope => {
    expect(getAreaEventPresentation(participationArea({ locationScope }))).toBe('location');
  });
  it('does not reclassify a single-location event as a multi-stop hunt', () => {
    const event = participationArea(); event.areaData!.locations = event.areaData!.locations.slice(0, 1);
    expect(getAreaEventPresentation(event)).toBe('location');
  });
  it('cleans existing source text and retains distinct point instructions without inventing hours', () => {
    const event = participationArea({ description: '<p>Take a selfie &amp; tag the business.</p>' });
    const point = { ...event.areaData!.locations[0], description: 'Find our skeleton inside. Confirm access before visiting.' };
    expect(getAreaParticipationInstructions(event, point)).toEqual(['Take a selfie & tag the business.', point.description]);
    expect(cleanAreaPresentationText('Library&#39;s <b>display</b>')).toBe("Library's display");
    expect(getAreaParticipationInstructions(event, { ...point, description: 'Take a selfie & tag the business.' })).toHaveLength(1);
  });
  it('provides a narrowly scoped unknown-clock hint without changing timing, eligibility or general date utilities', () => {
    const event = participationArea(); const before = JSON.stringify(event);
    const parts = getEventTimeRangeParts(event);
    expect(getAreaParticipationTimingLabel(event, parts.text)).toBe('Check location opening hours');
    expect(formatEventTimingSummary(event)).toBe('Oct 14 – Oct 18 • See individual event times');
    expect(getAreaParticipationTimingLabel(event, '10:00 AM – 11:00 AM')).toBeNull();
    expect(getAreaParticipationTimingLabel({ ...event, title: 'Autumn Festival' }, parts.text)).toBeNull();
    expect(getEventScheduleState(event, new Date('2040-10-16T15:00:00Z')).defaultMapEligible).toBe(true);
    expect(JSON.stringify(event)).toBe(before);
  });
});
