import { parseMinimumAppVersionPolicy, requiredAppVersion, shouldCheckMinimumAppVersion } from '../minimumAppVersion';
import disabledPolicy from '../../config/minimum-versions.disabled.json';

const active = () => ({
  ...disabledPolicy,
  ios: { ...disabledPolicy.ios, enabled: true, storeReleaseAvailable: true },
  android: { ...disabledPolicy.android, enabled: true, storeReleaseAvailable: true },
});
const evaluate = (value: unknown, version: string | null = '1.1.10', os: string | number = '18.0') =>
  requiredAppVersion(parseMinimumAppVersionPolicy(value), 'ios', version, os);

test('the committed starting policy cannot lock either platform out', () => {
  const policy = parseMinimumAppVersionPolicy(disabledPolicy);
  expect(requiredAppVersion(policy, 'ios', '1.0.0', '18')).toBeNull();
  expect(requiredAppVersion(policy, 'android', '1.0.0', 35)).toBeNull();
});

test.each(['1.1.9', '1.1.10', '1.0.99'])('requires an older native app %s', (version) => {
  expect(evaluate(active(), version)).toBe('1.1.20');
});
test.each(['1.1.20', '1.1.21', '1.2.0', '2.0.0'])('allows current or newer native app %s', (version) => {
  expect(evaluate(active(), version)).toBeNull();
});
test.each([null, '', '1.1', '1.1.20-beta', '1.1.20.1', '1.1.NaN', ' 1.1.10'])('unknown/malformed installed version %s fails open', (version) => {
  expect(evaluate(active(), version)).toBeNull();
});
test.each([null, [], {}, { schemaVersion: 2 }, { schemaVersion: 1, ios: { enabled: 'true' } }])('invalid policy fails open: %j', (policy) => {
  expect(evaluate(policy)).toBeNull();
});

test('requires both explicit enforcement and release-availability flags', () => {
  for (const field of ['enabled', 'storeReleaseAvailable'] as const) {
    const policy = active();
    policy.ios[field] = false;
    expect(evaluate(policy)).toBeNull();
  }
});
test('platforms are independent, including invalid sibling data', () => {
  const policy = parseMinimumAppVersionPolicy({ ...active(), ios: { enabled: 'true' } });
  expect(requiredAppVersion(policy, 'ios', '1.1.10', '18')).toBeNull();
  expect(requiredAppVersion(policy, 'android', '1.1.10', 35)).toBe('1.1.20');
});
test('excludes devices below the store build OS requirements', () => {
  const policy = parseMinimumAppVersionPolicy(active());
  expect(requiredAppVersion(policy, 'ios', '1.1.10', '15.0.2')).toBeNull();
  expect(requiredAppVersion(policy, 'ios', '1.1.10', '15.1')).toBe('1.1.20');
  expect(requiredAppVersion(policy, 'android', '1.1.10', 23)).toBeNull();
  expect(requiredAppVersion(policy, 'android', '1.1.10', 24)).toBe('1.1.20');
  expect(requiredAppVersion(policy, 'android', '1.1.10', '35')).toBeNull();
  expect(requiredAppVersion(policy, 'ios', '1.1.10', 'unknown')).toBeNull();
});
test.each(['1.1', 'latest', '1.1.20-beta', '99999999999999999999.1.1'])('rejects invalid minimum %s', (minimumVersion) => {
  const policy = active();
  policy.ios.minimumVersion = minimumVersion;
  expect(evaluate(policy)).toBeNull();
});
test('only native Production checks the live policy', () => {
  expect(shouldCheckMinimumAppVersion('production', 'ios', false)).toBe(true);
  expect(shouldCheckMinimumAppVersion('production', 'android', false)).toBe(true);
  expect(shouldCheckMinimumAppVersion('production', 'ios', true)).toBe(false);
  expect(shouldCheckMinimumAppVersion('production', 'web', false)).toBe(false);
  for (const channel of [null, 'preview', 'development', 'unassigned']) {
    expect(shouldCheckMinimumAppVersion(channel, 'ios', false)).toBe(false);
  }
});
