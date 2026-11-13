# Published iOS Production — Hybrid zoom and spacing

Full Hybrid venue photos and category summaries now remain visible at all zoom levels. The normal gap between the image ring and each summary is four points; venue-linked friend badges reserve extra clearance only when needed. Current, Standard and GathR presentation, the compact 2×2 selector, accepted photo sizes, and existing cluster tap/callout behavior are preserved.

- Previous live source: `d0e661963531b602e65b038507207addca3da6e3`; group `65e3db2c-c156-4a22-b1eb-5ca6c90d3e57`.
- Released source: `aa25b83fb058af5ca679737ad15d14784a4a972e` on pushed branch `codex/ios-production-hybrid-tune-20261112`.
- Channel/branch: **production**; platform: **ios**; runtime: **1.1.20**.
- Update: `01a1d270-b62c-7fbd-b5f7-a719895bb5fa`.
- Group: `d3764dce-b974-4c85-a4b9-cb96fa095982`.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/d3764dce-b974-4c85-a4b9-cb96fa095982).

Independent EAS `update:view` and `update:list` confirmed the expected commit, runtime, platform, update/group IDs and newest iOS Production status. Publication completed once, successfully. Both clean exports used 2,560 modules; final EAS assets: 112 iOS assets. [Verification receipt](IOS_PRODUCTION_RELEASE.json).

All 11 focused tests, TypeScript, Expo lint (zero errors / 227 existing warnings), Production Firebase/App Check/social guard, iOS Production configuration verification, Mapbox preflight and actual-component visual review passed. TypeScript/lint ran on feature `b9bdf23`, with source-tree equivalence to the clean release verified excluding documentation. The focused tests also passed against independently installed release dependencies. An initial extra test run inherited `NODE_ENV=production`, which disables React's testing helper; it was rerun successfully with `NODE_ENV=test`. Production mode was restored and guarded before both exports. No app-code correction was required for that test setup issue.

See [visual review](README.md) for nine rendered cases and badge-clearance measurements. This is actual-component evidence via React Native Web with iOS props, not native iOS device validation. Native collision behavior and adoption of this new update remain unverified. Close/reopen twice if needed; Profile should show Production / runtime 1.1.20 / OTA **01a1d270**. Hybrid remains selected through the existing map style selector.

No Android/Preview publication, native build, configuration/dependency change or backend write occurred. Raw evidence is archived under ignored `artifacts/hybrid-density-20261112/` in the retained app UI checkout.
