import { Platform } from 'react-native';

const ANDROID_TAB_FOCUS_SIDE_EFFECT_DELAY_MS = 1000;

export const getTabFocusSideEffectDelayMs = () =>
  Platform.OS === 'android' ? ANDROID_TAB_FOCUS_SIDE_EFFECT_DELAY_MS : 0;

export const runAfterTabPaint = (callback: () => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, getTabFocusSideEffectDelayMs());
  });

  return () => {
    cancelAnimationFrame(frame);
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
};
