/** Canonical API IDs and app IDs differ only by one fb_ prefix. */
export const toFirestoreEventId = (eventId: string | number): string => {
  const raw = String(eventId ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('fb_') ? raw.slice(3) : raw;
};
export const toAppEventId = (eventId: string | number): string => {
  const raw = String(eventId ?? '').trim();
  if (!raw) return '';
  return raw.startsWith('fb_') ? raw : `fb_${raw}`;
};
export const areEventIdsEquivalent = (a: string | number | null | undefined, b: string | number | null | undefined): boolean =>
  a != null && b != null && toFirestoreEventId(a) === toFirestoreEventId(b);
