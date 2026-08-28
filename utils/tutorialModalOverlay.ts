import type { ReactNode } from 'react';

export type TutorialModalOverlayRenderer = () => ReactNode;

const MODAL_HOSTED_STEP_IDS = new Set([
  'callout-venue-selector',
  'facebook-submission',
  'completion',
]);

let renderer: TutorialModalOverlayRenderer | null = null;
const listeners = new Set<() => void>();

export const getTutorialModalOverlay = () => renderer;

export const subscribeTutorialModalOverlay = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setTutorialModalOverlay = (next: TutorialModalOverlayRenderer | null) => {
  renderer = next;
  listeners.forEach((listener) => listener());
};

export const isTutorialModalHostedStep = (stepId?: string | null): boolean =>
  Boolean(stepId && MODAL_HOSTED_STEP_IDS.has(stepId));

export const shouldUseProfileTutorialOverlayHost = ({
  isActive,
  pathname,
  stepId,
}: {
  isActive: boolean;
  pathname: string;
  stepId?: string | null;
}): boolean => Boolean(
  isActive
    && (pathname === '/profile' || pathname.endsWith('/profile'))
    && isTutorialModalHostedStep(stepId),
);
