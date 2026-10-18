# Android Production 1.1.20 release preparation

Craig authorized one Android Production build/release while Apple blocks the existing iOS build upload. He noted builds normally take 27-30 minutes. Do not enqueue duplicates, change the iOS build, replace Preview/Development installs or manipulate/test the GathR map. Backend changes remain separate from this build authority.

## Source and live baseline

- Owned checkout: C:\Users\craig\.codex\worktrees\android-production-1120\GathR-upgrade-sdk54, branch codex/android-production-1120-20261018.
- Starts from accepted iOS release checkpoint e1bf55f, including accepted frontend baseline 1808d5f and existing Production history. No runtime implementation/dependency changes for this preparation.
- Live Android Production OTA: update 01a0309c-83b8-753f-8710-bc14187b3e1f; group eb4c024d-358b-423d-8f48-e48e8272e689; runtime1.1.10; source25a157d84a8a11711b9978a26623ff954864a186. This source is an ancestor of the candidate.
- Latest EAS Android Production native build: bb8cd149-680b-4eee-833c-fbb194047d6c,1.1.10(13), source83769b6dbe441ded55828ad6b40f9b91ba52b0f2. This source is also an ancestor of the candidate.
- Remote Android versionCode reads13; production autoIncrement should produce14. Verify the actual new EAS build record, not the historical local versionCode7.
- Version/runtime1.1.20, Production channel/environment, signed AAB, existing remote Android signing credentials, both Social flags true, Firebase targetproduction, native gathr-m1 Google services, App Check enabled without debug/bypass. Older Preview/Development shells keep their true native versions/runtimes.

## Store and runtime gates

- Existing saved Google Play uploader service account gathr-play-release-uploader@gathr-migrated.iam.gserviceaccount.com receives403 The caller does not have permission when trying to open an edit for com.craigb.gathr. No edit was created or committed and no store release was changed. Projectname on the credential does not by itself prove a problem; actual Play permission must be resolved.
- Browser signed in as craig@gathrapp.ca shows only developer account5621955374444257067 closed April3,2025 for inactivity. This has not been linked to the current GathR listing; do not tell Craig the active GathR publisher is closed. Async question asks which Google account owns the current listing. No new account, login credential, fee or permission change performed.
- Production Android native Firebase app1:234071683975:android:988d506511718e89869922 is ACTIVE, packagecom.craigb.gathr. Read-only App Check Play Integrity config request returns403 SERVICE_DISABLED for firebaseappcheck.googleapis.com in gathr-m1. Provider configuration/Play app-signing SHA256/project link and physical installed-store token acceptance remain unresolved. Existing pending iOS backend approval does not authorize Android provider setup. Do not disable/bypass App Check or enable enforcement to get a release through.
- Added a separate android-production-draft submission profile: production track,draft releaseStatus,changesNotSentForReviewtrue. Existing production submission profile is untouched. Do not blindly use its completed/automatic-review settings while the known runtime gates remain.
- Intended brief notes remain: Added check-ins, sharing, and friends, plus a refreshed look and performance improvements.

No Android paid build has been queued at this checkpoint. Record local checks, immutable source, exact build ID/outcome and store status below as they become available. Device/visual validation remains distinct from source/export/build evidence. No emulator or map operation performed.

## Local build checks passed

- Independent npm ci completed in five minutes; committed lockfile unchanged, existing Mapbox and ads patches applied.
- Production configuration guard and Mapbox check passed; native introspection confirms package/Firebase target, new architecture, Hermes, compile/target API36, updates URL and Android AdMob ID. All four blocked permission entries retain tools:node=remove; listing raw introspection entries alone does not mean they are requested by the final merged manifest.
- TypeScript passed; focused Android-relevant regression selection passed8 suites/87 tests (push registration, date-only capability, callout swipes, lightbox navigation, grouped venue rows, filter summary, check-in readiness). Changed guard ESLint passed with zero errors/warnings; existing shared app code was previously fully linted for the identical iOS release source.
- Clear-cache Android export passed:2514 modules,2470 source-map sources,111 assets,Hermes5,770,596 bytes,SHA256 ab7223b29d85ab5093de4ea641e48e88b007b3358403edb5d0cc314a2e4573a0. Source-map inspection matches21 critical runtime sources, zero QA/test imports.103 shared assets match accepted iOS export byte-for-byte; eight differing assets are verified React Navigation back/search Android-specific packaged resources. The first whole-set cross-platform asset comparison correctly failed on these platform variants, then was replaced with common-byte plus explicit platform-source verification. No app image/font asset changed.
- Evidence: ANDROID_PRODUCTION_1.1.20_EXPORT_CHECK.json and ANDROID_PRODUCTION_1.1.20_NATIVE_CHECK.json. No final Production device/visual/App Check acceptance claimed; no map operation performed.
- Google Play's actual live versionCode cannot yet be independently read due publisher access. Remote EAS counter13 and latest EAS Production build13 support expected14 but do not prove no out-of-band upload. Record actual EAS result and do not blindly rebuild if later Play access reveals a conflict.
