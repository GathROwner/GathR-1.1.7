import { create } from 'zustand';
import type { InterestCarouselFilter } from '../types/store';

type InterestCarouselUiState = {
  interestCarouselFilter: InterestCarouselFilter | null;
  setInterestCarouselFilter: (filter: InterestCarouselFilter | null) => void;
};

export const useInterestCarouselUiStore = create<InterestCarouselUiState>((set) => ({
  interestCarouselFilter: null,
  setInterestCarouselFilter: (filter) => {
    set({ interestCarouselFilter: filter });
  },
}));
