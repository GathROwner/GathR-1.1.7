# iOS Preview map/callout candidate — 2026-10-22

Unpublished map-only derivative of reviewed production candidate b2aa2ac, based on current iOS Preview a997bb71cbc7c7453beea88a47b2878f96ebff75 (OTA 01a158e5, runtime 1.1.10, channel preview).

Scope: cluster selection preserves camera; hero/description downward pull at scroll top; continuous finger-following dismissal, thresholds and cancellation snapback; exact-position location puck with displaced cluster/count and geographic leader. Static iOS child layout, normal scrolling/horizontal controls, accessibility escape and Reduce Motion remain as reviewed.

The application patch applies unchanged. Preview retains its pre-existing event-time presentation; the unrelated Production visiting-hours hook was not imported. No updater, check-in, auth, configuration, native dependency or lockfile migration is included. Production b2aa2ac remains untouched.

For any future iOS Preview export, preserve the existing approved account-continuity environment: Production Firebase web services; staging-native GoogleService-Info.staging.plist; no emulators; both Social flags true; App Check debug false and the existing Preview compatibility override true. Use gathr-social-preview-guard preflight. Never substitute Android's staging account environment. This candidate does not change auth code or settings.

Native iOS QA still required after a separately authorized Preview OTA and confirmed phone adoption: initial/repeated sheet paint and expanded/minimized visibility; top-of-scroll hero/description pull, flick, reversal/cancel and mid-list scroll; horizontal selectors, lightbox/buttons/tab targets; VoiceOver escape/Reduce Motion; puck and counts at overview/street zoom, true leader anchors, separate targets, filters/rotation/edges. Guest mode permits public map/callout QA with existing registration prompts; account-protected Social/check-in QA remains separate.

No build, publication, channel/runtime change, auth-account change or event-data mutation is included. Local ignored node_modules junction reuses the matching installed dependency tree; use physical dependencies for future native Metro QA.