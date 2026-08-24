import { create } from 'zustand';

interface TutorialUiState {
  isVisible: boolean;
  setVisible: (isVisible: boolean) => void;
}

export const useTutorialUiStore = create<TutorialUiState>((set) => ({
  isVisible: false,
  setVisible: (isVisible) => set({ isVisible }),
}));
