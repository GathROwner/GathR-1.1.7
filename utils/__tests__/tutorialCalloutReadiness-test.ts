import {
  isTutorialCalloutPresentationReady,
  shouldRepublishTutorialCalloutReadiness,
} from '../tutorialCalloutReadiness';

describe('tutorial callout readiness', () => {
  const currentKey = 'cluster-a::venue-a|venue-b';

  it('requires matching layout and presentation tokens for the visible callout', () => {
    expect(isTutorialCalloutPresentationReady({
      hasSelectedCalloutRendered: true,
      layoutReadyKey: currentKey,
      presentationReadyKey: currentKey,
      renderedPresentationKey: currentKey,
    })).toBe(true);
  });

  it('does not accept retained tokens from a prior callout mount', () => {
    expect(isTutorialCalloutPresentationReady({
      hasSelectedCalloutRendered: true,
      layoutReadyKey: 'cluster-old::venue-old',
      presentationReadyKey: 'cluster-old::venue-old',
      renderedPresentationKey: currentKey,
    })).toBe(false);
  });

  it('re-publishes a retained settled child after each parent reset epoch', () => {
    let lastPublishedEpoch: number | null = null;
    let readiness: {
      hasSelectedCalloutRendered: boolean;
      layoutReadyKey: string | null;
      presentationReadyKey: string | null;
      renderedPresentationKey: string;
    } = {
      hasSelectedCalloutRendered: true,
      layoutReadyKey: null,
      presentationReadyKey: null,
      renderedPresentationKey: currentKey,
    };

    const publishForEpoch = (readinessEpoch: number) => {
      const shouldPublish = shouldRepublishTutorialCalloutReadiness({
        hasPositiveLayout: true,
        presentationSettled: true,
        readinessEpoch,
        lastPublishedEpoch,
      });
      if (shouldPublish) {
        lastPublishedEpoch = readinessEpoch;
        readiness = {
          ...readiness,
          layoutReadyKey: currentKey,
          presentationReadyKey: currentKey,
        };
      }
      return shouldPublish;
    };

    expect(publishForEpoch(1)).toBe(true);
    expect(isTutorialCalloutPresentationReady(readiness)).toBe(true);

    readiness = { ...readiness, layoutReadyKey: null, presentationReadyKey: null };
    expect(isTutorialCalloutPresentationReady(readiness)).toBe(false);
    expect(publishForEpoch(2)).toBe(true);
    expect(isTutorialCalloutPresentationReady(readiness)).toBe(true);
    expect(publishForEpoch(2)).toBe(false);
  });

  it('does not publish an epoch before both real child signals are ready', () => {
    expect(shouldRepublishTutorialCalloutReadiness({
      hasPositiveLayout: true,
      presentationSettled: false,
      readinessEpoch: 2,
      lastPublishedEpoch: 1,
    })).toBe(false);
  });
});
