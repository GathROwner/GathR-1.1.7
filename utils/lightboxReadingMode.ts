export interface LightboxReadingState {
  reading: boolean;
  scrolling: boolean;
  startedReading: boolean;
  startY: number;
}

export type LightboxReadingAction =
  | { type: 'begin'; y: number }
  | { type: 'scroll'; y: number; canScroll: boolean }
  | { type: 'momentum' }
  | { type: 'end' }
  | { type: 'restore' };

export const initialLightboxReadingState: LightboxReadingState = {
  reading: false, scrolling: false, startedReading: false, startY: 0,
};

/** Ignore layout-driven offsets; only deliberate scrolling changes the mode. */
export function reduceLightboxReadingMode(
  state: LightboxReadingState,
  action: LightboxReadingAction,
): LightboxReadingState {
  switch (action.type) {
    case 'begin':
      return { ...state, scrolling: true, startedReading: state.reading, startY: Math.max(0, action.y) };
    case 'momentum':
      return { ...state, scrolling: true };
    case 'end':
      return { ...state, scrolling: false };
    case 'restore':
      return initialLightboxReadingState;
    case 'scroll':
      if (!state.scrolling) return state;
      if (!state.reading && action.canScroll && action.y >= 16) {
        return { ...state, reading: true };
      }
      // A collapse can itself clamp the scroll offset to zero. Restore only
      // when a later gesture deliberately returns from farther down the copy.
      if (state.reading && state.startedReading && state.startY > 8 && action.y <= 4) {
        return initialLightboxReadingState;
      }
      return state;
  }
}
