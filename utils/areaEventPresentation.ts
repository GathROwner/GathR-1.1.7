import type { Event, EventAreaLocation } from '../types/events';
import { getAreaLocations } from './areaEvent';

type AreaPresentationInput = Partial<Pick<Event, 'title' | 'description' | 'locationScope' | 'areaData'>>;
export type AreaEventPresentation = 'programme' | 'hunt' | 'location';
const displayEntities: Record<string, string> = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>' };

/** Display-only cleanup; do not rewrite source records or infer new instructions. */
export const cleanAreaPresentationText = (value?: string): string => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|quot|apos|nbsp|lt|gt);/gi, (_, entity: string) =>
    displayEntities[entity.toLowerCase()] || ' ')
  .replace(/&#(?:39|x27);/gi, "'")
  .replace(/\s+/g, ' ').trim();

/**
 * Explicit membership always wins, including temporarily unavailable children.
 * A zero result alone never establishes that an umbrella is one activity.
 */
export function getAreaEventPresentation(event: AreaPresentationInput): AreaEventPresentation {
  if (event.locationScope !== 'area') return 'location';
  if (event.areaData?.locations?.some(location => Array.isArray(location.linkedEventIds)
    && location.linkedEventIds.some(id => typeof id === 'string' && id.trim()))) {
    return 'programme';
  }
  const title = cleanAreaPresentationText(event.title);
  const instructions = cleanAreaPresentationText([event.description, event.areaData?.description].filter(Boolean).join(' '));
  const text = `${title} ${instructions}`;
  const huntIdentity = /\b(?:selfie|photo|scavenger|treasure|skeleton)\s+hunt\b/i.test(title);
  const participants = /\bparticipating(?:\s+[\p{L}'’-]+){0,3}\s+(?:businesses|shops|locations|venues|stops|stores|cafes|cafés|libraries)\b/iu.test(instructions)
    || /\b(?:at|visit)\s+each\s+(?:participating\s+)?(?:location|shop|business|stop|venue)\b/i.test(instructions);
  const action = /\b(?:take|snap|get)\s+(?:(?:a|your|the)\s+)?(?:selfie|photo|picture)s?\b/i.test(instructions)
    || /\b(?:find|collect|solve|follow)\s+(?:(?:the|your)\s+)?(?:clues|riddles|puzzles)\b/i.test(instructions);
  const separateProgramme = /\b(?:separate|scheduled|individual)\s+(?:events|performances|shows|screenings|activities|sessions)\b/i.test(text)
    || /\b(?:programme|program|schedule)\s+(?:of|includes|features)\b/i.test(text)
    || /\b(?:shows|screenings|performances|sessions)\s+(?:at|begin|start)\b/i.test(text);
  const negatedHunt = /\b(?:not|no)\s+(?:a\s+)?(?:(?:selfie|photo|scavenger|treasure|skeleton)\s+)?hunt\b/i.test(text);
  if (huntIdentity && participants && action && !separateProgramme && !negatedHunt
    && getAreaLocations(event as Event).length > 1) return 'hunt';
  return separateProgramme || /\b(?:festival|fest|programme|program)\b/i.test(text) ? 'programme' : 'location';
}

export function getAreaParticipationInstructions(event: AreaPresentationInput, location: EventAreaLocation): string[] {
  return [...new Set([event.description, event.areaData?.description, location.description]
    .map(cleanAreaPresentationText).filter(Boolean))]
    .filter((text, index, all) => !all.slice(0, index).some(prior => prior.toLowerCase().includes(text.toLowerCase())));
}

/** Narrow presentation override only; clocks, calendar and eligibility stay untouched. */
export function getAreaParticipationTimingLabel(event: AreaPresentationInput, timeText: string): string | null {
  return getAreaEventPresentation(event) === 'hunt' && ['See individual event times', 'Time not provided'].includes(timeText)
    ? 'Check location opening hours' : null;
}
