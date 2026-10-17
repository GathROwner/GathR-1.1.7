import type { EventAreaData } from '../types/events';

/** Detail and minimal API projections share the same additive area field. */
export const readEventAreaData = (record: { areaData?: EventAreaData | null; metadata?: { areaData?: EventAreaData | null } }): EventAreaData | null =>
  record.areaData ?? record.metadata?.areaData ?? null;

export const isExplicitTrue = (value: unknown): boolean =>
  value === true || value === 1 || (typeof value === 'string' && ['true', 'yes', '1'].includes(value.trim().toLowerCase()));
