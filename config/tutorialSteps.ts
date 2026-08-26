import { TutorialStep } from '../types/tutorial';

/**
 * Tutorial v2 has one user-visible welcome and six focused teaching states.
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
    id: 'filter-pills',
    legacyStepIds: [
      'cluster-click',
      'callout-venue-selector',
      'callout-tabs',
      'callout-event-details',
      'clear-filters',
    ],
    title: 'Make the map yours',
    content: 'Use filters to narrow what you see. Tap Show All whenever you want to reset.',
    target: 'filter-pills',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'events-tab',
    legacyStepIds: ['events-list-explanation', 'events-filters'],
    title: 'Browse every event',
    content: 'Tap Events to browse local plans without scrolling social feeds.',
    target: 'events-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'specials-tab',
    legacyStepIds: ['specials-list-explanation', 'specials-filters'],
    title: 'Find food and drink specials',
    content: 'Tap Specials to see nearby happy hours and offers in one place.',
    target: 'specials-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'profile-facebook',
    title: 'Keep GathR growing',
    content: 'Open Profile to suggest a local Facebook page we should watch.',
    target: 'profile-button',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'interaction',
  },
  {
    id: 'facebook-submission',
    title: 'Suggest a Facebook page',
    content: 'Recommend a local place and GathR will look for its public events and specials.',
    target: 'facebook-submission-component',
    placement: 'top',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'completion',
    title: 'You are ready to GathR',
    content: 'Find plans faster, spend less time scrolling, and make getting together easier.',
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
  OVERLAY_COLOR: 'rgba(3, 17, 30, 0.86)',
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
