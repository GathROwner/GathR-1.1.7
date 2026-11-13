# Published iOS Production — Hybrid rotation and touch handling

Hybrid venue swaps now occur every three seconds. The marker's invisible outer padding, fixed minimum width and extra touch margin were removed. A passive touch observer recognizes a short stationary tap and cancels on drag, multi-touch or native cancellation without claiming the React JS responder. The original cluster action, readiness/processing checks, accessibility activation and accepted all-zoom visual layout are preserved. See [implementation review and limitations](README.md).

- Previous live source: `aa25b83fb058af5ca679737ad15d14784a4a972e`; group `d3764dce-b974-4c85-a4b9-cb96fa095982`.
- Released source: `4607456bdeed2a1ded723e0c83580df5c956ccd3` on pushed branch `codex/ios-production-hybrid-touch-20261112`.
- Channel/branch: **production**; platform: **ios**; runtime: **1.1.20**.
- Update: `01a1d287-0517-7e5f-b48c-e5c665591af8`.
- Group: `9e7c6860-46b1-4d8e-b822-8b5683f4dc30`.
- [EAS release](https://expo.dev/accounts/craigb/projects/gathr/updates/9e7c6860-46b1-4d8e-b822-8b5683f4dc30).

Independent EAS `update:view` and `update:list` readback matched the exact commit, runtime, platform, update/group IDs and newest iOS Production status. Publication completed once. Both exports used 2,561 modules; final EAS asset count: 112 iOS assets. [Verification receipt](IOS_PRODUCTION_RELEASE.json).

All 20 focused tests, TypeScript, Expo lint (zero errors / 227 existing warnings), Production Firebase/App Check/social guard, iOS Production configuration check, Mapbox preflight, clean iOS export and nine-case actual-component visual review passed against the final implementation. The checkpoint before interaction edits is retained locally at `codex/checkpoint-hybrid-gestures-20261112`.

No native iPhone pinch reproduction or diagnostic trace was collected. Tests establish the local touch policy and render measurements establish smaller bounds; they do not prove native Mapbox pinch behavior or device adoption. The native view annotation remains rectangular. After close/reopen twice if needed, Profile should show Production / runtime 1.1.20 / OTA **01a1d287**. Choose **Hybrid · Beta** and verify pinch gestures near its summaries/photo.

Other styles and tutorial targets keep their original touchable/margins. No Android/Preview publication, native build, configuration/dependency change or backend write occurred. Raw evidence is archived under ignored `artifacts/hybrid-touch-20261112/` in the retained app UI checkout.
