const createAppConfig = require('../app.config.js');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(
  process.env.EXPO_PUBLIC_FIREBASE_TARGET === 'production',
  'The iOS Preview account-continuity OTA must target Production Firebase.'
);
invariant(
  process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DISABLED === 'true',
  'The hybrid Preview OTA must skip the staging-native App Check token.'
);
invariant(
  process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG === 'false',
  'The hybrid Preview OTA must not initialize the debug App Check provider.'
);
invariant(
  process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'false',
  'The iOS Preview OTA must not use local Firebase emulators.'
);
invariant(
  process.env.EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED === 'true' &&
    process.env.EXPO_PUBLIC_SOCIAL_RELEASE_TWO_ENABLED === 'true',
  'Both social feature flags must be enabled for the Release 2 Preview OTA.'
);
invariant(
  process.env.GOOGLE_SERVICES_PLIST === './GoogleService-Info.staging.plist',
  'The OTA manifest must continue to describe the installed staging-native iOS shell.'
);

const config = createAppConfig({ config: {} });
invariant(config.version === '1.1.10', 'Unexpected app version for the iOS Preview OTA.');
invariant(
  config.runtimeVersion?.policy === 'appVersion',
  'The OTA must retain the app-version runtime policy.'
);
invariant(
  config.ios?.googleServicesFile === './GoogleService-Info.staging.plist',
  'Resolved iOS native Firebase metadata no longer matches build 78.'
);

console.log(
  'iOS Preview OTA auth config verified: runtime 1.1.10 / Production account continuity / staging native shell / App Check compatibility override'
);
