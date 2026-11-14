import type { Event } from '../types/events';

/** The two unfiltered, disjoint feed partitions, including items beyond pagination. */
export const getListFilterCandidates = (
  viewportEvents: Event[],
  outsideViewportEvents: Event[],
  type: 'event' | 'special',
  savedOnly: boolean | undefined,
  savedIds: readonly string[],
): Event[] => {
  const saved = savedOnly ? new Set(savedIds) : null;
  return [...viewportEvents, ...outsideViewportEvents].filter(event =>
    event.type === type && (!saved || saved.has(String(event.id))));
};
