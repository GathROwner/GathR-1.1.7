import { create } from 'zustand';

import { ComponentMeasurement } from '../types/tutorial';

interface TutorialUiState {
  isVisible: boolean;
  currentStepId: string | null;
  facebookSubmissionLayout: ComponentMeasurement | null;
  setVisible: (isVisible: boolean) => void;
  setCurrentStepId: (currentStepId: string | null) => void;
  setFacebookSubmissionLayout: (layout: ComponentMeasurement | null) => void;
}

export const useTutorialUiStore = create<TutorialUiState>((set) => ({
  isVisible: false,
  currentStepId: null,
  facebookSubmissionLayout: null,
  setVisible: (isVisible) => set({ isVisible }),
  setCurrentStepId: (currentStepId) => set({ currentStepId }),
  setFacebookSubmissionLayout: (facebookSubmissionLayout) => set({ facebookSubmissionLayout }),
}));
