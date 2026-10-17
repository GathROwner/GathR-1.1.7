import { getAnalyticsEmailDomain } from '../analyticsPrivacy';

describe('getAnalyticsEmailDomain', () => {
  it('returns only the normalized domain for a valid address', () => {
    expect(getAnalyticsEmailDomain(' Person@Example.COM ')).toBe('example.com');
  });

  it.each([
    '',
    'not-an-email',
    'person@example.comAccidentallyPastedSecret!',
    'person@@example.com',
  ])('does not echo invalid or contaminated input: %s', (value) => {
    expect(getAnalyticsEmailDomain(value)).toBe('invalid');
  });
});
