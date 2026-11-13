# iOS Production split-ad fallback — November 12, 2026

Published top-aligned split-ad copy for missing icons and collapsed layout space for failed or one-pixel icon images. Valid-icon layout is preserved. This release includes all accepted readiness-popup/shimmer and prior ad work.

- Previous live source: 56320ed348dff5a3717d6bad5ae4bea5e53ecba3; group 5cc30b9f-426a-45de-b88d-c98c899a2328.
- Released source: 81d591a156625138087c077f03d775eba5c47523.
- Platform: ios; channel/branch: production; runtime: 1.1.20.
- Update: 01a1d16a-986e-783b-8467-0f2ca8620171; group: 88122556-dd82-4165-a44d-0115d68c3eeb.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/88122556-dd82-4165-a44d-0115d68c3eeb).

Both update:view and update:list matched the exact commit, runtime, platform, group/update IDs and newest iOS Production status. See [verification receipt](IOS_PRODUCTION_RELEASE.json). Phone adoption/native image-error behavior remain unverified; Profile should show Production / runtime 1.1.20 / OTA 01a1d16a after close/reopen, twice if needed.

Validation: actual-component RNW screenshots, 32 focused tests, TypeScript, Expo lint (0 errors / 227 existing warnings), Production Firebase/App Check/social guard, Mapbox preflight, clean iOS export and clear-cache EAS publish. Both exports contain 2,558 modules; EAS reports 112 iOS assets. No native/runtime/config changes, ad request/refresh/ownership changes, backend writes, Android/Preview publications or device/map manipulation.

The screenshot cannot establish whether its icon was absent, failed or a normal-size visually blank creative. Missing assets, load failures and one-pixel placeholders are handled; normal-size white/transparent images are not guessed at. Layout and failure ownership are tested; real SDK playback/clicks and this exact creative's metadata are not verified by the fixture renders. Raw checks, guards, exports, publish logs and EAS readbacks are in ignored artifacts/ad-no-icon-20261112/.
