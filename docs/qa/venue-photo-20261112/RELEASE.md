# iOS Production venue-photo size — November 12, 2026

Published a 50% diameter increase for GathR's rich venue-photo circles. Category labels and overview/legacy marker dimensions retain their sizes. The release includes all accepted ad and readiness-popup changes.

- Previous source: 81d591a156625138087c077f03d775eba5c47523; group 88122556-dd82-4165-a44d-0115d68c3eeb.
- Released source: e02d09092bb1a7b864e40017299680878df3a7d9.
- Platform: ios; channel/branch: production; runtime: 1.1.20.
- Update: 01a1d182-6709-76a4-9f2c-e21cfdb0e925; group: ac08b180-0e27-4a9b-88a3-f3ad8feb1264.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/ac08b180-0e27-4a9b-88a3-f3ad8feb1264).

Independent update:view and update:list matched the exact source, runtime, platform, group/update IDs and newest iOS Production status. See [verification receipt](IOS_PRODUCTION_RELEASE.json).

Validation: actual-component RNW renders with fixture venue logos across nine before/after cases; 61 focused tests; TypeScript; Expo lint (0 errors / 227 existing warnings); Production Firebase/App Check/social guard; Mapbox preflight; clean iOS export and clear-cache publish. Both bundles contain 2,558 modules; EAS reports 112 iOS assets.

Phone adoption, native Mapbox collision behavior on a busy map and native taps remain unverified. Profile should show Production / runtime 1.1.20 / OTA 01a1d182 after close/reopen, twice if needed. No native/config/dependency changes, backend writes, Android/Preview publication or device/map manipulation occurred. Raw checks, render harness, guards, exports, publish logs and EAS readbacks are under ignored artifacts/venue-photo-20261112/.
