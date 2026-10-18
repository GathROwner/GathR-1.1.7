# GathR native builds and OTA compatibility

Checkpoint: October 17, 2026. Craig authorized one iOS Production build for 1.1.20 and asked that future chats preserve the existing Preview and Development builds. No replacement Preview/Development builds or multi-platform releases are authorized by that request.

## Read this before any release

An app's visible version, native build number, OTA runtime and feature/code baseline are different things. An OTA cannot change an installed native version/runtime or install a native module. Never relabel an older native build as 1.1.20 or publish a 1.1.20-runtime update to it. Equal runtime strings alone are not proof of equal native contents.

The 1.1.20 app code can be maintained alongside older compatible Preview/Development shells through separate exports using each shell's actual runtime and correct environment. This is feature/source compatibility, not the ability to load the identical 1.1.20 Production OTA artifact. Revalidate native requirements for every later feature. Production App Attest credentials and entitlement behavior are not proven by an older Preview shell's compatibility bypass.

## Recorded inventory

| Target | Native version/build | Runtime | Evidence and constraints |
| --- | --- | --- | --- |
| iOS Production, existing | 1.1.10 (77) | 1.1.10 | EAS `4f5547b3-a761-4129-b0e6-b00adf152d8d`; lacks native date picker and RN Firebase App Check. Do not send the complete current baseline to it. |
| iOS Production, finished build | 1.1.20 (79) | 1.1.20 | EAS `d2567498-8749-4863-bc10-b5ff85d74e41`, source `6c773c3a13663c950e73438fd7447b613e81ffa8`. This is the single authorized iOS build and has finished; Apple agreement state still blocks upload. Finished does not mean uploaded or released. Exact outcome belongs in IOS_PRODUCTION_1.1.20_20261017.md. |
| iOS Preview | 1.1.10 (78) | 1.1.10 | EAS `c60594c6-80bf-4e40-9270-327f525821d0`, source `716f9c371dcb9c741535663a4fc3c0cc75527c7c`. Date picker/App Check included. Accepted OTA `01a14b4f` from source `1416f83`; account continuity uses Production web Firebase, staging native plist and explicit App Check compatibility bypass. Preserve separate Preview guard. |
| Android Production, finished build | 1.1.20 (14) | 1.1.20 | EAS `29d6eb0a-78ab-432a-8cca-a03b249fbc51`, source `d50aa9c`. AAB verified; Google Play upload blocked by publisher access; App Check/device acceptance pending. |
| Android Development, latest listed EAS record | 1.1.10 (13) | 1.1.10 | EAS `b7b734ad-eafc-4bd1-9445-588a35187783`, source `deac96c0ce624303f09c8f94094cb8283cf2a90d`. A listing does not establish which Android development/debug build is installed. Do not replace, clear or operate the emulator for this build task. |
| iOS Development, latest listed finished record | 1.1.8 (73) | Not returned by EAS | EAS `283d5aaa-7a12-4ad8-bb2c-41a5ace8555a`, source `f102ef69b7c69220ed56e6842784b632dfaf50a8`. Current baseline compatibility is unverified; do not claim all Development binaries are compatible. |

Inventory uses EAS build records, not fresh physical-device inspection. Future chats must re-read live target records before release. The newer Android preview-debug harness has its own recorded history; do not conflate it with the Development-profile record above.

## Resume locations and authority

- Accepted Preview work: `C:\Users\craig\.codex\worktrees\carousel-boundaries\GathR-upgrade-sdk54`, branch `codex/carousel-boundaries-20261017`, accepted checkpoint `1808d5f`. Version/runtime remain 1.1.10 here.
- Production build preparation: `C:\Users\craig\.codex\worktrees\ios-production-1120\GathR-upgrade-sdk54`, branch `codex/ios-production-1120-20261017`. Contains both live Production ancestry and every accepted frontend change; release-specific version/runtime/config must not silently propagate to older-shell OTAs.
- Do not update shared remote build counters manually, create duplicate paid builds, publish cross-platform OTAs, submit to App Store Connect, or release publicly as a side effect of compatibility documentation.
- The explicit cost limit is one paid iOS Production build. If command output is lost, query build status; if a paid build fails, obtain Craig's approval before another.
- Keep map-interaction prohibition, protected checkout boundaries and unrelated dirty work intact. Read the build outcome and Production App Check acceptance gates before treating the candidate as releasable.

## Android Production authority extended October 18

Craig subsequently authorized one Android Production build/release from the accepted app baseline while Apple blocks iOS upload. Android preparation is isolated at C:\Users\craig\.codex\worktrees\android-production-1120\GathR-upgrade-sdk54, branch codex/android-production-1120-20261018. EAS confirms finished app/runtime1.1.20,versionCode14, build29d6eb0a-78ab-432a-8cca-a03b249fbc51. Finished does not mean uploaded or publicly released. Preserve the iOS build and all older Preview/Development shells. Do not publish an OTA merely because this native build exists.

Current Android live OTA is update01a0309c-83b8-753f-8710-bc14187b3e1f/group eb4c024d-358b-423d-8f48-e48e8272e689/source25a157d; latest prior native Production build bb8cd149-680b-4eee-833c-fbb194047d6c is1.1.10(13). Both sources are ancestors of the accepted release candidate. Store publisher access, Production Play Integrity/App Check setup and device acceptance are unresolved. Use the separate android-production-draft submission profile if upload becomes possible; its draft/review-held settings avoid public rollout while these known gates remain. See ANDROID_PRODUCTION_1.1.20_20261018.md for the single build ID and final status.

