/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const profile = eas.build.production;
const requiredEnvironment = {
  EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED: 'true',
  EXPO_PUBLIC_SOCIAL_RELEASE_TWO_ENABLED: 'true',
  EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'false',
  EXPO_PUBLIC_FIREBASE_TARGET: 'production',
  EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED: 'false',
  EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG: 'false',
  GOOGLE_SERVICES_PLIST: './GoogleService-Info.plist',
  GOOGLE_SERVICES_JSON: './google-services.json',
};

assert.equal(profile.distribution, 'store');
assert.equal(profile.channel, 'production');
assert.equal(profile.environment, 'production');
assert.equal(profile.autoIncrement, true);
assert.equal(eas.cli.appVersionSource, 'remote');
for (const [name, value] of Object.entries(requiredEnvironment)) {
  assert.equal(profile.env[name], value, `Production profile mismatch: ${name}`);
  assert.equal(process.env[name], value, `Build/export environment mismatch: ${name}`);
}
assert.ok(!process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN,
  'A Preview App Check debug token must not enter Production');

const config = require(path.join(root, 'app.config.js'))({ config: {} });
assert.equal(config.version, '1.1.20');
assert.equal(config.runtimeVersion.policy, 'appVersion');
assert.equal(config.ios.bundleIdentifier, 'com.craigb.gathr');
assert.equal(config.ios.googleServicesFile, './GoogleService-Info.plist');
assert.equal(config.ios.entitlements['com.apple.developer.devicecheck.appattest-environment'],
  'production');
assert.equal(config.ios.entitlements['aps-environment'], 'production');
assert.ok(config.extra.mapboxAccessToken, 'Missing Mapbox runtime token');
assert.equal(config.extra.eas.projectId, '87fd0c8f-0007-49fb-a057-2f4e81afe1db');
const pluginNames = config.plugins.map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
for (const name of ['@react-native-community/datetimepicker',
  '@react-native-firebase/app-check', 'expo-share-intent', 'expo-notifications']) {
  assert.ok(pluginNames.includes(name), `Missing native plugin: ${name}`);
}
const plist = fs.readFileSync(path.join(root, config.ios.googleServicesFile), 'utf8');
const plistValue = name => plist.match(new RegExp(`<key>${name}</key>\\s*<string>([^<]+)</string>`))?.[1];
assert.equal(plistValue('PROJECT_ID'), 'gathr-m1');
assert.equal(plistValue('BUNDLE_ID'), 'com.craigb.gathr');
assert.equal(plistValue('GOOGLE_APP_ID'), '1:234071683975:ios:3ba054e711eb33b1869922');
console.log('iOS Production configuration verified: 1.1.20, remote auto-increment, Production Firebase, both Social flags, App Attest production, native plugins and Mapbox.');
