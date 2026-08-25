import { create } from 'zustand';

interface TutorialUiState {
  isVisible: boolean;
  currentStepId: string | null;
  setVisible: (isVisible: boolean) => void;
  setCurrentStepId: (currentStepId: string | null) => void;
}

export const useTutorialUiStore = create<TutorialUiState>((set) => ({
  isVisible: false,
  currentStepId: null,
  setVisible: (isVisible) => set({ isVisible }),
  setCurrentStepId: (currentStepId) => set({ currentStepId }),
}));
