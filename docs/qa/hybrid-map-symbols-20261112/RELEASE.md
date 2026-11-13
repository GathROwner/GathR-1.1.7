# Published iOS Production — map-rendered Hybrid graphics

Hybrid's venue circle and summaries are ten percent smaller. The segmented arc extends inward to the photo's thin border, removing the empty ring gutter. Three-second rotation, all-zoom detail, venue-linked badges/category dots and static cluster totals remain.

The failed passive-touch wrapper was removed. Hybrid now renders as native map point-annotation graphics, with a separate native painted halo. Mapbox's native completed-tap event invokes the original cluster action; React view annotations no longer sit at the Hybrid photo/summary. Existing processing/readiness and callout/background-close paths are retained. See [implementation, rendered evidence and limitations](README.md).

- Previous live source: `4607456bdeed2a1ded723e0c83580df5c956ccd3`; group `9e7c6860-46b1-4d8e-b822-8b5683f4dc30`.
- Released source: `080c9a0c75f51aef689c86554fd9317055544617` on pushed branch `codex/ios-production-hybrid-symbols-20261112`.
- Channel/branch: **production**; platform: **ios**; runtime: **1.1.20**.
- Update: `01a1d2c1-c3e4-7f5d-867e-c565bc8870d0`.
- Group: `504afe48-6b46-4947-8025-8b0fe0c46e6c`.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/504afe48-6b46-4947-8025-8b0fe0c46e6c).

Independent EAS `update:view` and `update:list` matched commit, runtime, platform, update/group IDs and newest iOS Production status. Publication completed once. Both exports used 2,561 modules; final EAS asset count: 112 iOS assets. [Verification receipt](IOS_PRODUCTION_RELEASE.json).

All 20 focused tests, TypeScript, Expo lint (zero errors / 227 existing warnings), Production Firebase/App Check/social guard, iOS Production configuration, Mapbox preflight, clean-worktree checks and clean iOS export passed. Final `080c9a0` differs from preflight-export source `f883a17` only by test-mock lint cleanup; application/config/runtime files are identical. Clear-cache publication exported final `080c9a0` again. Nine actual-component cases were independently reviewed. Native Android fixture confirmed decoded graphics/rotation, native tap activation and a pan beginning directly on the photo without activation; a double-tap zoom changed 15 to 16.

The injected pinch check was inconclusive on empty map space too; **no native pinch pass is claimed**. Native iPhone appearance, pinch initiation, accessibility activation and adoption remain unverified. Fully close/reopen twice if needed, select **Hybrid · Beta**, and check Profile for Production / runtime 1.1.20 / OTA **01a1d2c1**.

The temporary native fixture entry point was restored byte-for-byte before committing. No runtime entry-point, native dependency, native configuration, app-store build, backend-data, Android OTA or Preview OTA change occurred. Raw evidence is archived under ignored `artifacts/hybrid-map-symbols-20261112/` in the retained app UI checkout. The pre-change checkpoint is `codex/checkpoint-hybrid-native-pinch-20261112` / `97d867a`.
