# iOS Preview push registration loop

## Scope and baseline

Source checkout: `C:/Users/craig/.codex/worktrees/9513/GathR-upgrade-sdk54`, branch `codex/frontend-adjudicator-20261011`, accepted source HEAD `db8d8b8`.

Latest accepted iOS Preview was independently read from EAS before editing and again before release assembly: group `32c69862-84d4-4800-833e-c11d882bf0a3`, update `01a13751-4a65-7c8d-a337-67dbe44de255`, runtime `1.1.10`, commit `69a026e6ea5776974f7e8d70e6a87ad019b1b89e`, published 2026-10-13 22:10:36.773 UTC. Both push source files matched that shipped commit before editing.

Only iOS client registration behavior changes. No native dependency/configuration changes, Android release, Production release, backend service deployment, Firestore mutation, or map interaction/testing.

## Cause and repair

The app token-change callback discarded the native token and forced registration. Registration called `getExpoPushTokenAsync` without `devicePushToken`; installed expo-notifications 0.32.17 then called `getDevicePushTokenAsync`, which can emit the same listener again. Force bypassed the existing 15-minute guard, with no in-flight protection. Expo's installed TokenEmitter source and [SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/) explicitly warn of this loop.

The listener now forwards its native token. On iOS, registration supplies that token to Expo, serializes work, coalesces repeated events, and deduplicates successful same-owner/same-native/same-Expo-token registration within the refresh window. Startup revalidates once even with a saved cache. A genuine native change reasserts server registration, even if Expo returns the same Expo ID. Foreground refresh remains due after 15 minutes. New tokens supersede pending stale tokens. Authentication is checked across asynchronous boundaries. Sign-out blocks the outgoing session, cancels/waits for registration, and unregisters its stored and attempted tokens with the captured owner before clearing local state. Failures do not launch an automatic retry loop.

The original non-iOS path remains, with a compatibility regression. Native tokens are only held in memory; no token/credential/body logging was added.

## Automated evidence

20 focused tests cover real component listener wiring, a native fetch that emits the listener, concurrent/repeated events, token rotation during SDK/backend work, same Expo ID after native rotation, startup/cache/foreground refresh, auth changes, sign-out/cancellation, storage failures, timeout/retry, unavailable permissions/device/user, and unchanged Android behavior.

A bounded red control using the shipped baseline library and the same SDK/listener mock failed as intended: one fetch-triggered event produced **2 backend registrations; expected 1**. The fixed implementation produces one native fetch, one Expo exchange, and one backend registration, with maximum backend concurrency 1. Tests mock all network/storage/auth/SDK I/O and do not contact the live registration endpoint.

Source regression validation: 22 suites, 242 passing tests, 1 existing optional performance test skipped. TypeScript passed. Expo lint exited zero with 0 errors and 213 existing warnings. Release-candidate validation and publication/device evidence are recorded separately after assembly.

## Read-only Cloud Run evidence before release

Project explicitly selected per query: `gathr-m1`. Request log service: `registersharedeventpushtoken`. Queries collected only timestamp, HTTP status, and method; no identity, auth, token, or request-body output.

- 2026-10-13 22:18:37Z <= timestamp < 22:18:46Z: **476 POST requests, all HTTP 200**, 52.9 requests/second over the fixed 9-second window. Earliest 22:18:37.172199Z; latest 22:18:45.113293Z. This is token registration traffic, not notifications sent.
- 2026-10-13 22:24:23.9229652Z–22:29:23.9229652Z: **0 requests** (uncapped query). A subsequent pre-release query after 22:18:46Z also found zero requests.

The quiet period predates this fix. It does not prove the issue stopped permanently or that the fix caused a reduction. Device foreground state was not established for those windows. The user's open-app hypothesis fits the listener lifecycle, but logs alone do not establish foreground-only behavior.

User-provided daily invocation totals (not independently recounted): Oct 11 839,834; Oct 12 455,137. Other installations running an older bundle can still loop; this release is limited to iOS Preview.

Publication and actual device adoption must be reported separately. After publication, the user can verify the Profile OTA ID, leave the app foreground for a minute, then background it to reply. Sample read-only request logs for the aligned interval and record the exact count/window, including ingestion-delay and identification limits.
