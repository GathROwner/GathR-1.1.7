# iOS Production venue-photo balance — November 12, 2026

Published a small trim from 40/44/48 to 36/40/44-point low/medium/high rich GathR venue photos. Existing iOS selected scaling remains 1.2 (maximum selected photo 52.8 points). This revision retains all accepted ad/readiness changes. Current/Standard mode has not gained venue photos; proposed hybrid layouts are separate design previews.

- Previous source: 7272c515e5350bac118fa57dd8dacffea4a3c95f; group fe24ca69-dfbc-42b0-8262-aef526d49aa1.
- Released source: d019fa256c494c45d4fa1e3d0c6e79e1cef6d253.
- Platform: ios; channel/branch: production; runtime: 1.1.20.
- Update: 01a1d19a-7697-7db2-b008-57d5b6bec66e; group: d6acef8e-f5c6-4e67-a45b-8c1926da9da2.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/d6acef8e-f5c6-4e67-a45b-8c1926da9da2).

Independent update:view/update:list confirmed the exact source, runtime, platform, group/update IDs and newest iOS Production status. See [verification receipt](IOS_PRODUCTION_RELEASE.json).

Actual-component fixture screenshots/geometry checks passed across nine cases. All 61 focused tests, TypeScript, Expo lint (0 errors / 227 existing warnings), Production Firebase/App Check/social guard, Mapbox preflight, clean iOS export and clear-cache publication passed. Bundle graph: 2,558 modules; final EAS assets: 112 iOS assets.

Phone adoption, busy native-map collision behavior and native taps remain unverified. Profile should show Production / runtime 1.1.20 / OTA 01a1d19a after close/reopen, twice if needed. No native/config/dependency changes, backend writes, Android/Preview publication or device/map manipulation occurred. Raw evidence is under ignored artifacts/venue-photo-balance-20261112/.
