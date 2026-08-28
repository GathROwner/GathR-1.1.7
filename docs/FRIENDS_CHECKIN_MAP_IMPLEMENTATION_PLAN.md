# Friends, Check-Ins, and Friend-Aware Map Implementation Plan

Status: **Implementation in progress; automated gates passed, Android development-client QA pending**  
Created: **2026-08-28**  
Primary mobile repository: `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`  
Primary backend repository: `C:\Users\craig\Dev\gathr-apps-script\functions`
Mobile implementation worktree: `C:\Windows\System32\GathR-Project\GathR-friends-presence-20260828`  
Backend implementation worktree: `C:\Users\craig\Dev\gathr-apps-script-friends-presence-20260828`

This is the durable execution checklist for the first GathR social release. Every phase must leave evidence in the progress log at the end of this document. A checked box means the item was implemented and verified, not merely attempted.

## 1. Product objective

Add mutual friendships and temporary, permissioned venue check-ins so that the existing GathR map can show authorized users when friends are present at a venue.

The first release must answer two questions without turning GathR into a general social network:

1. What is happening nearby?
2. Are people I trust already there?

The governing privacy rule is:

> Friendship makes someone eligible to receive a check-in. A check-in grants temporary, explicit access. Friendship alone never grants automatic location access.

## 2. Terminology

- **Friend**: a mutual, accepted relationship. This is not a follower.
- **Friend request**: a pending request that can be accepted, declined, cancelled, or invalidated by a block.
- **Check-in**: an explicit, temporary association between one user and one recognized GathR venue. It is not continuous location tracking.
- **Audience**: either all current friends or an explicit subset of current friends.
- **Friend activity**: a server-generated, viewer-specific projection of check-ins that the viewer is authorized to see.
- **Friend-aware map**: preferred term for the map behavior. “Reactionary map” is avoided because it has an unrelated political meaning.
- **Development build**: an internal APK containing Expo Dev Client. It can attach to Metro and expose development diagnostics.
- **Preview build**: an internal, release-like APK on the EAS `preview` channel. It does not provide the same Metro/debug experience.

## 3. Release 1 scope

The first Android Preview candidate includes all of the following:

- Exact-handle user discovery without exposing email addresses or phone numbers.
- Mutual friend request, accept, decline, cancel, remove, block, and unblock flows.
- Friend list and incoming/pending request UI under Profile; no new bottom tab.
- One active check-in per user.
- Check-in only at a recognized GathR venue.
- Audience choices: all friends or selected friends.
- Mandatory duration with server-controlled expiry.
- Optional short status message with a strict length limit.
- Manual checkout.
- Authorized friend-presence listener.
- Distinct friend halo/bloom, friend count, and preview avatar treatment on map trees.
- Correct venue identification inside multi-venue clusters.
- Friend-presence detail in the existing callout.
- Immediate revocation after checkout, expiry, audience removal, unfriending, blocking, or account deletion.
- In-app request/activity badges.
- Privacy-safe analytics and development diagnostics.
- Complete automated, rules, integration, and Android emulator QA described below.

## 4. Explicitly excluded from Release 1

These are future releases, not unfinished Release 1 work:

- Public check-ins.
- Background or continuous location tracking.
- Radius/geofence auto-checkout.
- Phone contact upload or matching.
- Facebook friend import.
- Friend groups.
- Direct messages or chat.
- Reciprocal “Who’s out?”/Ping requests.
- Remote push notifications for ordinary check-ins.
- Public or private house-party coordinates.
- Check-in rewards.
- Business dashboards, promotions, or identifiable check-in reporting.
- Sharing friends’ event-interest status.

## 5. Non-negotiable safety requirements

- Only authenticated users can use social features.
- Canonical friendship, block, check-in, and activity records are written by backend functions, never directly by arbitrary mobile clients.
- Every social mutation is authenticated, validated, idempotent, and rate-limited.
- A user can only read their own viewer-specific friend activity.
- No viewer can query another user’s raw check-in record.
- Exact email, phone number, and precise device location are not exposed by friend discovery.
- Server timestamps determine relationship and expiry state; device time is display-only.
- Expired activity is hidden immediately by the client even if backend TTL cleanup has not run yet.
- Blocking revokes both users’ projections before the block operation reports success.
- Analytics and production logs contain no names, messages, coordinates, or raw user IDs.
- Account deletion must cascade through social data and be safe to retry.
- Businesses never receive identities, friend relationships, or live locations.

## 6. Repository and worktree isolation

### Current observed state on 2026-08-28

- Mobile checkout: `codex/native-ad-feed-instances-20260812` at `4552dc7`, with unrelated modified and untracked ad/QA files.
- Backend checkout: `codex/address-normalization-hardening-20260807` at `9662304`, with extensive unrelated parser/audit artifacts.
- Neither checkout is safe for direct friends-feature implementation.

### Required isolation gate

- [x] Revalidate both repositories immediately before creating worktrees.
- [x] Select a clean mobile base commit that includes the desired current product state.
- [x] Select a clean backend base commit that includes the currently deployed parser/function baseline.
- [x] Create a mobile sibling worktree, proposed path `C:\Windows\System32\GathR-Project\GathR-friends-presence-20260828`.
- [x] Use proposed mobile branch `codex/friends-presence-20260828`.
- [x] Create a backend sibling worktree, proposed path `C:\Users\craig\Dev\gathr-apps-script-friends-presence-20260828`.
- [x] Use proposed backend branch `codex/friends-presence-backend-20260828`.
- [x] Confirm the original dirty checkouts are unchanged after worktree creation.
- [x] Record selected base commits in the progress log.

Do not copy uncommitted work from either original checkout into the friends worktrees unless it is explicitly reviewed and required.

## 7. Environment and build strategy

### Current emulator constraint

Read-only inspection on 2026-08-28 found:

- Device: `emulator-5554`, AVD `s24`
- Package: `com.craigb.gathr`
- Version: `1.1.10`, version code `13`
- Display: `1080x2400`
- Installed package is **not debuggable**; `run-as` fails.

Therefore the installed package cannot prove Metro adoption or provide the requested iterative debug workflow.

### Required artifact sequence

1. **Development-client prerequisite**
   - Required before genuine on-device Metro debugging.
   - Use EAS profile `development`, which produces an internal Android APK.
   - Preserve app data until APK replacement is explicitly authorized at execution time.
   - If the user requires that absolutely no APK be built before code completion, complete automated/local-emulator testing first and stop before Android UI debugging.

2. **Implementation and Android QA**
   - Use the verified development client with Metro from the isolated mobile worktree.
   - Prove Metro adoption rather than relying on a successful deep link.

3. **Final Preview acceptance artifact**
   - Only after every Release 1 definition-of-done item passes.
   - Use EAS profile `preview`, producing an internal release-like Android APK.
   - This is separate from the development build.

4. **Production**
   - No production build, submission, OTA, Firestore rules deployment, or Functions deployment is authorized by this plan.
   - Production actions require a fresh state check and explicit approval.

No development build can guarantee support for unknown future native modules. Future JavaScript-only features can normally use the same development client; adding a future native dependency requires another build.

## 8. Test environment strategy

Do not use production user accounts and live friendship/check-in collections for feature development.

- [x] Add environment-controlled Firebase emulator connections for Auth, Firestore, and Functions.
- [x] Android emulator connects to the host through `10.0.2.2`.
- [x] Fail closed: emulator routing is enabled only by an explicit development setting and is never silently active in Preview or Production.
- [x] Add Firestore and Auth emulator configuration to the backend `firebase.json`.
- [x] Add `@firebase/rules-unit-testing` and a non-watch integration test command.
- [x] Add deterministic test-persona scripts for Friend A, Friend B, Stranger C, and Blocked D.
- [x] Use the Android app as one persona and a Node test driver as the second persona for real-time cross-user tests on one AVD.
- [ ] Determine whether an existing non-production Firebase project is available for final Preview acceptance.
- [ ] If none exists, stop and request approval before creating or selecting a staging project.

Development-only diagnostics must show:

- Firebase target: local emulator, staging, or production.
- Authenticated user/short UID.
- Friendship listener status and counts.
- Friend-activity listener status and active/expired counts.
- Last social callable name, request ID, duration, and safe error code.
- Current check-in status and expiry countdown.
- Map cluster friend-presence summary.

The diagnostics UI must be unreachable in the Production configuration and must not log private payloads.

## 9. Proposed backend data contract

Names may change during implementation, but changes must be recorded before code and rules diverge.

### Canonical server-controlled documents

`socialRelationships/{sortedUidPair}`

- `members: [uidA, uidB]`
- `status: pending | accepted`
- `requestedBy`
- `createdAt`
- `updatedAt`
- `acceptedAt`

`activeCheckIns/{ownerUid}`

- `ownerUid`
- `venueId`
- `venueLocationKey`
- `venueNameSnapshot`
- `audienceMode: all_friends | selected_friends`
- `audienceUids` for selected mode only
- `message`
- `createdAt`
- `expiresAt`
- `revision`

### Viewer-specific projections

`users/{viewerUid}/friends/{friendUid}`

- Minimal friend profile snapshot and accepted timestamp.
- Server-controlled.

`users/{viewerUid}/friendRequests/{otherUid}`

- Direction, safe profile preview, and request timestamp.
- Server-controlled.

`users/{viewerUid}/friendActivity/{ownerUid}`

- Only the check-in fields required by the viewer’s map.
- Contains `expiresAt` and source `revision`.
- Server-controlled and deleted/replaced transactionally.

`users/{ownerUid}/blocks/{blockedUid}`

- Owner-readable.
- Mutated through a callable so revocation and relationship cleanup are atomic/idempotent.

### Handle lookup

- Do not permit broad client-side profile enumeration.
- Add a callable exact-handle search that returns a minimal authenticated profile preview.
- Add a server-controlled normalized-handle index with transactional uniqueness.
- Normalize case and Unicode consistently and reserve prohibited/confusing handles.

## 10. Proposed callable functions

Every callable requires authentication, schema validation, stable error codes, idempotency, and abuse limits.

- `claimSocialHandle`
- `searchUserByHandle`
- `sendFriendRequest`
- `cancelFriendRequest`
- `acceptFriendRequest`
- `declineFriendRequest`
- `removeFriend`
- `blockUser`
- `unblockUser`
- `createCheckIn`
- `updateCheckIn`
- `checkOut`
- `deleteSocialAccountData`

Service logic must be written as testable pure/domain functions underneath thin callable wrappers.

## 11. Firestore rules plan

- [x] Deny direct client writes to canonical relationship and check-in collections.
- [x] Let a user read only their own `friends`, `friendRequests`, `friendActivity`, and `blocks` projections.
- [x] Deny collection-group leakage from social subcollection names.
- [x] Keep raw active check-ins unreadable to other users.
- [x] Add rules tests for every allowed operation.
- [x] Add rules tests for non-friend, declined, removed, blocked, expired, and cross-user attacks.
- [x] Test forged UIDs, forged audience arrays, forged timestamps, and attempts to write projections directly.
- [x] Verify existing events, likes, interests, page submissions, and private shared-event behavior are unchanged.

The current broad `users/{userId}` owner-write rule must be reviewed so users cannot overwrite future server-controlled social fields in their main profile document.

## 12. Mobile architecture

Proposed files:

- `types/social.ts`
- `services/socialService.ts`
- `store/socialStore.ts`
- `utils/friendPresence.ts`
- `components/social/*`
- `app/friends.tsx`
- `app/check-in.tsx`
- Focused tests beside stores, services, and pure mapping utilities.

Responsibilities:

- Service: callable functions and Firestore listeners.
- Store: normalized local state, listener lifecycle, loading/error state, and immediate expiry filtering.
- Pure utility: join authorized friend activity to stable venue keys and derive cluster annotations.
- UI: friend management, audience selection, check-in, checkout, and privacy explanations.
- Map: render already-derived annotations without querying Firestore inside individual markers.

Guest mode must not start social listeners and must preserve all current limitations and map behavior.

## 13. Friend management implementation

- [x] Add a unique social handle to profile onboarding/editing without changing email authentication.
- [x] Add exact-handle search.
- [x] Add request, cancel, accept, and decline flows.
- [x] Add Friends and Requests sections under Profile.
- [x] Add remove-friend confirmation.
- [x] Add block/unblock and report entry points.
- [x] Make duplicate and crossed requests resolve deterministically.
- [x] Make every mutation safe to retry after a network timeout.
- [x] Add empty, loading, offline, error, and stale-data states.
- [x] Add accessible labels and predictable Android back behavior.

## 14. Check-in implementation

- [x] Entry point from the map without adding a bottom tab.
- [x] Venue search/selection uses recognized GathR venue identity.
- [x] Do not allow arbitrary latitude/longitude or a home address in Release 1.
- [x] Audience selector supports all friends and selected friends.
- [x] Confirmation states exactly how many people can see the check-in and until when.
- [x] Duration choices use server-validated limits.
- [x] Optional message has a strict length limit and is visible only to authorized viewers.
- [x] One active check-in per user; replacing it requires confirmation.
- [x] Manual checkout is always available while active.
- [x] Check-in expires locally on time even while offline.
- [x] Server cleanup removes stale canonical and projection documents.
- [x] Editing audience revokes removed viewers before success is shown.

## 15. Friend-aware map implementation

The existing inner canopy size continues to represent event interest. The existing radiating effect continues to mean an event is happening now.

- [x] Extend the cluster type with optional derived friend-presence metadata.
- [x] Join friend activity by `venueLocationKey` after ordinary event clustering.
- [x] Do not create a second friend clustering engine.
- [x] Add a distinct blue/teal outer halo or capped outer-canopy bloom.
- [x] Add a friend/avatar badge and count, capped visually at `3+` if needed.
- [x] Do not imply that a friend is standing at a multi-venue cluster centroid.
- [x] Identify the exact venue in the multi-venue callout selector.
- [x] Add friend-presence detail to the callout without displacing event/special details.
- [x] Recompute annotations correctly across zoom-band cluster changes.
- [x] Remove the visual immediately after local expiry or listener revocation.
- [ ] Preserve marker tap guards, haptics, hotspot behavior, new-content indicators, city effects, ads, and callout performance.
- [x] Update the map legend/tutorial only after the final visual behavior is stable.

## 16. Revocation and account lifecycle

- [x] Checkout removes every viewer projection for the active revision.
- [x] Audience edit removes revoked viewers and adds only newly authorized viewers.
- [x] Unfriending removes activity in both directions.
- [x] Blocking removes pending requests, accepted friendship, and activity in both directions.
- [x] Expiry hides data immediately and backend cleanup is idempotent.
- [x] Account deletion calls an idempotent social cleanup operation before Auth deletion.
- [x] Add an orphan-cleanup fallback for partially completed account deletion.
- [x] Update the current mobile deletion flow, which presently deletes only the main user document and profile image.

## 17. Analytics and observability

Track safe product events such as:

- Friend search completed/empty.
- Request sent/accepted/declined/cancelled.
- Friend removed or blocked.
- Check-in screen opened/created/edited/checked out/expired.
- Audience mode and audience count bucket, never audience identities.
- Friend-aware cluster shown/tapped.
- Venue detail opened from friend presence.
- Social callable success/error code and duration.

Never send handle, name, UID, message, venue coordinates, or friend list to analytics.

## 18. Automated test plan

### Backend unit tests

- [x] Pair-ID ordering and crossed-request behavior.
- [x] Handle normalization and uniqueness.
- [x] Relationship state machine and idempotency.
- [x] Audience resolution.
- [x] Check-in validation and server-time expiry.
- [x] Projection diffing for create/edit/checkout.
- [x] Block and deletion cascades.
- [x] Rate-limit and safe-error mapping.

### Firestore rules tests

- [x] Owner reads own projections.
- [x] Other users cannot read or write those projections.
- [x] Raw check-ins cannot be read by friends or strangers.
- [x] Direct projection and relationship writes fail.
- [x] Existing non-social access contracts remain valid.

### Functions emulator integration tests

- [x] Full request-to-accepted-friend lifecycle.
- [x] Duplicate/crossed requests.
- [x] All-friends and selected-friends check-ins.
- [x] Stranger and excluded-friend isolation.
- [x] Checkout, expiry, unfriending, and block revocation.
- [x] Retry after simulated network timeout.
- [x] Account deletion cleanup.

### Mobile unit/component tests

- [x] Social store listener lifecycle.
- [x] Expiry timer and app foreground reconciliation.
- [x] Friend activity to venue/cluster join.
- [x] Single-venue and multi-venue cluster annotations.
- [x] Zoom changes and stable venue keys.
- [x] Audience count/confirmation copy.
- [x] Guest and signed-out cleanup.
- [x] Existing map expiry, dedupe, family, ads, and store tests remain green.

### Required static commands

- [x] Mobile TypeScript check.
- [x] Mobile lint.
- [x] Mobile Jest in non-watch mode.
- [x] Backend TypeScript build.
- [x] Backend lint for changed files.
- [x] Backend unit/integration suites.
- [x] Firebase rules tests.
- [x] `npm run verify:mapbox` before any build or OTA.

## 19. Android emulator QA matrix

All QA uses the existing `s24` AVD without clearing app data unless separately authorized.

- [ ] Record device ID, package version, runtime, and active bundle authority.
- [ ] Prove the app is using Metro from the isolated worktree during development QA.
- [ ] Friend A claims a handle.
- [ ] Friend A finds Friend B by exact handle.
- [ ] Send, cancel, resend, accept, decline, and crossed-request paths.
- [ ] Stranger C cannot read friendship or activity data.
- [ ] Friend A checks into a recognized venue for each supported duration.
- [ ] Verify all-friends and selected-friends visibility.
- [ ] Verify excluded Friend B learns nothing.
- [ ] Verify the correct map halo/count appears without changing event-interest size.
- [ ] Verify single-venue and multi-venue callouts name the correct venue.
- [ ] Verify map zoom, pan, cluster tap, retap, close, hotspot, filters, events, specials, and ads regressions.
- [ ] Verify checkout removes the marker without restarting the app.
- [ ] Verify expiry while foregrounded, backgrounded, offline, and after cold restart.
- [ ] Verify unfriend and block revoke active visibility immediately.
- [ ] Verify logout/login does not leak the prior user’s friend activity.
- [ ] Verify account deletion cascade with test personas.
- [ ] Verify TalkBack/accessibility labels, large text, dark/light theme, and Android back behavior.
- [ ] Capture screenshots and short recordings for every major state.
- [ ] Record logs without private payloads.

## 20. Performance and reliability gates

- [x] Friend-activity updates do not trigger an event refetch.
- [x] No Firestore listener is created per map marker.
- [x] Listener count is constant relative to marker count.
- [ ] Map interaction and callout timing remain within the current regression tolerance.
- [ ] Test 0, 1, 10, 50, and 200 friends with realistic active-check-in ratios.
- [ ] Test rapid zoom/pan while activity changes.
- [ ] Test stale cache and reconnect without unauthorized data flashing.
- [ ] Test backend partial failures and function retries.
- [ ] Verify Firestore read/write estimates before staging or production rollout.

## 21. Definition of done for the final Android Preview candidate

All items below must be true:

- [ ] Every Release 1 feature is implemented.
- [ ] All automated, rules, integration, and static tests pass from clean worktrees.
- [ ] Complete Android emulator matrix passes.
- [ ] Privacy/abuse review has no unresolved high-severity finding.
- [ ] Account deletion and revocation are proven end to end.
- [ ] No existing map, event, special, guest, profile, tutorial, deep-link, or ad regression remains.
- [ ] Backend and mobile commits are recorded and reviewable.
- [ ] `npm run verify:mapbox` passes in the exact build worktree.
- [ ] The selected Firebase target and EAS channel are documented.
- [ ] A fresh Android `development` APK is built if needed for the reusable debug client.
- [ ] A separate Android `preview` APK is built for release-like acceptance.
- [ ] Replacing the emulator APK is explicitly authorized and performed with app-data preservation where compatible.
- [ ] The installed artifact’s version, channel, runtime, and observed behavior are recorded.

## 22. Future releases unlocked by this foundation

These remain planned but do not block Release 1:

### Release 1.1

- Reciprocal “Who’s out?”/share-location request with no disclosure on decline.
- Remote friend-request and direct-share notifications.
- HTTPS friend invite links and QR-code scanning.
- Friend-visible event interest with separate privacy controls.

### Release 1.2

- Friend groups and reusable audience lists.
- Lightweight event plans/invitations without full chat.
- Optional venue-verified rewards.

### Later business product

- Verified business profiles.
- Self-service event/special publishing.
- Sponsored placement and offer redemption.
- Delayed, privacy-thresholded aggregate analytics.
- No identities, friend graph access, or live location access for businesses.

## 23. Execution order

Do not skip ahead because a later UI can be mocked.

1. Worktree and clean-baseline gate.
2. Local Firebase emulator and rules-test foundation.
3. Data contract and pure backend services.
4. Callable functions and security rules.
5. Backend/rules integration proof with multiple personas.
6. Mobile social types, service, and store.
7. Friend-management UI.
8. Check-in UI and lifecycle.
9. Map projection and visual treatment.
10. Revocation, account deletion, analytics, and diagnostics.
11. Full automated regression suite.
12. Android development-client QA.
13. Performance, privacy, and accessibility review.
14. Final development and Preview APK gates.
15. Stop before production deployment and request explicit approval.

## 24. Progress log

Append one entry after every completed phase. Include date, worktree, branch, commit, tests, emulator/runtime evidence, remaining risks, and the next unchecked item.

### 2026-08-28 — Planning baseline

- Historical product material reviewed.
- Current mobile and backend repository states inspected read-only.
- Current EAS `development`, `preview`, and `production` profiles inspected.
- Existing `s24` emulator verified as `emulator-5554` with `com.craigb.gathr` 1.1.10 (13).
- Installed emulator package is not debuggable, so an Expo development-client artifact is required before Metro-based Android debugging.
- No friends/check-in implementation, build, APK replacement, OTA, Firebase deployment, or production mutation performed.

### 2026-08-28 — Isolation and automated implementation gate

- Mobile worktree: `C:\Windows\System32\GathR-Project\GathR-friends-presence-20260828`; branch `codex/friends-presence-20260828`; base `4552dc796cf5f353427efa0d6acdd8eec64c3076`.
- Backend worktree: `C:\Users\craig\Dev\gathr-apps-script-friends-presence-20260828`; branch `codex/friends-presence-backend-20260828`; base `9662304cacfb19f45f623ce17e017b27d50a18b0`.
- Original dirty source checkouts were not used for feature code; the implementation plan exists only in the isolated mobile worktree.
- Implemented canonical server-owned relationships, exact unique handles, blocks, reports, active check-ins, viewer-specific projections, expiry cleanup, profile projection sync, and Auth-deletion fallback.
- Implemented authenticated/rate-limited callable surface. `createCheckIn` intentionally replaces the single active check-in and serves the proposed update use case; a separate `updateCheckIn` callable was not added because it would duplicate the same transactional contract.
- Implemented fail-closed Firestore rules plus local Auth, Firestore, and Functions emulator routing. Preview and Production have emulator routing disabled.
- Implemented mobile friend/request management, recognized-venue check-in/checkout, audience and expiry controls, local expiry pruning, account cleanup, friend-aware cluster halo/badge, exact multi-venue callout presence, legend treatment, privacy-safe analytics, and a development-only social diagnostics panel.
- Backend compiled suite: 365/365 passed. Social service integration: 15/15 passed. Firestore rules: 7/7 passed. Authenticated callable and Auth-deletion fallback emulator tests: 2/2 passed, including a duplicate check-in request returning the original revision.
- Mobile: TypeScript passed; Jest 105/105 passed; lint 0 errors and the unchanged baseline of 256 warnings. The pre-existing React 19 snapshot test was repaired to use `act`, eliminating the former sole regression-suite failure.
- Focused social/map mobile tests: 13/13 passed, including 0, 1, 10, 50, and 200 friend projection sizes.
- Backend changed-file lint now has an ESLint 9 flat configuration and passes for `src/social/*.ts`.
- The Functions emulator command now sets its required 60-second discovery timeout explicitly; the repository's full parser export surface can exceed Firebase's ten-second default.
- Check-in mutation retries now use a server-validated idempotency token; identical retries return the original revision/expiry, conflicting reuse fails closed, and expired operation/rate-limit records are scheduled for cleanup.
- `npm run verify:mapbox` passed in the exact mobile worktree after linking its ignored `.env.local` to the existing source-checkout file without copying or printing the token.
- No Firebase deployment, production data mutation, EAS build, APK replacement, OTA, or Preview artifact occurred in this phase.
- Next unchecked gate: `npm run verify:mapbox`, checkpoint commits, development APK, then the Android emulator matrix.
