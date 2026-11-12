# iOS Production release — November 12, 2026

Published the accepted centered, larger split-ad icon with equal 8-point gaps below Sponsored and above the title. Craig explicitly selected Production. No Preview or Android update was published.

- Live baseline: dfd642de168760835bfaf328d07b7c11bb270858, group 833b1d1f-fb02-4358-91c5-5d8b6e1e8bc5.
- Released source: cc6aee1700960797441de0f51079f6e31b472d32, a clean descendant containing the prior check-in and date-specific offer-hours changes.
- Channel/branch: production; platform: ios; runtime: 1.1.20.
- Update: 01a1d0f7-f8ab-75f2-8a6e-899aac28d55c; group: 72edf28f-adb4-4821-94d1-5b24d508c5f3.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/72edf28f-adb4-4821-94d1-5b24d508c5f3).

Both update:view and update:list matched the expected commit, runtime, platform, update and newest iOS group. See [verified receipt](IOS_PRODUCTION_RELEASE.json). Device adoption and native iOS ad rendering remain unverified. On the installed Production app, close/reopen twice if needed and check the Profile footer for `OTA 01a1d0f7`.

Validation: actual-component RNW screenshot review; 28 focused tests; TypeScript; Expo lint (0 errors / 227 existing warnings); production Firebase/App Check/social guard; Mapbox preflight; clean export and publish (2,557 modules). Local Expo listed 108 assets; EAS reported 112 iOS assets. No native or runtime/config changes, backend edits or map interactions. Production social flags were enabled; Firebase and native plist target gathr-m1; App Check was enabled with debug and emulators disabled.

Raw guards, checks, export/publish logs and EAS readbacks are in ignored artifacts/ios-production-release/. Unused Preview assembly was unregistered. Windows could not fully delete it because of long paths; automatic approval review blocked the subsequent deletion. Its remaining files were safely preserved under node_modules/.cache/gathr-unused-preview-20261112, and primary dependency integrity was checked. The final TypeScript check and both iOS exports passed after relocation.
