# iOS Production 1.1.20 — build preparation

Current authority: Craig authorized one iOS Production native build, version 1.1.20 with an incremented build number, then extended the task to uploading that successful build to App Store Connect and preparing its metadata ready for review. He explicitly prohibited repeated paid builds. Public release, another build attempt, Android builds, new OTAs, and backend/data changes are not authorized by this scope. Earlier preparation checkpoints below retain their original narrower authority for historical clarity.

## Baselines and continuity

- Accepted checkout/source checkpoint: `1808d5fc9a80d6c9ddcc901fbce64fbeca0be887`, branch `codex/carousel-boundaries-20261017`. Accepted visual/runtime source: `1416f83882fd4c111d590727f954885c8d518e0e`.
- Accepted live iOS Preview: update `01a14b4f-9f31-7e59-9002-7564147d1252`, group `14c93e61-7c95-4601-8316-cd89f9af0b42`, runtime 1.1.10; re-read before preparation.
- Live iOS Production: source `b5d58df7881e69c7869e35072641407de248b3dd`, update `01a05fac-1c84-7f46-b9df-911ae6953efc`, group `007a0786-fba1-4f71-8ce9-0ba7e73fd08a`, runtime 1.1.10; re-read before preparation.
- Latest listed EAS Production native build: `4f5547b3-a761-4129-b0e6-b00adf152d8d`, version 1.1.10 (77), source `83769b6dbe441ded55828ad6b40f9b91ba52b0f2`.
- Preview native build 78 includes the date picker and RN Firebase App Check missing from Production 77. Build source and lockfile, rather than equal runtime strings, establish this native difference.
- Remote iOS build counter read as 78; production autoIncrement remains enabled. Expected next build number is 79; the actual EAS build record will be authoritative.
- Isolated owned release checkout: `C:\Users\craig\.codex\worktrees\ios-production-1120\GathR-upgrade-sdk54`, branch `codex/ios-production-1120-20261017`.
- Merge `2f0b75a` reconciles both histories. Its complete tree is identical to accepted checkpoint 1808d5f. The sole Production-only commit's older province discovery anchor is superseded by accepted explicit province coverage/no-physical-destination behavior. Conflicts were resolved to that accepted code and its corresponding tests; no map implementation was newly changed for the build.

## Build configuration

- App version 1.1.20; existing appVersion runtime policy produces runtime 1.1.20, isolating this native build from older 1.1.10 OTAs.
- Store distribution, production channel and production EAS environment; iOS only.
- Both social feature flags true; Firebase web target production; Production native GoogleService-Info.plist; emulators false; App Check disabled false and debug false. Preview's staging native plist and App Check compatibility bypass must not enter this build.
- App Attest production entitlement added for the existing native App Check provider. Firebase's official setup requires App Attest capability and production environment: https://firebase.google.com/docs/app-check/ios/app-attest-provider .
- No package/lockfile/native dependency changes relative to accepted app; app version, production environment pinning and App Attest entitlement are the release-specific changes.

## Evidence and remaining acceptance gates

The user accepted the existing Preview appearance. This build does not redesign the UI. Existing native appearance evidence is retained; Production-native behavior still requires TestFlight/device validation after building and before public release. No map interaction or emulator testing is authorized.

Read-only requests for the Production native app's App Attest/DeviceCheck configuration returned HTTP 403 / SERVICE_DISABLED. The initial request used the Google CLI quota project; repeating with explicit `x-goog-user-project: gathr-m1` confirmed the same disabled service for the intended project. A read-only `gcloud services list --enabled --project=gathr-m1` query returned no firebaseappcheck.googleapis.com entry. Production App Check API/provider setup and physical token issuance/protected social requests are unresolved pre-public-release gates. The native plist's Google app ID is `1:234071683975:ios:3ba054e711eb33b1869922`; it differs from the existing same-project web Firebase config's app ID and was checked against Production build 77 source. No alternate identity, API enabling, provider registration, enforcement change, backend deploy or live mutation was attempted.

Validation results, exact source/build ID and final outcome will be appended after checks and the one authorized build. A lost command connection requires querying EAS status before any action; do not enqueue another build. A failed paid build requires Craig's approval for another attempt.

## Local validation and signing checkpoint

- Independent `npm ci --no-audit --no-fund` completed; existing Mapbox and ads patches applied. Lockfile/dependency versions are unchanged.
- TypeScript passed. Expo lint passed with zero errors and 215 existing warnings.
- Production environment guard passed, including both Social flags, real Production native/web Firebase configuration, App Check enabled without debug/bypass, remote autoIncrement, native plugins and Mapbox runtime token.
- Expo native introspection verifies App Attest production, APNs production, existing associated domains and share-extension app group. No map screen/device was operated.
- Clear-cache iOS export passed: 2,507 modules; 111 assets; Hermes bundle 5,744,660 bytes, SHA256 `417cf342c581e60accfbb3a40562ad88284fdcd4d13cdddce160221c133f6408`.
- Source-map inspection verifies 21 critical bundled files against the checkout, 2,463 sources, zero QA/test runtime sources and all 111 image/font asset bytes identical to accepted baseline. The evidence JSON records the source commit at inspection time; later evidence-only commits do not alter the exported runtime source.
- First complete default Jest discovery: 133 passing suites; three support fixture/helper files were incorrectly discovered as suites; one obsolete cache-key assertion; one 5-second check-in test timeout. The obsolete assertion reproduces on unchanged accepted baseline 1808d5f. Its test-only expectation now includes the already accepted date-only/programme cache versions; no runtime cache behavior changed.
- Second batch excludes only the three non-test fixture/helper files: 134 passing executable suites, 1 suite with a single timeout; 1,002 passing tests, 1 skipped optional benchmark, 1 timed-out test, 1 passing snapshot. A separate run of the complete unchanged check-in suite passes 24/24 tests in 7.61 seconds. This is not a claim that the full batch passed; the batch timing instability remains documented. All executable tests have passing results across the batch and isolated check-in run.
- App Review email screenshot is an informational updated-guidelines notice, with no request to accept an agreement in the portion shown. No matching agreement email was found in the connected Gmail account. Applicable review guidelines still need review before store submission.
- Free EAS credentials configuration restored an expired Apple session and requested the account password. It was cancelled rather than handling a password through chat. Signing/provisioning validation, including the new App Attest capability, requires Craig to sign in locally before the paid build is queued.
- **No paid build has been queued at this checkpoint. No App Store Connect submission, public release, OTA or backend change has occurred.** See BUILD_RUNTIME_COMPATIBILITY.md; older Preview/Development binaries are not renamed to 1.1.20.

## User signing attempt — Apple account locked

Craig subsequently ran the credentials command locally. Apple returned service error `-20209`: the Apple Account is locked for security reasons and must be recovered through https://iforgot.apple.com/ . Do not retry authentication or launch the paid build until Craig confirms account recovery and signing/provisioning can be validated. The error does not establish why Apple locked the account. Apple's recovery guidance: https://support.apple.com/en-us/102640 .

The pasted transcript also shows an earlier command ran from `C:\Windows\System32`, creating an unrelated EAS project `@craigb/system32`, ID `54880746-abfd-43a4-8fe5-2bbb1c487f55`. Read-only inspection confirms a new 124-byte `C:\Windows\System32\app.json` pointing to that project; the pre-existing package.json dates to 2024 and must not be deleted as part of this accident. No cleanup of local System32 files or remote EAS project was performed. A later concatenated `productionSet-Location` command caused a separate unexpected-argument error.

The actual release checkout remains clean and linked to the correct GathR project `87fd0c8f-0007-49fb-a057-2f4e81afe1db`, with eas.json present. The CLI upgrade notice is advisory. These credential commands did not queue a paid build. Preparation/source commits remain unchanged; this follow-up is documentation only.

## Signing recovered and provisioning ready

Craig reported accepting the required Apple account agreement and updating the credit card. His subsequent local EAS credentials transcript confirms successful Apple authentication, registration of both bundle IDs, App Attest capability enabled, and ready Store credentials for both targets. The invalid old main provisioning profile JUW7275WHX was replaced with active WU4S9HXQW8. Share-extension profile LN6658D8BA remains active. Both use the existing distribution certificate/team G2W34P3KQ7, expiring February 16, 2027. The trailing unexpected-argument error belongs to an extra concatenated command and does not undo the completed signing setup.

This supersedes the account-lock signing hold above. The next action is the single authorized iOS Production build, with credentials frozen to the validated remote configuration. No additional Preview/Development build or store submission is authorized. Production App Check backend setup and physical-device acceptance remain separate public-release gates.

## Single build submitted and App Store Connect authority extended

- EAS build ID `d2567498-8749-4863-bc10-b5ff85d74e41`, created October 17, 2026 at 22:13:54 UTC (19:13:54 ADT).
- Verified initial record: iOS / production / STORE, app 1.1.20 (79), runtime 1.1.20, source `6c773c3a13663c950e73438fd7447b613e81ffa8`, status NEW.
- Dashboard: https://expo.dev/accounts/craigb/projects/gathr/builds/d2567498-8749-4863-bc10-b5ff85d74e41 .
- Exactly one `eas build` invocation, platform ios only, frozen credentials, clear cache, noninteractive, no auto-submit. Ignored submission-intent guard prevents blind repeats. Source/archive is uploaded and immutable; subsequent commits are documentation/evidence only.
- The source upload archive was 483 MB and took 5m 6s. This is build-input packaging, not the installed IPA/store download size. Do not cancel/rebuild merely to reduce this archive. Excluding documentation/test artifacts can be considered for a later authorized build.
- Craig subsequently authorized uploading the successful build to App Store Connect and preparing 1.1.20 with release notes, ready for review. This supersedes the earlier no-store-submission boundary only for this existing successful build. No public release or extra paid build was authorized.
- Craig requested short, broad feature notes, rather than a bug-fix inventory. Final intended English text: `Added check-ins, sharing, and friends, plus a refreshed look and performance improvements.` Saved in WHATS_NEW_1.1.20.txt. Do not claim it has been saved in App Store Connect until visible readback confirms that.
- Browser inspected the actual App Store record: GathR Map, Apple app ID 6743016252, currently 1.1.10 Ready for Distribution with build 77. New-version creation is blocked by an Agreement Update notice. Developer account page for team G2W34P3KQ7 independently shows Program License Agreement issued October 13, 2026 and accepted October 17, 2026. Treat this as propagation/stale-service state until rechecked; do not request another acceptance or accept legal terms on Craig's behalf. Developer account also still displays an expired-card warning; no financial settings were changed by the agent.
- A separate browser release tab was created to avoid interfering with Craig's own App Store navigation. No metadata write succeeded yet. No review credentials were copied/exposed, and no agreement/payment action was performed.

Continue monitoring the exact build ID. Upload only after FINISHED and verify processing/build selection, metadata, release mode and unresolved App Check/device acceptance gates before claiming review readiness. Never create a second build to resolve an upload/metadata delay.

## Build finished and exact binary verified

- EAS build d2567498-8749-4863-bc10-b5ff85d74e41 finished successfully at 2026-10-17T22:20:39.030Z. Exactly one paid native build was invoked.
- Downloaded Store IPA: 63,912,288 bytes; SHA256 7420d575e28b3437602dcc5c93afae2e3d55f6b73c66236015b2272f7b3e29ae. This is compressed IPA size, not an App Store thinned download estimate.
- Main and share-extension native Info.plist both contain 1.1.20 (79), minimum iOS 15.1. Embedded Expo config is runtime 1.1.20, production channel, correct GathR EAS project.
- Embedded native Firebase plist targets gathr-m1, app 1:234071683975:ios:3ba054e711eb33b1869922.
- Parsed actual Mach-O code-signature entitlements, separately from provisioning profiles: main executable has App Attest production and APNs production; both targets have get-task-allow false, team G2W34P3KQ7 and group.com.craigb.gathr. Provisioning allows multiple App Attest environments; actual signed executable is production. See IOS_PRODUCTION_1.1.20_IPA_CHECK.json.
- Invoked EAS Submit once for the exact existing build ID, production/iOS only. Existing remote App Store Connect API key was reused. Submission ID 020d9441-b945-4f66-822e-9b2dfb436d1c; initial status submitting. No new build was launched.
- After build completion, reloaded App Store Connect and attempted new-version creation once more. It still returns Agreement Update, although Developer account acceptance was previously confirmed. No version/metadata write succeeded. Do not loop or alter existing distributed 1.1.10 metadata.
- Narrow Production Firebase App Check setup remains pending Craig's answer to the explicit question. No Production Firebase writes, enforcement changes, or event-data changes performed. Physical Production/TestFlight acceptance remains pending.

## Upload blocked by Apple agreement state

- Submission 020d9441-b945-4f66-822e-9b2dfb436d1c failed during the initial App Store application-information read, before IPA upload. Exact log: "A required Apple agreement is missing or has expired." It points to App Store Connect Business and, if prompted, Apple Developer account.
- Business page readback: Free Apps Agreement `Active (New Agreement Available)`; Paid Apps Agreement Active. A banner still says the updated Apple Developer Program License Agreement needs acceptance, contradicting the earlier Developer account accepted date. Cannot distinguish another agreement from propagation without Apple/account-holder resolution. No legal acceptance, tax/trader answer or payment action was performed.
- App Store version 1.1.20 was not created; release notes are saved locally only. Build 79 is finished and retained on EAS, but is not uploaded, not ready for review and not publicly released.
- No automatic retry was performed. Once Apple resolves the agreement gate, retry only submission of the same finished build d2567498-8749-4863-bc10-b5ff85d74e41. A new native build is unnecessary and not authorized.
- Evidence screenshot: C:\Users\craig\.codex\visualizations\2026\10\11\01a12ac6-42ef-7b30-842a-3131be446090\ios-1120-upload-agreement-blocker.png .

## Agreement accepted; one upload retry still blocked

Craig confirmed accepting the agreement. On October 17 at approximately 22:37 UTC, re-read Developer account for team G2W34P3KQ7: Apple Developer Program License Agreement issued October 13, accepted October 17. App Store Connect Business still showed the updated-agreement banner and Free Apps Agreement Active (New Agreement Available); Paid Apps Agreement Active. The Digital Services Act row now showed Active, last updated October 17; no compliance details were entered by this agent.

Retried only the existing finished build d2567498-8749-4863-bc10-b5ff85d74e41 through EAS Submit. New submission 5eaada08-1266-4cfc-93d7-cf97c09761e2 failed at the initial application-information read with the same missing/expired agreement message, before IPA upload. No new native build, legal/payment action, metadata write, backend mutation or public release occurred. The disagreement between Developer acceptance and App Store Connect may be propagation, but its cause is not established. Do not tell Craig he failed to accept or automatically reaccept anything. Stop repeated submission attempts until account state changes or Apple resolves it. Store metadata/review readiness and pending App Check/device gates remain open.

Screenshot: C:\Users\craig\.codex\visualizations\2026\10\11\01a12ac6-42ef-7b30-842a-3131be446090\ios-1120-agreement-retry-blocker.png .

## Agreement diagnosis clarification

Fresh App Store Connect Business readback after Craig's concern shows Paid Apps Agreement, bank account, all listed tax forms, DSA and Canadian Part XX compliance Active. Opening Paid Apps Agreement offers Download/Done only, with no pending acceptance control. No financial/tax/legal edits performed and no additional upload was attempted.

Apple's official View agreements status documentation explicitly identifies the Free Apps Agreement as the Apple Developer Program License Agreement, not a separate agreement to sign in Business: https://developer.apple.com/help/app-store-connect/manage-agreements/view-agreements-status . This corrects any implication that the Free Apps row proves Craig missed a separate acceptance step. Developer accepted record and ASC warning remain inconsistent. Same-day first-person developer reports describe the exact nonclickable Active (New Agreement Available) loop: https://www.reddit.com/r/iosdev/comments/1x8lq4x/appstore_connect_says_i_have_agreements_to_agree/ . These corroborate symptoms but are not Apple confirmation of an outage or a guaranteed propagation timeline. Official status page text could not establish service status; do not claim all services green or confirmed outage. Recommended wait/recheck, then Apple Developer Support if persistent; reuse the existing build only.

## Explicit upload retry — October 17, 21:26 ADT

At Craig's explicit request, retried EAS Submit once for existing finished build d2567498-8749-4863-bc10-b5ff85d74e41, 1.1.20(79), without invoking a native build. Submission b023d25d-0f1b-4bb9-a6bc-0328f0a7d4a7 failed at initial app-information read with the same missing/expired Apple agreement message, before IPA upload. Screenshot ios-1120-upload-retry-2126.png in the task visualizations folder records the exact failed stage. No additional retry, build, store metadata write, review submission, public release, Apple legal/payment action or backend mutation was performed. Repeated failures alone do not prove what is wrong with Apple's account state; acceptance remains independently recorded. Original finished build remains the only allowed upload candidate.
