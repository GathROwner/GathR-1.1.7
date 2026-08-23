export const EVENT_CATEGORIES = [
  'Live Music',
  'Trivia Night',
  'Comedy',
  'Workshops & Classes',
  'Religious',
  'Sports',
  'Family Friendly',
  'Gatherings & Parties',
  'Cinema',
] as const;

export const SPECIAL_CATEGORIES = [
  'Happy Hour',
  'Food Special',
  'Drink Special',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type SpecialCategory = (typeof SPECIAL_CATEGORIES)[number];
export type GathrCategory = EventCategory | SpecialCategory;

