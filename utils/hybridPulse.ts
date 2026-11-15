import type { Cluster } from '../types/events';

// Keep the native map halo and the view-rendered preview in sync.
export const HYBRID_PULSE = {
  durationMs: 1000,
  pauseMs: 250,
  resetMs: 40,
  opacity: 0.8,
  scale: 1.8,
} as const;

export const hybridTimingColor = (status: Cluster['timeStatus']) =>
  status === 'now' ? '#188038' : status === 'today' ? '#C99700' : '#9AA0A6';
