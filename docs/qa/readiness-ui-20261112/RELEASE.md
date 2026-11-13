# iOS Production readiness update — November 12, 2026

Published the manual-only readiness hint, outside/× dismissal, quiet ready-button shimmer and revised non-overlapping placement. Craig's standing instruction is to publish confident completed changes, with iOS Production as this task's current target. The accepted split-ad layout is preserved.

- Previous live source: cc6aee1700960797441de0f51079f6e31b472d32; group 72edf28f-adb4-4821-94d1-5b24d508c5f3.
- Released source: 56320ed348dff5a3717d6bad5ae4bea5e53ecba3, containing the readiness work from 17e2265.
- Platform: ios; channel/branch: production; runtime: 1.1.20.
- Update: 01a1d117-78eb-7cb0-8a38-ccd43d04931c; group: 5cc30b9f-426a-45de-b88d-c98c899a2328.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/5cc30b9f-426a-45de-b88d-c98c899a2328).

Update view and branch list readbacks both matched the exact source, runtime, platform, group and update; this is the newest iOS Production group. [Verification receipt](IOS_PRODUCTION_RELEASE.json). Phone adoption/native touch behavior remain unverified. Close/reopen twice if needed; Profile should report Production / runtime 1.1.20 / OTA 01a1d117.

Validation: 59 focused tests, TypeScript, Expo lint (0 errors / 227 existing warnings), actual-component RNW render review, measured geometry/scroll checks, Production Firebase/App Check/social environment guard, Mapbox preflight, clean iOS export and clear-cache EAS publish. Both exports contained 2,558 modules; EAS reported 112 iOS assets. Native/runtime configuration and check-in eligibility/privacy are unchanged. No Android or Preview publish, native build, backend write or device/map manipulation.

The hint uses the measured interest-rail width, with 12 points to its left and 12 points above the ready button. It retains safe viewport bounds and scrolls on shorter screens; private/public descriptions wrap. The globe remains clear below. See [latest preview](clearance-detail.png). This rendered evidence uses simulated map/rail/globe context and does not substitute for on-device verification.

Raw export, guard, publish and EAS verification logs are in ignored artifacts/readiness-clearance-20261112/. Craig's explicit publication preference was also appended to the requested local memory notes; no generated memory files or global skill instructions were edited.
