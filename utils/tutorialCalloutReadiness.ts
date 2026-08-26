interface TutorialCalloutReadiness {
  hasSelectedCalloutRendered: boolean;
  layoutReadyKey: string | null;
  presentationReadyKey: string | null;
  renderedPresentationKey: string;
}

interface TutorialCalloutReadinessPublication {
  hasPositiveLayout: boolean;
  presentationSettled: boolean;
  readinessEpoch: number;
  lastPublishedEpoch: number | null;
}

export const isTutorialCalloutPresentationReady = ({
  hasSelectedCalloutRendered,
  layoutReadyKey,
  presentationReadyKey,
  renderedPresentationKey,
}: TutorialCalloutReadiness): boolean => (
  hasSelectedCalloutRendered &&
  layoutReadyKey === renderedPresentationKey &&
  presentationReadyKey === renderedPresentationKey
);

export const shouldRepublishTutorialCalloutReadiness = ({
  hasPositiveLayout,
  presentationSettled,
  readinessEpoch,
  lastPublishedEpoch,
}: TutorialCalloutReadinessPublication): boolean => (
  hasPositiveLayout &&
  presentationSettled &&
  Number.isInteger(readinessEpoch) &&
  readinessEpoch >= 0 &&
  readinessEpoch !== lastPublishedEpoch
);
