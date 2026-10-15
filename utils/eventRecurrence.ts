/** Firestore also stores Yes/No strings. Preserve truthiness for unknown values
 * so ambiguous flags cannot silently become eligible one-offs. */
export const normalizeRecurrenceFlag = (value: unknown): boolean => {
  if (typeof value === 'string') {
    const flag = value.trim().toLowerCase();
    if (flag === '' || flag === 'no' || flag === 'false' || flag === '0') return false;
  }
  return Boolean(value);
};
