# SDK 54 Modernization Notes

Updated on April 21, 2026 for the upgrade workspace at `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`.

## Why this workspace exists

The production app was on Expo SDK 52 / React Native 0.76, which is not a viable long-term answer for Google Play's 16 KB page size requirement on Android 15+.

This workspace moves the app onto a current Expo / React Native stack without touching the original `GathR` folder.

## Final version matrix in this workspace

- Expo: `54.0.33`
- React Native: `0.81.5`
- React / React DOM: `19.1.0`
- Android compile SDK: `36`
- Android target SDK: `36`
- Android build tools: `36.0.0`
- iOS deployment target: `15.1`
- `@rnmapbox/maps`: `10.3.0`
- Mapbox native SDK used by `@rnmapbox/maps`: `11.18.2`
- `react-native-google-mobile-ads`: `16.3.3`
- `@react-native-firebase/app`: `23.8.8`
- `@react-native-firebase/analytics`: `23.8.8`
- `firebase` web SDK: `12.12.1`
- New Architecture:
  - Android: `false`
  - iOS: `true`

## Native toolchain expectations

The generated Android project now reflects the modern React Native 0.81 toolchain:

- AGP: `8.11.0`
- Kotlin: `2.1.20`
- NDK: `27.1.12297006`

This is inferred from `node_modules/react-native/gradle/libs.versions.toml` after the upgrade.

## Key compatibility decisions

### 1. Kotlin 1.9.25 was intentionally removed

The old SDK 52 workspace was pinned to Kotlin `1.9.25` to keep a fragile Mapbox + AdMob combination alive.

That pin is not carried forward. The upgraded stack now follows React Native 0.81's Kotlin `2.1.20` toolchain instead of fighting it.

### 2. Mapbox is no longer on the old v10 native pin

The previous workaround pinned `@rnmapbox/maps` to a v10-era JavaScript package and separately overrode the Android native SDK to Mapbox `10.16.2`.

That is not the future-safe path for 16 KB support.

`@rnmapbox/maps` `10.3.0` now expects Mapbox v11 on Android. Its Gradle file automatically selects:

- `com.mapbox.maps:android-ndk27:<version>` when `targetSdkVersion >= 35`
- `com.mapbox.maps:android:<version>` otherwise

Because this workspace targets SDK 36, it is on the NDK 27 Mapbox artifact path required for 16 KB-ready Android builds.

### 3. AdMob moved off the old Kotlin-constrained line

The old project had to stay near `react-native-google-mobile-ads` `14.8.0` because of the Kotlin 1.9.25 compromise.

This workspace updates to `16.3.3`, which matches the current Expo-native-config-plugin path and no longer depends on the older Kotlin setup.

### 4. Firebase stays on static frameworks for iOS

`expo-build-properties` still sets `ios.useFrameworks: "static"`.

That is intentional. React Native Firebase's Expo guidance still requires static frameworks on iOS. `react-native-google-mobile-ads` also documents the same Expo static-frameworks setup for Firebase combinations.

### 5. Architecture is split temporarily by platform

This workspace currently uses a split configuration:

- Android stays on `newArchEnabled: false`
- iOS sets `newArchEnabled: true`

Reason:

- the app previously had hard Mapbox-related upgrade pain
- SDK 54 is the last Expo SDK that still allows opting out of the New Architecture
- `@rnmapbox/maps` `10.3.0` explicitly rejects the old architecture on iOS
- keeping Android on the old architecture avoids widening the runtime risk until the AdMob path is fully revalidated there

This is a temporary stop, not an endpoint. SDK 55+ will require the New Architecture.

### 6. iOS Firebase pods are force-linked statically

The `expo-build-properties` iOS config now adds:

- `forceStaticLinking: ["RNFBApp", "RNFBAnalytics"]`

This is required because the first iOS preview build under static frameworks + New Architecture failed in Xcode with React Native Firebase non-modular header errors.

Force-linking the Firebase pods statically resolved that build failure on EAS without changing the app code.

### 7. iOS callout presentation uses a static fallback

This workspace also carries an iOS-only workaround in `components/map/EventCallout.tsx`.

Reason:

- the repo already had documented evidence of a preview/store-only iOS map callout presentation bug
- cluster selection state updated correctly, but the bottom sheet could fail to paint while the dismissal overlay still rendered
- the historical handoff in `docs/MAP_CALLOUT_PRODUCTION_BUG_HANDOFF.md` specifically called out the internal `translateY` sheet state machine as a remaining suspect

Current mitigation:

- Android keeps the existing animated bottom-sheet transform path
- iOS uses a static absolute-positioned callout layer instead of relying on the animated `translateY` presentation path

This is intended as a pragmatic stability fix for preview/store builds, not as a final architectural answer.

### 8. Risky unused packages were removed

The direct dependencies on:

- `react-native-reanimated`
- `@shopify/flash-list`

were removed from `package.json`.

In this app they were not used by live routes, and both are explicitly called out by Expo SDK 54 as libraries centered on newer architecture paths. Removing unused direct dependencies lowers native risk in a legacy-architecture workspace.

Related unused template files were also removed:

- `assets/index.tsx`
- `components/HelloWave.tsx`
- `components/ParallaxScrollView.tsx`

### 9. Manifest permissions were tightened

The Android config now blocks these permissions:

- `android.permission.READ_EXTERNAL_STORAGE`
- `android.permission.WRITE_EXTERNAL_STORAGE`
- `android.permission.RECORD_AUDIO`
- `android.permission.SYSTEM_ALERT_WINDOW`

Also, the `expo-image-picker` plugin now sets `microphonePermission: false`, because the app uses photos/camera for profile images and does not appear to need microphone capture.

After regenerating Android, these show up in the manifest only as `tools:node="remove"` entries, which is the expected Expo removal path.

## Validation completed in this workspace

- `npm install`
- `expo prebuild --clean --platform android`
- `tsc --noEmit`
- `eas build --platform android --profile preview`
- `eas build --platform ios --profile preview`

Current result:

- TypeScript is clean
- Android native project regenerates successfully
- Android manifest now contains the intended permission removals
- Android preview EAS build succeeds
- iOS preview EAS build succeeds

## Validation that is still required

These were not completed from this environment:

- Full Android Gradle build
- Runtime testing on an Android 16 KB device or emulator
- Runtime testing on iOS

Why:

- the current environment does not have `JAVA_HOME` configured, so Gradle cannot run here
- local iOS native generation is not available on this Windows environment, so iOS validation depends on EAS Mac builds

## Local build prerequisites

To build this upgraded workspace locally, you will need:

- JDK 17+ with `JAVA_HOME` set
- Android SDK/platforms for API 36 and build tools 36
- a valid Mapbox download token exposed as either:
  - `RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
  - or Gradle property `MAPBOX_DOWNLOADS_TOKEN`
- Expo / EAS authentication for cloud builds

## Recommended next validation steps

1. Run an EAS Android development or preview build from this new workspace.
2. Verify the bundle in Play Console App Bundle Explorer eventually reports 16 KB support.
3. Test map load, clustering, event details, ads, auth, notifications, and calendar flows on Android.
4. Install the iOS preview build and verify Firebase + AdMob + Mapbox together under static frameworks.
5. Plan a follow-up migration to the New Architecture before moving beyond SDK 54.

## Primary references

- Google Play / Android 16 KB requirement:
  - https://developer.android.com/guide/practices/page-sizes
- React Native 0.77 official 16 KB support announcement:
  - https://reactnative.dev/blog/2025/01/21/version-0.77
- Expo SDK 54 changelog:
  - https://expo.dev/changelog/sdk-54
- Expo New Architecture guide:
  - https://docs.expo.dev/guides/new-architecture/
- Expo permissions guide:
  - https://docs.expo.dev/guides/permissions
- Expo image picker config:
  - https://docs.expo.dev/versions/latest/sdk/imagepicker/
- Expo build properties config:
  - https://docs.expo.dev/versions/latest/sdk/build-properties/
- React Native Firebase Expo guidance:
  - https://rnfirebase.io/
- React Native Google Mobile Ads Expo guidance:
  - https://docs.page/invertase/react-native-google-mobile-ads
- Mapbox Android SDK requirements and NDK 27 guidance:
  - https://docs.mapbox.com/android/maps/guides/
