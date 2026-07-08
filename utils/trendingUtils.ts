import type { Event } from '../types/events';
import type { FilterCriteria } from '../types/filter';
import { doesEventMatchInterestCarouselBaseFilters } from './interestCarouselFilterUtils';
import { getEventHotEngagementScore, getHotInterestShortLabel } from './hotInterestCarouselUtils';
import { combineDateAndTime, getEventTimeStatus } from './dateUtils';

// Target list size, not a cap: every user interest is guaranteed one slot, so
// users with more than 10 interests can produce a longer list.
export const TRENDING_TARGET_COUNT = 10;

type BuildTrendingEventsParams = {
  onScreenEvents: Event[];
  filterCriteria: FilterCriteria;
  userInterests: string[];
};

type TrendingCandidate = {
  event: Event;
  engagementScore: number;
  matchesInterest: boolean;
  groupLabel?: string;
  // Lazily computed: date parsing is only needed when engagement ties (the
  // sparse-engagement case), and this builder re-runs on every viewport change.
  timeStatusRank?: number;
  startMs?: number;
};

const normalize = (value: string) => value.trim().toLowerCase();
const FILTER_PILLS_HIDE_CATEGORY = '__filter_pills_hide__';

const doesEventMatchActiveTrendingFilters = (
  event: Event,
  filterCriteria: FilterCriteria
): boolean => {
  if (!doesEventMatchInterestCarouselBaseFilters(event, filterCriteria)) {
    return false;
  }

  const typeFilters = event.type === 'event'
    ? filterCriteria.eventFilters
    : filterCriteria.specialFilters;
  const category = typeFilters.category;

  if (!category) {
    return true;
  }

  if (normalize(category) === FILTER_PILLS_HIDE_CATEGORY) {
    return false;
  }

  return normalize(event.category || '') === normalize(category);
};

const TIME_STATUS_RANK: Record<'now' | 'today' | 'future', number> = {
  now: 0,
  today: 1,
  future: 2,
};

const getTimeStatusRank = (candidate: TrendingCandidate): number => {
  if (candidate.timeStatusRank === undefined) {
    candidate.timeStatusRank = TIME_STATUS_RANK[getEventTimeStatus(candidate.event)];
  }
  return candidate.timeStatusRank;
};

const getStartMs = (candidate: TrendingCandidate): number => {
  if (candidate.startMs === undefined) {
    const ms = combineDateAndTime(candidate.event.startDate, candidate.event.startTime).getTime();
    candidate.startMs = Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
  }
  return candidate.startMs;
};

// Tiered priority: engagement first, then liveness/relevance fallbacks so
// sparse-engagement areas (new city, tight zoom) still rank sensibly.
export const compareTrendingCandidates = (a: TrendingCandidate, b: TrendingCandidate): number => {
  if (b.engagementScore !== a.engagementScore) {
    return b.engagementScore - a.engagementScore;
  }

  const aTimeRank = getTimeStatusRank(a);
  const bTimeRank = getTimeStatusRank(b);
  if (aTimeRank !== bTimeRank) {
    return aTimeRank - bTimeRank;
  }

  if (a.matchesInterest !== b.matchesInterest) {
    return a.matchesInterest ? -1 : 1;
  }

  const aStartMs = getStartMs(a);
  const bStartMs = getStartMs(b);
  if (aStartMs !== bStartMs) {
    return aStartMs - bStartMs;
  }

  const aRelevance = Number(a.event.relevanceScore || 0);
  const bRelevance = Number(b.event.relevanceScore || 0);
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

export const buildTrendingEvents = ({
  onScreenEvents,
  filterCriteria,
  userInterests,
}: BuildTrendingEventsParams): Event[] => {
  // Map normalized interest -> merged pill label (e.g. "Live Music" and
  // "Music festival" both group under "Music"), matching the interest pills.
  const labelByInterestKey = new Map<string, string>();
  (userInterests || []).forEach((interest) => {
    labelByInterestKey.set(normalize(interest), getHotInterestShortLabel(interest));
  });

  const candidates: TrendingCandidate[] = [];
  onScreenEvents.forEach((event) => {
    if (!doesEventMatchActiveTrendingFilters(event, filterCriteria)) {
      return;
    }

    const groupLabel = labelByInterestKey.get(normalize(event.category || ''));
    candidates.push({
      event,
      engagementScore: getEventHotEngagementScore(event),
      matchesInterest: groupLabel !== undefined,
      groupLabel,
    });
  });

  if (candidates.length === 0) {
    return [];
  }

  const sorted = [...candidates].sort(compareTrendingCandidates);

  // Guaranteed pass: the top candidate of every interest group is included,
  // uncapped, so each of the user's interests is represented when possible.
  const selected: TrendingCandidate[] = [];
  const selectedIds = new Set<string>();
  const seenGroups = new Set<string>();
  sorted.forEach((candidate) => {
    if (!candidate.groupLabel || seenGroups.has(candidate.groupLabel)) {
      return;
    }
    seenGroups.add(candidate.groupLabel);
    selected.push(candidate);
    selectedIds.add(String(candidate.event.id));
  });

  // Fill pass: pad toward the target with the best remaining candidates from
  // any category (same-interest duplicates allowed; zero engagement allowed).
  for (const candidate of sorted) {
    if (selected.length >= TRENDING_TARGET_COUNT) {
      break;
    }
    const id = String(candidate.event.id);
    if (selectedIds.has(id)) {
      continue;
    }
    selected.push(candidate);
    selectedIds.add(id);
  }

  // Final order is pure priority: interest membership guarantees inclusion,
  // not position.
  return selected.sort(compareTrendingCandidates).map((candidate) => candidate.event);
};
