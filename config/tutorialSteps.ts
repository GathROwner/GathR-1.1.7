import { TutorialStep } from '../types/tutorial';

/**
 * Tutorial v3 uses authentic, static examples for the volatile map cluster
 * and callout lessons, then returns to real measured controls for the rest of
 * the app. Each screen teaches one visual idea so people can move at their own
 * pace without the map changing underneath them.
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
    id: 'map-overview',
    title: 'Everything nearby, in one view',
    content: 'GathR puts nearby events and specials on one map, so you can see what is happening at a glance.',
    staticScene: 'map-overview',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'cluster-click',
    title: 'Clusters keep the map readable',
    content: 'A tree marks a nearby area with several places to explore.',
    staticScene: 'cluster-tree',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'cluster-summary',
    title: 'Read a cluster at a glance',
    content: 'The tree, numbers, and colour cues show what is nearby before you open it.',
    staticScene: 'cluster-summary',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'map-controls',
    title: 'Keep your plans in view',
    content: 'The controls across the top make it easy to browse dates, events, and specials without losing your place.',
    staticScene: 'map-controls',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'callout-venue-selector',
    title: 'Choose a nearby place',
    content: 'Opening a cluster reveals the local places inside it. Swipe the venue rail to move between them.',
    staticScene: 'callout-venues',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'callout-tabs',
    title: 'Switch the kind of plan',
    content: 'Use Events and Specials to move between what is happening and what is being offered at that place.',
    staticScene: 'callout-tabs',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'callout-event-details',
    title: 'The important details stay together',
    content: 'Each card gives you the listing, place, timing, and useful actions without sending you back to social feeds.',
    staticScene: 'callout-card',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'filter-pills',
    title: 'Make the map yours',
    content: 'Use filters to narrow what you see by time and category. When a filter is active, Show All brings everything nearby back into view.',
    legacyStepIds: ['clear-filters'],
    target: 'filter-pills',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'events-tab',
    title: 'Browse every event',
    content: 'Tap Events to browse local plans without scrolling social feeds.',
    target: 'events-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'events-list-explanation',
    title: 'Your event feed, sorted for real life',
    content: 'Each card puts the time, place, and key details in one quick scan.',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'events-filters',
    title: 'Focus the event feed',
    content: 'Use the filters at the top whenever you want to narrow the list around a date or interest.',
    target: 'events-filters',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
  },
  {
    id: 'specials-tab',
    title: 'Find food and drink specials',
    content: 'Tap Specials to see nearby happy hours and offers in one place.',
    target: 'specials-tab',
    placement: 'top',
    sheetPosition: 'top',
    action: 'interaction',
  },
  {
    id: 'specials-list-explanation',
    title: 'See specials without the scrolling',
    content: 'Nearby food and drink offers are collected in one place, with the useful details already visible.',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next',
  },
  {
    id: 'specials-filters',
    title: 'Find the right offer faster',
    content: 'Filter by time or category when you know what kind of plan you are looking for.',
    target: 'specials-filters',
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'next',
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
