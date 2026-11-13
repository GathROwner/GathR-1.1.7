/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const profile = eas.build.production;
const required = {
  EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED: 'true',
  EXPO_PUBLIC_SOCIAL_RELEASE_TWO_ENABLED: 'true',
  EXPO_PUBLIC_USE_FIREBASE_EMULATORS: 'false',
  EXPO_PUBLIC_FIREBASE_TARGET: 'production',
  EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED: 'false',
  EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG: 'false',
  GOOGLE_SERVICES_JSON: './google-services.json',
};
assert.equal(profile.distribution, 'store');
assert.equal(profile.channel, 'production');
assert.equal(profile.environment, 'production');
assert.equal(profile.autoIncrement, true);
assert.equal(profile.android.buildType, 'app-bundle');
assert.equal(eas.cli.appVersionSource, 'remote');
for (const [name, value] of Object.entries(required)) {
  assert.equal(profile.env[name], value, `Profile mismatch: ${name}`);
  assert.equal(process.env[name], value, `Process environment mismatch: ${name}`);
}
assert.ok(!process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN);
const config = require(path.join(root, 'app.config.js'))({ config: {} });
assert.equal(config.version, '1.1.20');
assert.equal(config.runtimeVersion.policy, 'appVersion');
assert.equal(config.android.package, 'com.craigb.gathr');
assert.equal(config.android.googleServicesFile, './google-services.json');
assert.ok(config.extra.mapboxAccessToken);
assert.equal(config.extra.eas.projectId, '87fd0c8f-0007-49fb-a057-2f4e81afe1db');
const plugins = config.plugins.map(item => Array.isArray(item) ? item[0] : item);
for (const plugin of ['@react-native-firebase/app-check',
  '@react-native-community/datetimepicker', 'expo-share-intent', 'expo-notifications']) {
  assert.ok(plugins.includes(plugin), `Missing native plugin: ${plugin}`);
}
const google = JSON.parse(fs.readFileSync(path.join(root, config.android.googleServicesFile), 'utf8'));
assert.equal(google.project_info.project_id, 'gathr-m1');
assert.ok(google.client.some(client =>
  client.client_info.android_client_info.package_name === 'com.craigb.gathr' &&
  client.client_info.mobilesdk_app_id === '1:234071683975:android:988d506511718e89869922'));
const submit = eas.submit['android-production-draft'].android;
assert.equal(submit.track, 'production');
assert.equal(submit.releaseStatus, 'draft');
assert.equal(submit.changesNotSentForReview, true);
console.log('Android Production config verified: 1.1.20 AAB, remote increment, Production Firebase, Social, native plugins, Mapbox; store submission held as draft.');
