# iOS Production 1.1.20 — build preparation

Craig authorized one new iOS Production native build, requesting version 1.1.20 and an incremented build number. He explicitly prohibited repeated paid builds. This task does not authorize App Store Connect submission, review submission, public release, another build attempt, Android builds, new OTAs, or backend/data changes.

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
