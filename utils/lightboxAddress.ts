const CANADIAN_POSTAL_CODE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVWXYZ][ -]?\d[ABCEGHJ-NPRSTVWXYZ]\d\b/gi;
const COUNTRY = /^(?:Canada|United States(?: of America)?|USA|U\.?S\.?A?\.?)$/i;
const COUNTRY_SUFFIX = /\s+(?:Canada|United States(?: of America)?|USA|U\.?S\.?A?\.?)\.?$/i;
const PROVINCE = /^(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|PEI|QC|SK|YT|Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Nova Scotia|Northwest Territories|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon)$/i;
const PROVINCE_SUFFIX = /\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|PEI|QC|SK|YT|Prince Edward Island)$/i;

/** Presentation only: preserve street/unit/city; never change the Maps destination. */
export function formatLightboxAddress(address?: string | null): string {
  const parts = String(address || '')
    .replace(CANADIAN_POSTAL_CODE, '')
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  // Imported addresses can combine street/city or province/country into one
  // segment. Strip recognized trailing labels without requiring three parts.
  if (parts.length > 1) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(COUNTRY_SUFFIX, '').replace(/[.;]+$/, '').trim();
  }
  // Quebec can also be the city, including after a unit and street segment.
  // Prefer keeping that ambiguous label to accidentally removing the city.
  while (parts.length > 1) {
    const lastPart = parts[parts.length - 1];
    if (!COUNTRY.test(lastPart) && !(PROVINCE.test(lastPart) && !/^Quebec$/i.test(lastPart))) break;
    parts.pop();
  }
  if (parts.length > 1) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(PROVINCE_SUFFIX, '').trim();
  }
  return parts.filter(Boolean).join(', ');
}
