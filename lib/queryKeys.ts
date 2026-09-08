// This key versions the persisted *normalized* Event shape, not only the API
// request. Bump it whenever new backend fields must be remapped so an OTA does
// not keep restoring incompatible Event objects from the prior app runtime.
export const EVENTS_MINIMAL = ['events-minimal', 'original-source-v3'] as const;

// Detail results are persisted independently from the minimal feed and need
// their own schema version for the same reason.
export const EVENT_DETAILS_SCHEMA_VERSION = 'original-source-v2';
