// This key versions the persisted *normalized* Event shape, not only the API
// request. Bump it whenever new backend fields must be remapped so an OTA does
// not keep restoring incompatible Event objects from the prior app runtime.
export const EVENTS_MINIMAL = ['events-minimal', 'city-level-v4-ticket-links'] as const;
