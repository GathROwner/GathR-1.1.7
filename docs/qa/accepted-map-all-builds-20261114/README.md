# Accepted Hybrid fix across all OTA targets

All six newest platform updates were independently verified by EAS group readback and branch listing on 2026-11-15T00:36:05.824917+00:00. iOS Production already carried the accepted fix and was retained. Five additional platform updates were published. No native builds were created. Existing runtime and native/auth/Firebase configuration was preserved for every target.

| Channel | Platform | Runtime | Commit | Update |
|---|---|---|---|---|
| production | ios | 1.1.20 | `791c4cb9` | `01a1dc6c-3b1d-7868-be7f-875a75d7f648` |
| production | android | 1.1.20 | `9ccc0525` | `01a1dc9f-fa0f-7484-aa83-76fb8bf69381` |
| preview | ios | 1.1.10 | `b4ec67c5` | `01a1dc9d-b40d-7202-a157-9c6a9d349d0f` |
| preview | android | 1.1.10 | `ea9a046b` | `01a1dc9b-a52e-71f7-93d9-5ddba0fb6ea6` |
| development | ios | 1.1.10 | `0c75b859` | `01a1dc9b-8176-75f3-8817-20074b26419f` |
| development | android | 1.1.10 | `0c75b859` | `01a1dca0-4950-7d01-ac0f-949301ade2d6` |

The accepted iOS completed-tap delivery and native fallback are available on all three iOS channels. Android retains its existing native annotation input route and receives the accepted Hybrid graphics and redraw savings. Preview Android and Development use bounded Hybrid backports, preserving their older surrounding app/map code and native dependency sets. They do not acquire unrelated current-app features.

Validation: four independent clean dependency installations; TypeScript passed on every candidate; 82 regression cases passed on Android Production, and 87 on each of iOS Preview, Android Preview and the shared Development source; lint exited successfully with zero errors (warning counts 227/221/219/257 respectively); Mapbox, native/config baseline, runtime, account/social/environment checks and clean clear-cache exports passed. Bundle graphs range from 2429 to 2746 modules; final EAS assets range from 112 to 128. The existing iOS Production graph is 2575 modules and 112 assets.

Actual-component visual evidence and exact source equivalence are recorded in [VISUAL_REVIEW.md](VISUAL_REVIEW.md). Craig accepted the physical iPhone tap improvement; exact new target adoption remains unverified until each installation displays its OTA ID. EAS fingerprint advisory messages on older targets are retained in the raw logs, alongside unchanged-native/dependency evidence.

One Android Production export failed before publication because simultaneous clear-cache exports touched the same global Metro FileStore. Fresh EAS lookup confirmed the previous target remained newest. A second attempt with a private TEMP/TMP root exported and published successfully; both attempt logs and immediate-before receipts are retained. Future exports use separate temporary roots. No duplicate Android Production OTA was created.

Release branches (pushed): `codex/map-all-prod-android-20261114`, `codex/map-all-preview-ios-20261114`, `codex/map-all-preview-android-20261114`, `codex/map-all-development-20261114`. iOS Production remains recoverable through its existing pushed release branch. All raw validation, environment, export/publish, group and newest-branch evidence is archived under `artifacts/accepted-map-all-builds-20261114/release/`.

No startup-delay repair was included. The long-absence reopening diagnosis and the reproduced cache-to-viewport handoff are recorded in [STARTUP_FINDINGS.md](STARTUP_FINDINGS.md). A stale-data refresh and a process cold start are separate events. Foreground refresh does not itself clear existing clusters; comparing trace session IDs and running OTA footers before/after the next delayed return is the smallest next measurement.
