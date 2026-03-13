import type { Event } from '../types/events';
import type { FilterCriteria } from '../types/filter';
import { doesEventMatchInterestCarouselBaseFilters } from './interestCarouselFilterUtils';

type HotGroupSelection = {
  label: string;
  originalInterests: string[];
  event: Event;
  engagementScore: number;
};

type BuildHotInterestCarouselParams = {
  onScreenEvents: Event[];
  filterCriteria: FilterCriteria;
  userInterests: string[];
};

const normalize = (value: string) => value.trim().toLowerCase();

// Keep this mapping aligned with InterestFilterPills so merged labels match the user's existing pill set.
export const getHotInterestShortLabel = (interest: string): string => {
  const lower = normalize(interest);
  if (lower.includes('music')) return 'Music';
  if (lower.includes('trivia')) return 'Trivia';
  if (lower.includes('comedy')) return 'Laugh';
  if (lower.includes('workshop') || lower.includes('class')) return 'Learn';
  if (lower.includes('religious') || lower.includes('church')) return 'Pray';
  if (lower.includes('sport')) return 'Sports';
  if (lower.includes('family')) return 'Family';
  if (lower.includes('gathering') || lower.includes('parties') || lower.includes('party')) return 'Party';
  if (lower.includes('cinema') || lower.includes('movie') || lower.includes('film')) return 'Cinema';
  if (lower.includes('happy hour') || lower.includes('drink')) return 'Drink';
  if (lower.includes('food') || lower.includes('wing')) return 'Food';
  return interest;
};

const parseCount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Prefer the backend-computed engagementScore when present; otherwise fall back to a raw metric sum.
export const getEventHotEngagementScore = (event: Event): number => {
  if (event.engagementScore !== null && event.engagementScore !== undefined) {
    const direct = Number(event.engagementScore);
    if (Number.isFinite(direct)) {
      return direct;
    }
  }

  return (
    parseCount(event.likes) +
    parseCount(event.shares) +
    parseCount(event.interested) +
    parseCount(event.comments) +
    parseCount(event.topReactionsCount) +
    parseCount(event.usersResponded)
  );
};

const compareHotCandidates = (a: HotGroupSelection, b: HotGroupSelection): number => {
  if (b.engagementScore !== a.engagementScore) {
    return b.engagementScore - a.engagementScore;
  }

  const aRelevance = Number((a.event as any).relevanceScore || 0);
  const bRelevance = Number((b.event as any).relevanceScore || 0);
  if (bRelevance !== aRelevance) {
    return bRelevance - aRelevance;
  }

  const aTitle = a.event.title || '';
  const bTitle = b.event.title || '';
  if (aTitle !== bTitle) {
    return aTitle.localeCompare(bTitle);
  }

  return String(a.event.id).localeCompare(String(b.event.id));
};

const buildInterestGroups = (userInterests: string[]) => {
  const groupsByLabel = new Map<string, { label: string; originalInterests: string[] }>();

  userInterests.forEach((interest) => {
    const label = getHotInterestShortLabel(interest);
    const existing = groupsByLabel.get(label);
    if (existing) {
      existing.originalInterests.push(interest);
      return;
    }

    groupsByLabel.set(label, {
      label,
      originalInterests: [interest],
    });
  });

  return Array.from(groupsByLabel.values());
};

export const buildHotInterestCarouselSelections = ({
  onScreenEvents,
  filterCriteria,
  userInterests,
}: BuildHotInterestCarouselParams): HotGroupSelection[] => {
  if (!userInterests || userInterests.length === 0) {
    return [];
  }

  const groups = buildInterestGroups(userInterests);
  if (groups.length === 0) {
    return [];
  }

  const labelByInterestKey = new Map<string, string>();
  const groupByLabel = new Map<string, { label: string; originalInterests: string[] }>();

  groups.forEach((group) => {
    groupByLabel.set(group.label, group);
    group.originalInterests.forEach((interest) => {
      labelByInterestKey.set(normalize(interest), group.label);
    });
  });

  const winners = new Map<string, HotGroupSelection>();

  onScreenEvents.forEach((event) => {
    if (!doesEventMatchInterestCarouselBaseFilters(event, filterCriteria)) {
      return;
    }

    const categoryKey = normalize(event.category || '');
    const groupLabel = labelByInterestKey.get(categoryKey);
    if (!groupLabel) {
      return;
    }

    const group = groupByLabel.get(groupLabel);
    if (!group) {
      return;
    }

    const candidate: HotGroupSelection = {
      label: group.label,
      originalInterests: group.originalInterests,
      event,
      engagementScore: getEventHotEngagementScore(event),
    };

    const currentWinner = winners.get(groupLabel);
    if (!currentWinner || compareHotCandidates(candidate, currentWinner) < 0) {
      winners.set(groupLabel, candidate);
    }
  });

  return Array.from(winners.values()).sort(compareHotCandidates);
};

export const buildHotInterestCarouselEvents = (params: BuildHotInterestCarouselParams): Event[] => {
  return buildHotInterestCarouselSelections(params).map((selection) => selection.event);
};
