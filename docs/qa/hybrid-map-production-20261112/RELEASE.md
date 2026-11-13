# Published iOS Production Hybrid map

- Previous live source: `d019fa256c494c45d4fa1e3d0c6e79e1cef6d253`; group `d6acef8e-f5c6-4e67-a45b-8c1926da9da2`.
- Released source: `d0e661963531b602e65b038507207addca3da6e3` on retained branch `codex/ios-production-hybrid-20261112` (pushed to origin).
- Branch/channel: **production**; platform: **ios**; runtime: **1.1.20**.
- Update: `01a1d260-40aa-7465-9b3b-7b004af164da`.
- Group: `65e3db2c-c156-4a22-b1eb-5ca6c90d3e57`.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/65e3db2c-c156-4a22-b1eb-5ca6c90d3e57).

Independent `update:view` and `update:list` readback matched the exact commit, runtime, platform, update/group IDs and newest iOS Production status. Publication completed once, successfully. Export: 2,560 modules; final EAS count: 112 iOS assets. [Verification receipt](IOS_PRODUCTION_RELEASE.json).

TypeScript, 48 focused tests, Expo lint (zero errors, 227 existing warnings), Mapbox preflight, Production Firebase/App Check/social guard, iOS Production configuration check, clean-worktree checks, clean iOS export and independent actual-component visual review all passed. See [review details and screenshots](README.md).

To adopt, fully close and reopen GathR, twice if the first launch downloads the update. Select **Map → layers → Hybrid · Beta**. The Profile footer should show Production / runtime 1.1.20 / OTA **01a1d260**. Phone adoption, busy native-map collision behavior and native taps are not verified by EAS metadata or the component rendering evidence.

No Android/Preview update, native build, dependency/configuration change or backend write was performed. Current, Standard and GathR remain available; existing cluster tap/callout behavior was preserved. Raw release logs and scripts are archived under ignored `artifacts/hybrid-production-20261112/` in the retained app UI checkout.
