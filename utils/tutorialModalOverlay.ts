import type { ReactNode } from 'react';

export type TutorialModalOverlayRenderer = () => ReactNode;

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
