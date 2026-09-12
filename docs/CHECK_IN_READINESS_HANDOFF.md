# Check-in readiness implementation and integration contract

Mobile baseline: `40479bc45246d9fc36e60e5660b3d76a3055b5eb`.
Backend baseline inspected, read-only: `0d3daf7a14d1b35260a85613e182734637c9d7d9`.

## Release boundary

This mobile change **requires the new backend contract below before rollout**. The accepted backend only accepts a target-bound eligibility session and always requires 90 seconds. It cannot transfer readiness to a newly created private candidate. No backend checkout was edited and no backend deployment, data write, build, OTA, Git mutation or dependency installation was performed by this task.

The frontend never invents an eligibility session, replays a client-supplied dwell history, or falls back to the old blocking flow. If either new endpoint is absent, it fails closed. Existing active check-in management and public/external/private display, audience and explicit-confirmation flows are retained; creating new check-ins requires backend integration. Do not publish this as a working feature before that integration passes.

## Foreground implementation

`CheckInReadinessObserver` mounts once under authenticated root content. It operates across app screens while the app is active, independent of map callouts and the place picker. It checks existing foreground permission without requesting permission on launch, obtains a fresh high-accuracy fix approximately every 10 seconds (plus request latency), and serializes requests. It stops and aborts pending network requests on app inactivity, basic mode, sign-out, or an active check-in. Location API calls already in flight cannot be cancelled, but their results are ignored by generation/owner guards. No readiness background task or location subscription is installed.

`utils/checkInReadiness.ts` is a deterministic, clock-injected evidence reducer:

- Here: 30 seconds, accuracy <= 50 m.
- Place: 90 seconds, accuracy <= 25 m at both interval endpoints.
- Fresh sample age <= 15 seconds; intervals <= 20 seconds; duplicates/out-of-order fixes never earn time.
- Reported movement > 0.7 m/s or > 20 m displacement from the initial anchor resets both rings. Unknown OS speed requires repeated stable coordinates; it is never coerced into proof of zero speed.
- Driving >= 5 m/s resets and suppresses progress for a 30-second settling period. Suppression survives foreground/background pauses within this process.
- Accuracy failure, backgrounding, missing samples and long gaps reset evidence. The one-second expiration check can only remove readiness, never add progress.
- An in-memory server receipt and local evidence must both qualify before selecting a place. Local ring segments can show measured evidence while the server is unavailable; there is no ready check or ready prompt without a valid receipt. No timer completes a ring without a fix.

The compact map control is 48 x 48 points, at right 4 / bottom 20, aligned to the recenter control's horizontal center. Purple inner and blue outer rings have textual progress in a dismissible eight-second hint. The small ready check means Here is available; public places remain gated on Place. Active check-ins show a check icon, not fabricated full progress rings.

Automatic prompts are foreground-only, outer-ring-only, never open a modal or check in, and are globally limited to one per account/device per rolling 24 hours. This is deliberately stricter than one prompt per place/day. Claim is persisted before display; persistence failure suppresses the prompt. Only mode and last-prompt time are persisted, keyed by UID. No coordinates, candidate ID, private label or place history is persisted on the device. Logging/analytics for the recurring sampling callable are suppressed. The location evidence and bound grant stay in memory.

After readiness, selecting a private label creates the accepted opaque private candidate and binds existing readiness. This involves fresh-location/network verification, **not a new dwell timer**. The resulting screen is audience/privacy confirmation. Public selection binds only after Place. There is no automatic check-in or friend projection in discovery, sampling, private candidate creation or binding.

## Required callable API (protocolVersion: 1)

Use the existing region, Firebase target, Auth, release-two gate, App Check enforcement, social error normalization and rate-limit conventions. Mobile names are exact. Do not deploy to another Firebase target based on these names alone.

### `recordCheckInReadinessSampleCallable`

Request: `{ protocolVersion: 1, sessionId, sequence, reset, latitude, longitude, accuracyMeters: number|null, speedMetersPerSecond: number|null, capturedAtMs }`.

Response: `{ protocolVersion: 1, sessionId, sequence, hereQualifyingMs, placeQualifyingMs, expiresAtMs }`.

`sessionId` is an opaque client operation ID; **not proof of readiness**. Counters are computed by the server from arrival times and independently validated fresh samples. `capturedAtMs` only checks freshness/order, never supplies elapsed dwell. An explicit reset can only remove accumulated evidence. Keep per-owner active session identity so starting/resetting a session invalidates older readiness. Enforce integer monotonic sequences/idempotent duplicates; reject old sequences, invalid/nonfinite coordinates, future/stale fixes and impossible transitions. Apply the same two accuracy thresholds, anchor displacement, movement and driving suppression rules on the server. Driving suppression belongs to the owner rather than a disposable session ID. Client resetting a session must not bypass it.

Cap credited time per interval at the smaller of server arrival gap and capture-time gap, and reject/reset any gap over 20 seconds. Require both endpoints to qualify, starting with zero at the first fix. Return capped counters (Here <= 30000, Place <= 90000), and a receipt expiry no later than 20 seconds after the qualifying fix/server receipt. Null accuracy never qualifies. Persist only the minimum protected transient anchor/latest-fix data needed to verify same-location binding; no public venue creation, private address, address lookup, reverse geocoding, friend projection or push notification. Purge expired transient data through TTL/cleanup and include it in account deletion. Client rules must deny direct writes and access by other users; prefer server-only access to raw evidence. Establish retention/privacy disclosure before deployment.

### `bindCheckInReadinessCallable`

Request: `{ protocolVersion: 1, readinessSessionId, operationId, venueId? | placeCandidateId?, latitude, longitude, accuracyMeters: number|null, speedMetersPerSecond: number|null, capturedAtMs }`.

Exactly one target is required. Reuse accepted venue/candidate validation, including owner, candidate expiry, source, consumed state and approved spatial radius. Validate a fresh stationary fix against the evidence anchor and selected target, the owner's currently active readiness session, receipt freshness, suppression and counters. Private approximate binding requires Here; external/public/GathR venue binding requires Place. There is no caller-supplied duration, readiness boolean, label override, audience or exact-sharing permission in this request.

Response: `{ protocolVersion: 1, readinessSessionId, eligibilitySessionId, venueId? | placeCandidateId?, locationType: 'gathr_venue'|'external_place'|'private_place', exactPrivateAllowed: boolean, expiresAtMs }`.

Create a normal opaque target-bound eligibility record consumable by `createCheckInCallable`; its expiry must be <= five minutes. Only mark `exactPrivateAllowed` for a private target when Place qualifies. The boolean is permission to offer the option, never consent to share it. Bind creates no check-in/projections, sends no notification, and must be idempotent for `operationId` and matching inputs. Existing legacy 90-second grants remain compatible.

### `createCheckInCallable` / `assertCompletedCheckInEligibility`

For V1 bound grants, independently enforce the target, owner, protocol, expiry, unconsumed state, and required strength. Reject exact private sharing unless the grant authorizes it **and** the request explicitly enables it with a nonempty selected-friends audience. Never accept a route parameter or a UI switch as proof of strength. Reject reuse of a Here-only grant for another public place or an exact private pin. Preserve operation idempotency, block/friend validation, consumption, time-limited visibility, approximate area default and private address omission. Upgrading an existing approximate private check-in to exact must also require a valid stronger grant; an existing check-in cannot bypass this check.

Required backend tests: server-time credit, forged duration/capture times, duplicate/out-of-order sequence, stale gaps, unknown accuracy, walking/driving reset and owner-level suppression across session resets, foreign UID/session/candidate, relabel/target substitution, expired/replayed/consumed bind, all-friends exact rejection, Here-only exact rejection (including editing an active check-in), and no friend-visible writes before explicit create confirmation.

## Permissions and native follow-up

`/check-in-settings` offers While Using GathR and Browse without location for readiness. The standard action asks only for foreground permission, in context. Basic disables check-in location requests; the existing event-map location permission remains separately controlled in OS settings and the copy explains this. Existing browsing/search is retained. Existing notification permission is read separately; selecting a location mode does not request notification permission.

Proactive / Arrival Reminders is clearly **not available in this build**. Permission alone is not native support. No background collection is simulated, no continuous background GPS is added, and there is no `requestBackgroundPermissionsAsync`, notification scheduling, native entitlement or config change in this patch. The foreground subset uses already installed Expo Location and SVG modules and is intended to be OTA-compatible with the accepted runtime, subject to coordinator preflights.

A future Proactive implementation requires a separate native design/build: a supported TaskManager/background execution integration or native visit/geofence module; low-power OS geofence/visit events; explicit user opt-in; contextual foreground-first then background upgrade; independently requested notifications; withdrawal/cancellation on logout/basic/reminder disable; server/client privacy and cooldown enforcement. Geofence entry does not prove 90 seconds stationary and must not be presented as exact readiness. Android background dwell delivery and iOS background delivery are OS-controlled and may be delayed. Verify current OS/Expo documentation and real-device behavior during that implementation. No App Store/Google Play policy approval is claimed. Review Play background-location declarations/disclosure/demo evidence, Apple usage descriptions/background capabilities, and the privacy policy/retention statement before submission.

No Mapbox geocoding or place APIs were added. Existing explicit public discovery uses the accepted OpenStreetMap service and attribution. Private candidates remain labels without addresses; exact location is never a route parameter.

## Coordinator validation and rendered acceptance

Changed files:

- `app/_layout.tsx` — one foreground observer under auth.
- `app/check-in.tsx` — bound-grant validation, expiry, stronger-evidence exact-private gate; discovered recognized venues need not have an event in the current viewport.
- `app/check-in-settings.tsx` — standard/basic preferences and honest Proactive boundary.
- `app/profile.tsx` — preferences entry point.
- `components/social/ContextualCheckInControl.tsx` — compact rings, hints, immediate bind-to-privacy routing and cancelled-response guards.
- `components/social/CheckInReadinessObserver.tsx` — serialized foreground sample lifecycle and expiry.
- `components/social/__tests__/ContextualCheckInControl-test.tsx` — early tap, private/public/external binding, missing endpoint, automatic prompt, dismissal and route privacy.
- `components/social/__tests__/CheckInReadinessObserver-test.tsx` — lifecycle, permissions, no target/consent mutation during sampling, background and sign-out guards.
- `services/socialService.ts` — two App-Checked callables, bounded sampling timeout, no per-sample analytics.
- `services/checkInReadinessPreferences.ts` — mode and conservative prompt cooldown persistence.
- `store/checkInReadinessStore.ts` — in-memory owner-scoped evidence and bound grant.
- `types/social.ts` — V1 request/response types.
- `utils/checkInReadiness.ts` — deterministic evidence and consent rules.
- `utils/checkInReadinessContract.ts` — receipt and bind validation.
- `utils/__tests__/checkInReadiness-test.ts` — thresholds, clocks, motion, permissions, cooldown and privacy cases.
- `docs/CHECK_IN_READINESS_HANDOFF.md` — this integration/QA handoff.

This worktree has no `node_modules` at task inspection. This task is explicitly prohibited from installing, elevating, Git mutation and publication. Run these after providing dependencies:

1. `npx.cmd tsc --noEmit`
2. `npx.cmd jest --runInBand --runTestsByPath utils/__tests__/checkInReadiness-test.ts components/social/__tests__/ContextualCheckInControl-test.tsx components/social/__tests__/CheckInReadinessObserver-test.tsx`
3. Focused lint for every changed/new TS/TSX file; repository lint; `git diff --check`.
4. Backend integration and security tests above against isolated/emulated data; then authorize the exact required deployment separately.
5. Android Preview only: baseline ancestry, clean commit, feature/Firebase environment flags, Mapbox verification, runtime/native compatibility, metadata read-back and device footer adoption. No iOS or Production from this task.
6. Capture the actual s24 map with the 48-point rings beneath recenter, with no Stay nearby pill; early tap must show only a dismissible hint; capture partial Here/Place progress and a ready generic/known-public state.
7. At Here readiness choose Home: capture the direct transition to audience/privacy; exact switch disabled, approximate default, no address. At Place readiness choose private + selected friends: exact remains off until explicitly switched. Exercise a public and external-public bind too. Do not confirm a live check-in unless that write is authorized.
8. Move/walk, inject a driving fix then stop, worsen accuracy, reuse stale fixes, background/resume, sign out, deny/revoke location, choose basic, and simulate endpoint/network failure. Confirm old readiness cannot open privacy, old automatic hints disappear, inner completion never prompts, and dismiss/return does not repeat the automatic prompt.
9. Inspect actual screenshots for alignment, legibility/font scaling, hit area, map obstruction, hint size and privacy hierarchy. Mocks/test-renderer are not rendered visual acceptance. This implementation is not visually verified by this task.
