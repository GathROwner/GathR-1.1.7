import type { Cluster } from '../types/events';

// Keep the native map halo and the view-rendered preview in sync.
export const HYBRID_PULSE = {
  durationMs: 1100,
  pauseMs: 360,
  resetMs: 40,
  opacity: 0.8,
  scale: 2.2,
  trailingDelayMs: 220,
  trailingDurationMs: 750,
  trailingScale: 1.6,
  trailingOpacity: 0.65,
  pairsPerVenue: 2,
} as const;

export const hybridTimingColor = (status: Cluster['timeStatus']) =>
  status === 'now' ? '#188038' : status === 'today' ? '#C99700' : '#9AA0A6';
