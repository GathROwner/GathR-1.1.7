import type { Event } from '../types/events';

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
