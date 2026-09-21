# Burgoyne public-place resilience: mobile handback

**Date:** 2026-09-21
**Scope:** mobile-only follow-up from the accepted `4ed0179` check-in baseline. No Firebase deployment, OTA, Firestore/OSM mutation, live fixture, check-in, category change, or release action was performed.

## Commit

`dfb3aa09582c608fcfe600969c1a31c06910e1df` — `Handle partial nearby public place lookup outages`

## Change

- `NearbyCheckInPlacesResult` now recognizes the backend's optional `externalLookupStatus`: `complete` or `partial_unavailable`.
- `SocialServiceError` preserves only a small safe callable-details shape (`condition`, `retryable`) from both Firebase callable SDK and App-Check-attested HTTP paths.
- A successful `complete` response with no candidates still presents the existing **No eligible public places** state.
- A `partial_unavailable` response keeps the returned canonical GathR venues selectable. The picker adds a calm notice, **Retry**, and retains the existing private-place entry.
- The typed retryable callable condition `nearby_public_places_external_lookup_unavailable` presents **Nearby public places could not be loaded right now** instead of the generic social/offline message. Ordinary unavailable/transport errors retain that generic message.
- No provider name, coordinate, or raw callable payload is rendered.

## Files changed

- `types/social.ts`
- `services/socialService.ts`
- `components/social/ContextualCheckInControl.tsx`
- `services/__tests__/socialService-callable-transport-test.ts`
- `components/social/__tests__/ContextualCheckInControl-test.tsx`

## Validation

- `node_modules/.bin/jest.cmd --runInBand --runTestsByPath services/__tests__/socialService-callable-transport-test.ts components/social/__tests__/ContextualCheckInControl-test.tsx --verbose` — **39/39 passed**.
- `node_modules/.bin/eslint.cmd` over all five changed files — **0 errors**; one pre-existing `import/first` warning in `services/__tests__/socialService-callable-transport-test.ts`.
- `git diff --check` — passed.
- Whole-project `npm.cmd run lint` could not reach zero errors in the shared dependency set: `app/create-event.tsx` cannot resolve `@react-native-community/datetimepicker`, and `app/friends.tsx` cannot resolve `react-native-qrcode-svg`. These packages are declared in `package.json`/lockfile but absent from the shared `node_modules`; neither file is part of this change. TypeScript has the same two missing modules plus the existing missing `@react-native-firebase/app-check` declaration in `services/appCheckService.ts`.

The isolated worktree had no dependencies of its own, so `node_modules` is an ignored junction to the pre-existing main-worktree dependency directory; no packages or lockfiles were changed.

## Visual verification

**Pending — no rendered artifact.** The pre-existing `s24` AVD was started without clearing data or changing its installed app, but it did not register with `adb` (`emulator-5554` remained unavailable). Therefore Metro adoption and an Android picker screenshot could not be proven. The new state has only static/test-renderer coverage; do not treat it as visual acceptance or release evidence.

The next visual pass should capture both:

1. A `partial_unavailable` picker with at least one canonical venue, the amber notice, Retry, the selected venue, and private-place entry visible.
2. The typed no-canonical outage state with its public-search-specific retry copy and private-place entry visible.

## Remaining coordinated work

1. Independently review this commit against backend commits `4bc3dd8` / `c920dab`.
2. Obtain a rendered Android (and, separately, physical-iPhone if required) picker capture before any release decision.
3. Deploy the backend only under the coordinator's approval, then exercise the real callable states without creating a check-in.
4. Keep the existing timestamp normalization, readiness, selected-place retry, permission, privacy, GPS/freshness/dwell, and anti-spoofing checks unchanged through device verification.
