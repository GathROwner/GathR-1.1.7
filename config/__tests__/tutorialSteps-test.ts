import {
  LEGACY_TUTORIAL_STEP_IDS,
  TUTORIAL_STEPS,
  getCompletedIdsForStep,
} from '../tutorialSteps';

describe('tutorial v3 sequence', () => {
  it('has one welcome and seventeen user-visible states', () => {
    expect(TUTORIAL_STEPS).toHaveLength(17);
    expect(TUTORIAL_STEPS.filter((step) => step.id === 'welcome')).toHaveLength(1);
    expect(TUTORIAL_STEPS[0].id).toBe('welcome');
    expect(TUTORIAL_STEPS.at(-1)?.id).toBe('completion');
  });

  it('retains every v1 step id through primary or consolidated completion ids', () => {
    const represented = new Set(TUTORIAL_STEPS.flatMap(getCompletedIdsForStep));
    expect([...LEGACY_TUTORIAL_STEP_IDS].every((id) => represented.has(id))).toBe(true);
  });

  it('teaches the live map filters once, immediately after the cluster lessons', () => {
    expect(TUTORIAL_STEPS[4].id).toBe('filter-pills');
    expect(TUTORIAL_STEPS.filter((step) => step.id === 'filter-pills')).toHaveLength(1);
    expect(TUTORIAL_STEPS.some((step) => step.id === 'map-controls')).toBe(false);
  });

  it('places the listing-details explanation above the highlighted card', () => {
    const detailsStep = TUTORIAL_STEPS.find((step) => step.id === 'callout-event-details');
    expect(detailsStep?.sheetPosition).toBe('top');
  });

  it('keeps each live list-filter lesson attached to its own measured target', () => {
    expect(TUTORIAL_STEPS.find((step) => step.id === 'events-filters')?.target)
      .toBe('events-filters');
    expect(TUTORIAL_STEPS.find((step) => step.id === 'specials-filters')?.target)
      .toBe('specials-filters');
  });
});
