# iOS Production readable venue-photo sizes — November 12, 2026

Published 40/44/48-point low/medium/high rich GathR venue photos, increasing the smallest circles most. Existing iOS selected scaling remains 1.2. This additive revision retains the accepted first size increase, ads and readiness changes.

- Previous live source: e02d09092bb1a7b864e40017299680878df3a7d9; group ac08b180-0e27-4a9b-88a3-f3ad8feb1264.
- Released source: 7272c515e5350bac118fa57dd8dacffea4a3c95f.
- Platform: ios; channel/branch: production; runtime: 1.1.20.
- Update: 01a1d18c-4ebc-7daa-b3f3-83889d76bd36; group: fe24ca69-dfbc-42b0-8262-aef526d49aa1.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/fe24ca69-dfbc-42b0-8262-aef526d49aa1).

Independent update:view and update:list matched the exact source, runtime, platform, group/update IDs and newest iOS Production status. See [verification receipt](IOS_PRODUCTION_RELEASE.json).

Actual-component fixture screenshots and geometry checks passed across nine cases. All 61 focused tests, TypeScript, Expo lint (0 errors / 227 existing warnings), Production Firebase/App Check/social guard, Mapbox preflight, clean iOS export and clear-cache publication passed. Bundle graph: 2,558 modules; final EAS assets: 112 iOS assets.

Phone adoption, dense native-map collision behavior and native taps remain unverified. Profile should show Production / runtime 1.1.20 / OTA 01a1d18c after close/reopen, twice if needed. No native/config/dependency changes, backend writes, Android/Preview publications or device/map manipulation occurred. Raw checks, harness, guards, exports, publication logs and EAS readbacks are in ignored artifacts/venue-photo-minimum-20261112/.
