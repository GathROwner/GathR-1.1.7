// Version the persisted normalized Event shape. Bump when new backend fields
// must be remapped so an OTA cannot restore incompatible cached Event objects.
export const EVENTS_MINIMAL = ['events-minimal', 'city-level-v5-family-friendly-score'] as const;
