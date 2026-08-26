import { TutorialStep } from '../types/tutorial';

/**
 * Tutorial v2 has one user-visible welcome and ten focused teaching states.
 * `legacyStepIds` preserves v1 analytics/completion compatibility when old
 * cards are consolidated into one coherent lesson.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GathR',
    content: 'Find local events, timely specials, and places worth gathering.',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next',
  },
  {
    id: 'cluster-click',
    title: 'See what is nearby',
    content: 'Markers group nearby events and specials.',
    target: 'closest-cluster',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'interaction',
  },
  {
    id: 'callout-venue-selector',
    legacyStepIds: ['callout-tabs', 'callout-event-details'],
    title: 'Explore a place',
    content: 'Switch places, browse Events or Specials, and tap a card for details.',
    target: 'venue-selector',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'filter-pills',
    legacyStepIds: ['clear-filters'],
    title: 'Make the map yours',
    content: 'Tap a filter to narrow the map. Use its arrow for more choices, and Show All to reset.',
    target: 'filter-pills',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'events-tab',
    title: 'Browse every event',
    content: 'Tap Events for a scrollable view of what is happening around you.',
    target: 'events-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'events-list-explanation',
    legacyStepIds: ['events-filters'],
    title: 'Your Events feed',
    content: 'Results follow your location and interests. The filters at the top work together.',
    target: 'events-list-area',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'specials-tab',
    title: 'Find food and drink specials',
    content: 'Tap Specials to see nearby offers in one place.',
    target: 'specials-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'specials-list-explanation',
    legacyStepIds: ['specials-filters'],
    title: 'Your Specials feed',
    content: 'Browse current offers and combine filters when you have something specific in mind.',
    target: 'specials-list-area',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'profile-facebook',
    title: 'Help GathR find more',
    content: 'Open Profile to suggest a local venue or Facebook page we should watch.',
    target: 'profile-button',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'interaction',
  },
  {
    id: 'facebook-submission',
    title: 'Suggest a Facebook page',
    content: 'Use this row whenever a favourite local place is missing. We will keep an eye on its public posts.',
    target: 'facebook-submission-component',
    placement: 'top',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'completion',
    title: 'You are ready to GathR',
    content: 'Explore what is happening now, save your favourites, and make plans nearby.',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next',
  },
];

export const LEGACY_TUTORIAL_STEP_IDS = [
  'welcome',
  'cluster-click',
  'callout-venue-selector',
  'callout-tabs',
  'callout-event-details',
  'filter-pills',
  'clear-filters',
  'events-tab',
  'events-list-explanation',
  'events-filters',
  'specials-tab',
  'specials-list-explanation',
  'specials-filters',
  'profile-facebook',
  'facebook-submission',
  'completion',
] as const;

export const getTutorialStepById = (stepId: string): TutorialStep | undefined =>
  TUTORIAL_STEPS.find((step) => step.id === stepId);

export const getAllStepIds = (): string[] => TUTORIAL_STEPS.map((step) => step.id);

export const getCompletedIdsForStep = (step: TutorialStep): string[] => [
  step.id,
  ...(step.legacyStepIds ?? []),
];

export const hasSubSteps = (stepId: string): boolean => {
  const step = getTutorialStepById(stepId);
  return Boolean(step?.multiStep && step.subSteps?.length);
};

export const TUTORIAL_CONFIG = {
  FADE_DURATION: 180,
  SPOTLIGHT_PULSE_DURATION: 1200,
  TOOLTIP_SLIDE_DURATION: 220,
  SPOTLIGHT_COLOR: '#2497F3',
  OVERLAY_COLOR: 'rgba(4, 20, 35, 0.80)',
  PRIMARY_COLOR: '#2497F3',
  TOOLTIP_PADDING: 20,
  SPOTLIGHT_BORDER_WIDTH: 3,
  TOOLTIP_MAX_WIDTH: 360,
  TOOLTIP_BORDER_RADIUS: 22,
  AUTO_TRIGGER_DELAY: 250,
  CACHE_EXPIRE_TIME: 24 * 60 * 60 * 1000,
  TARGET_TIMEOUT_MS: 2200,
  ROUTE_TIMEOUT_MS: 4000,
  MAP_CAMERA_TIMEOUT_MS: 1600,
  MAP_PROJECTION_TIMEOUT_MS: 900,
} as const;
