import { EVENT_CATEGORIES, SPECIAL_CATEGORIES } from '../constants/eventCategories';

const SUPPORTED_INTERESTS = new Set<string>([
  ...EVENT_CATEGORIES,
  ...SPECIAL_CATEGORIES,
]);

export const normalizeUserInterests = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = new Set<string>();

  value.forEach((interest) => {
    if (typeof interest === 'string' && SUPPORTED_INTERESTS.has(interest)) {
      normalized.add(interest);
    }
  });

  return [...normalized];
};
