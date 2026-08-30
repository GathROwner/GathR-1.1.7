# Friends, Check-Ins, and Friend-Aware Map Implementation Plan

Status: **Release 1 is live on iOS Production. Release 2 is implemented and accepted on Android Preview; iOS Preview build 78 is complete and awaiting physical-device acceptance. Production remains a separate release decision.**

Created: **2026-08-28**
Primary mobile repository: `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`
Primary backend repository: `C:\Users\craig\Dev\gathr-apps-script\functions`
Mobile implementation worktree: `C:\Windows\System32\GathR-Project\GathR-friends-presence-20260828`
Backend implementation worktree: `C:\Users\craig\Dev\gathr-apps-script-friends-presence-20260828`
Release 2 mobile worktree: `C:\Windows\System32\GathR-Project\GathR-friend-events-20260830`
Release 2 backend worktree: `C:\Users\craig\Dev\gathr-apps-script-friend-events-20260830`

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
- Primary app screens should keep their essential information and actions inside one phone viewport. Event feeds, specials feeds, and callout content may scroll; variable relationship, venue, friend-picker, and secondary settings content must use bounded internal scrolling. Any future full-page scrolling exception requires a concrete usability reason.
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
   - The isolated `gathr-social-staging` project is the Preview acceptance target; it does not share social data or deployed functions with either production GathR project.
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
- [x] Determine whether an existing non-production Firebase project is available for final Preview acceptance.
- [x] Create and document the isolated `gathr-social-staging` target after no suitable existing project was found.

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

### Fixed-screen UI contract

GathR screens should behave like focused mobile dashboards, not vertically stacked documents.

- The primary state, context, and action of Profile, setup, preferences, Friends, and Check-in screens must fit within one phone viewport at the supported default text size.
- Event/special feeds and map callouts may scroll because their content is intentionally open-ended.
- Unbounded relationship, venue, and audience collections must scroll only inside a clearly bounded list or focused picker; they must not lengthen the parent page.
- Secondary or advanced controls may open a focused sheet. The sheet should fit one viewport when collapsed and may scroll internally only when variable or expanded content requires it.
- Large-text QA is required. Primary labels and actions must remain visible; secondary copy may be capped modestly or shortened, but essential text must not be hidden.
- Any future exception must be deliberate, documented, and tested on the target phone rather than introduced by stacking another card below the fold.

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
- [x] Keep handle, search, relationship tabs, and the active relationship panel in one fixed viewport; scroll only the bounded relationship list.

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
- [x] Keep venue, duration, audience, note, visibility summary, and confirmation in one fixed viewport; use focused venue/friend pickers for variable lists.

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
- [x] Preserve marker tap guards, haptics, hotspot behavior, new-content indicators, city effects, ads, and callout performance in normal-paced development-client use.
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

- [x] Record device ID, package version, runtime, and active bundle authority.
- [x] Prove the app is using Metro from the isolated worktree during development QA.
- [x] Friend A claims a handle.
- [x] Friend A finds Friend B by exact handle.
- [x] Send, cancel, resend, accept, decline, and crossed-request paths are covered across Android UI QA and emulator-backed callable/service integration.
- [x] Stranger C cannot read friendship or activity data through the same emulator rules surface.
- [x] Friend A completes recognized-venue check-in flows on device; 30 minutes is device-proven and 60/120 minutes are domain/integration-proven.
- [x] Verify all-friends and selected-friends visibility.
- [x] Verify an excluded accepted friend learns nothing in the integration suite; device diagnostics also show zero disclosure to non-viewers.
- [x] Verify the correct map halo/count appears without changing event-interest size.
- [x] Verify single-venue and multi-venue callouts name the correct venue.
- [x] Verify normal-paced map pan, cluster selection, exact-venue switching, close/reopen behavior, events, specials, and ad rendering regressions; automated map suites cover expiry/dedupe/family behavior.
- [x] Verify checkout removes the marker without restarting the app.
- [x] Verify foreground expiry and cold restart on device; background/offline expiry pruning and signed-out cleanup are covered by deterministic store tests.
- [x] Verify unfriend and block revoke active visibility immediately.
- [x] Verify logout/login cleanup does not retain the prior user’s friend activity through the listener lifecycle/store suite and authenticated route QA.
- [x] Verify account deletion cascade with emulator test personas and the live isolated-staging Auth deletion smoke test.
- [x] Verify accessibility roles/labels, 1.3x system text, explicit light-screen status-bar contrast, and Android back/close behavior on the `s24` AVD.
- [x] Capture screenshots for every major implemented state; a release-candidate recording remains optional evidence.
- [x] Record logs without private social payloads.

## 20. Performance and reliability gates

- [x] Friend-activity updates do not trigger an event refetch.
- [x] No Firestore listener is created per map marker.
- [x] Listener count is constant relative to marker count.
- [x] Normal-paced map interaction and friend-presence callout rendering remain within the current development-client regression tolerance.
- [x] Test 0, 1, 10, 50, and 200 friend projections in deterministic mobile tests.
- [x] Test rapid zoom/pan while activity changes.
- [x] Test stale cache and reconnect without unauthorized data flashing.
- [x] Test backend partial failures and function retries.
- [x] Verify Firestore read/write estimates before staging or production rollout.

Firestore operation estimates at the enforced 200-viewer ceiling:

- The app uses five constant social listener targets per signed-in user: friends, requests, friend activity, blocks, and the user's own active check-in. The count does not grow with map markers. Initial returned documents are `friends + requests + authorized activity + blocks + optional own check-in`; the largest deterministic test case returns 200 friends plus 200 authorized activity projections before empty-query billing minimums.
- An all-friends check-in for `N` candidates performs approximately `4N + 4` backend document reads: the audience query, four base documents, and relationship/two-way-block validation. Selected-friends mode performs `3N + 4` reads because it does not query the full friend list. At `N = 200`, those are 804 and 604 reads respectively.
- A new check-in writes `N + 2` documents: the canonical check-in, one viewer projection per authorized friend, and the idempotency record. Replacing a prior check-in writes/deletes `P + N + 2`; with both old and new audiences at the 200-person ceiling, the maximum is 402 atomic writes.
- Checkout reads the canonical check-in and deletes `N + 1` documents, at most 201. A pending friend request uses five transaction reads and three writes; acceptance uses five reads and five writes. Remove-friend uses three reads and seven to nine writes; block uses three reads and eight to ten writes, depending on whether either active check-in requires a viewer-list update.
- One check-in revision delivers at most `N + 1` changed documents to active listeners: one projection per viewer and the owner's canonical check-in. The callable is rate-limited to 20 check-in mutations per user per hour. The operation ceiling is safe for Release 1, but a later audience limit increase requires a new cost and atomic-write review.

## 21. Definition of done for the final Android Preview candidate

All items below must be true:

- [x] Every Release 1 feature is implemented in isolated reviewable worktrees.
- [x] All automated, rules, integration, and static feature gates pass.
- [x] Complete Android emulator matrix passes.
- [x] Privacy/abuse review has no unresolved high-severity finding.
- [x] Account deletion and revocation are proven end to end in local emulators and isolated staging.
- [x] No existing map, event, special, guest, profile, tutorial, deep-link, or ad regression remains in automated and normal-paced device QA.
- [x] Backend and mobile commits are recorded and reviewable.
- [x] `npm run verify:mapbox` passes in the exact build worktree.
- [x] The selected Firebase target (`gathr-social-staging`) and EAS `preview` channel are documented and fail closed away from local emulators.
- [x] A fresh Android `development` APK is built for the reusable debug client.
- [x] A separate Android `preview` APK is built for release-like acceptance.
- [x] Replacing the emulator APK was authorized by the implementation request and performed with `adb install -r`; app data and the signed-in session were preserved.
- [x] The installed artifact’s version, channel, runtime, and observed behavior are recorded.

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
- Mobile: TypeScript passed; Jest 106/106 passed; lint 0 errors and the unchanged baseline of 256 warnings. The pre-existing React 19 snapshot test was repaired to use `act`, eliminating the former sole regression-suite failure.
- Focused social/map mobile tests: 13/13 passed, including 0, 1, 10, 50, and 200 friend projection sizes.
- Backend changed-file lint now has an ESLint 9 flat configuration and passes for `src/social/*.ts`.
- The Functions emulator command now sets its required 60-second discovery timeout explicitly; the repository's full parser export surface can exceed Firebase's ten-second default.
- Check-in mutation retries now use a server-validated idempotency token; identical retries return the original revision/expiry, conflicting reuse fails closed, and expired operation/rate-limit records are scheduled for cleanup.
- `npm run verify:mapbox` passed in the exact mobile worktree after linking its ignored `.env.local` to the existing source-checkout file without copying or printing the token.
- No Firebase deployment, production data mutation, EAS build, APK replacement, OTA, or Preview artifact occurred in this phase.
- Next unchecked gate: the development APK and Android emulator matrix.

### 2026-08-28 — Reviewable checkpoints

- Backend checkpoint: `8b56a47` (`feat: add friends and venue check-in backend`) on `codex/friends-presence-backend-20260828`.
- Mobile checkpoint: `ebb5104` (`feat: add friend-aware check-ins and map presence`) on `codex/friends-presence-20260828`.
- Both checkpoint worktrees were clean after commit apart from intentionally ignored local emulator/build environment links and placeholders.
- No remote push, deployment, OTA, APK install, or production mutation was performed by the checkpoint operation.
- Next gate: build the internal Android development client, install it with app-data preservation, prove Metro authority from this worktree, and execute the emulator QA matrix.

### 2026-08-28 — Android development-client implementation and QA gate

- EAS development build `857ae2b5-daa2-4f53-9df5-dd38c7c89051` finished for Android version `1.1.10` (13), runtime `1.1.10`, from mobile commit `b8984d59b5082111a1e892a8d7f67bc244b6b3ac`.
- Build page: `https://expo.dev/accounts/craigb/projects/gathr/builds/857ae2b5-daa2-4f53-9df5-dd38c7c89051`.
- Preserved local artifact: `artifacts\android\gathr-friends-development-857ae2b5.apk`, 281,539,725 bytes, SHA-256 `C8B1B07B0287C02A3124B5BFF862017C9041EAD5955DB1BB7DD985B8D02666B1`.
- Installed on `emulator-5554` / `s24` with `adb install -r`; `run-as com.craigb.gathr` succeeded, proving the debuggable development-client package while preserving app data.
- Metro served from `C:\Windows\System32\GathR-Project\GathR-friends-presence-20260828`, with `adb reverse tcp:8081 tcp:8081`, social enabled, and Auth/Firestore/Functions routed explicitly to the local `demo-gathr-social` emulators at `10.0.2.2`.
- Development diagnostics proved five constant social listeners, all five reaching server state; no per-marker listener was introduced.
- Device flows passed for exact-handle friendship, request/accept, removal, block/unblock, all-friends and selected-friends check-ins, privacy counts, current check-in persistence, manual checkout, foreground expiry, cleanup, and cold force-stop/restart without clearing data.
- The selected-audience device check-in exposed Alice only to Bob. Casey and Dana had zero activity projections. Blocking Alice/Bob preserved their private canonical check-ins but synchronously reduced both viewer lists to zero; unblocking did not silently restore friendship or retroactively expose an existing check-in.
- The real map displayed a teal friend halo, count, accessible cluster label, and exact Old Triangle friend callout inside an ordinary multi-venue map cluster. Checkout and expiry removed the friend-aware annotation without an app reinstall.
- A real-device venue-identity defect was found: current map clusters use stable signature keys while the backend correctly accepts canonical venue IDs. The join now keys authorization by the single canonical venue ID and writes the derived annotation under the existing map grouping key. Scoped/area and ambiguous multi-ID venues fail closed. Focused regression tests cover both sides of this contract.
- An authenticated-route defect was found and fixed so `/friends` and `/check-in` are no longer redirected to the map. A reused-stack defect was also fixed so the success dialog’s **View map** action uses an explicit map replacement instead of navigating backward to another check-in screen. The corrected action was device-proven after a fresh 30-minute check-in.
- Final local QA state was clean: one Alice/Bob friendship, no blocks, no requests, zero canonical check-ins, and zero viewer activity projections.
- Final automated gates after the device fixes: mobile TypeScript passed; Jest 15/15 suites and 106/106 tests passed; lint passed with 0 errors and 256 pre-existing warnings; Mapbox verification passed. Backend build and 365/365 compiled tests passed; scoped social lint passed; Firestore rules 7/7 passed; service integration 15/15 passed; callable/Auth E2E 2/2 passed.
- Repository-wide backend lint still reports 322 pre-existing parser/service errors outside the social feature. The changed social TypeScript files pass the repository’s scoped lint command. Firebase also warns that its next major CLI will require Java 21; current emulator gates pass on Temurin 17.0.19.
- During deliberately rapid repeated route automation combined with development fast refresh, native Mapbox emitted a `ViewTagResolver` soft exception and Android reported an ANR. A clean force-stop/restart recovered with auth and data intact, and the issue did not reproduce during normal-paced steady-state social/map flows. Treat this as a development-client stress observation requiring a Preview soak, not as a proven social-feature regression.
- The existing full production event refresh remained slow on some cold starts (up to roughly two minutes), although persisted map data rendered first. This is pre-existing and is not caused by friend-activity updates, which do not refetch events.
- No Firebase rules/functions deployment, production social write, Preview build, OTA, or store action occurred.
- Preview remains blocked because the current `preview` profile enables social features while disabling emulators, which points the app at the production Firebase configuration. The next decision is either to provide/select a staging Firebase project or explicitly authorize the reviewed social Functions/rules/index deployment before a Preview APK is built.

### 2026-08-28 — Isolated staging, UX polish, and release-hardening gate

- Created Firebase project `gathr-social-staging` in `northamerica-northeast1`, linked it to the same verified billing account as the existing GathR projects, enabled email/password Auth, created Firestore with deletion protection, and applied seven-day Artifact Registry cleanup policies. No production Firebase project was modified.
- Registered separate Android and web staging apps. The EAS `preview` profile now explicitly selects staging Firebase configuration and continues to disable local emulator routing.
- Added an isolated `gathr-social-staging` Functions codebase and deployment entrypoint so staging deploys only the social surface instead of analyzing or deploying parser functions. Firestore rules and the minimal staging index contract were deployed separately.
- All 16 staging functions reached `ACTIVE`: 13 authenticated callables, scheduled check-in cleanup, profile projection sync, and Auth deletion cleanup.
- Live staging smoke passed all 13 callables plus profile sync, check-in visibility, blocked-profile snapshots, and Auth deletion cleanup. Seeded 154 public recognized-venue identities and two removable Preview QA personas; no production social/user data was copied.
- Polished the Friends screen with exact relationship states, separate received/sent requests, disabled invalid actions, clear privacy copy, profile-based block rows, accessible controls, and responsive long-handle treatment.
- Polished the Check-in screen with a compact active state, View map/Change/Check out actions, an explicit editing state, capped initial venue results, audience validation, accessible choice controls, and friend-selection pruning.
- Android visual evidence was captured under `artifacts\android\qa-polish`. Normal and 1.3x text screenshots passed for Friends and Check-in; the final real-map callout shows `Bob Friend B is here` at The Old Triangle with the authorized message.
- Final source gates after polish passed: mobile TypeScript, Jest 15/15 suites and 106/106 tests, lint with 0 errors and 256 existing warnings, Mapbox verification, and diff whitespace checks; backend TypeScript/365 compiled tests, Firestore rules 7/7, social integration 15/15, callable/Auth E2E 2/2, scoped social lint, and diff whitespace checks.
- Live backend staging smoke remained green, and the durable backend staging checkpoint is `7e70d07` (`chore: add isolated social staging environment`).
- Next gate: commit the mobile staging/polish checkpoint, build the release-like Android Preview APK, install it with app-data preservation, and verify the real staging target on `s24`.

### 2026-08-28 — Release-like Preview checkpoint

- Mobile staging/polish checkpoint `77fb943` (`feat: polish social preview and target staging`) built successfully as EAS Android Preview build `86409035-aa50-4510-bf90-f0a8a930846e`.
- The preserved APK is `artifacts\android\gathr-friends-preview-86409035.apk`, 227,340,463 bytes, SHA-256 `0D29ADA79EE25490BC8FF8F5065401F42FCC0225F33642C5C67395096F859491`.
- Installed with `adb install -r` on `emulator-5554` / `s24` without clearing data. The package was release-like and non-debuggable, and launched the embedded Preview bundle without Metro or Dev Launcher.
- Preview authenticated against `gathr-social-staging`, rendered the seeded Alice/Bob friendship, and showed Bob's authorized friend-presence map reaction.
- This artifact became a QA checkpoint rather than the final candidate after the fixed-screen product rule was added.

### 2026-08-28 — Fixed-screen dashboard iteration

- Replaced the document-style Friends page with fixed handle/search controls plus Requests, Friends, and Blocked tabs sharing one bounded relationship panel. Handle editing now uses a focused modal.
- Replaced the document-style Check-in form with one fixed control surface. Recognized venues and selected-friend audiences now use focused, internally scrollable pickers.
- Converted the Profile page into a fixed dashboard containing identity, email, Edit Profile, Interests, Friends, Check In, Replay Tutorial, and More. Preferences, sharing, Facebook page submission, and account actions moved into a compact focused sheet.
- Converted Interest Selection into a fixed three-column grid with persistent Cancel/Save actions; long category names no longer clip at 1.3x Android text size.
- Normal and 1.3x emulator screenshots are stored under `artifacts\android\qa-fixed-screen`; the Profile dashboard, Profile editor, Interests, Friends, Check-in, venue/friend pickers, and More sheet keep their primary actions inside one `1080x2400` viewport.
- Final local source gates passed after the fixed-screen changes: TypeScript, Jest 15/15 suites and 106/106 tests, lint with 0 errors, Mapbox runtime verification, and whitespace checks. The final Preview build and release-like staging acceptance remain to be run against the fixed-screen commit.

### 2026-08-29 — Final composite Android Preview acceptance

- Created clean composite release worktree `C:\Windows\System32\GathR-Project\GathR-friends-preview-ota-20260829` on `codex/friends-preview-ota-20260829`, based on the exact previously live Preview commit `54d2c9944d09fbb627b459f60aaa027b7d92234e`. The base remains a verified ancestor of the final code commit `761a6bd1927423411d1623b921bb03976444f428`.
- Preserved the current live tutorial, profile, map, route/area, cache, and startup work while integrating the complete friends/check-in feature. Restored one live-referenced cache-policy module and repaired the current Profile import/test baseline during integration.
- Built release-like Android Preview build `2e5c4e00-c386-49d0-8aa7-0d6204172324`, version `1.1.10` (13), runtime `1.1.10`. Build page: `https://expo.dev/accounts/craigb/projects/gathr/builds/2e5c4e00-c386-49d0-8aa7-0d6204172324`.
- Preserved APK: `artifacts\android\gathr-friends-definitive-preview-2e5c4e00.apk`, 227,353,599 bytes, SHA-256 `5E736606BCFF273A5DD821BC344D77512EB7C5EF4886AAC07C15CAD9438E3863`. Installed on `emulator-5554` / `s24` with `adb install -r`; package data and the authenticated staging session were preserved. The package is non-debuggable, proving release-like Preview authority rather than Metro authority.
- Final Android-only Preview OTA group `1c4ddabd-9e4d-44de-a69f-4fb572ad48a4`, update `01a04bd9-7e2a-7acc-b19f-cb8f54a21263`, runtime `1.1.10`, commit `761a6bd1927423411d1623b921bb03976444f428`. Dashboard: `https://expo.dev/accounts/craigb/projects/gathr/updates/1c4ddabd-9e4d-44de-a69f-4fb572ad48a4`.
- Device adoption is definitive: first launch logged the exact update ID as available and `DownloadComplete`; the second launch logged `No update available`; the Profile footer rendered `Runtime 1.1.10 · OTA 01a04bd9` with Preview Alice, one friend, Friends, Check in, and More. The EAS fingerprint-discovery warning is advisory for this artifact because actual download and adoption were observed on the installed matching-runtime build.
- Two earlier same-session Preview groups were immediately superseded after device QA caught incomplete environment loading: `76c4c346-f2da-4501-b4f8-dbd9f5b82da9` omitted the Preview Firebase target, and `10dd7d32-76d0-419b-934f-aa3c17ce138d` omitted the social feature flag. No production write or deployment occurred. The final publish loaded every `eas.json` Preview environment value and used `gathr-social-staging` with social enabled and local emulators disabled.
- Added a final privacy hardening at `761a6bd`: cached Firestore friend-activity projections are never rendered. A cold offline launch showed no cached friend marker; after connectivity returned, the server-authoritative listener restored the teal halo and `F1` badge. The emulator radio took roughly two minutes to reconnect, but no unauthorized presence flashed during the gap.
- Rapid pan/zoom and overlapping cluster selections were exercised while the staging Bob check-in revision changed. The app remained responsive, the exact Old Triangle callout retained `Preview Bob is here` and `Preview map reaction QA`, and release-like logs contained no fatal exception, ANR, or Mapbox `ViewTagResolver` error.
- Fixed-screen acceptance passed at `1080x2400`: Profile, Friends, Check-in, and Interests keep primary actions within one phone viewport. Friends scrolls only its bounded relationship list; Check-in uses focused bounded venue/friend pickers; More is a bounded secondary sheet; event/special feeds and callout content remain the intended scrolling surfaces.
- Final screenshots are stored in `artifacts\android\qa-friends-preview-ota-76c4c346`. Key evidence includes `05-friends-final-ota.png`, `06-check-in-final-ota.png`, `07-interests-final-ota.png`, `08-more-final-ota.png`, `10-map-friend-callout.png`, `14-profile-privacy-ota.png`, `16b-offline-cold-start.png`, `17-reconnect-authoritative-presence.png`, and `18-rapid-activity-map.png`.
- Final mobile gates: TypeScript passed; Jest 51/51 suites, 300/300 tests, and 1/1 snapshot passed; lint passed with 0 errors and 222 existing warnings; Mapbox runtime verification and `git diff --check` passed. The OTA preflight confirmed the clean `codex/` release branch, dependencies, Mapbox token, target branch/platform, and live-base ancestry.
- Firestore sizing was reviewed at the enforced 200-viewer cap. Five client listener targets remain constant, a largest replacement check-in is 402 writes, and checkout is at most 201 deletes. The operation-level estimates are recorded in the performance section above.
- Production Firebase, Production EAS, app-store tracks, and production user data were untouched. The isolated staging Alice/Bob personas and two-hour Bob check-in remain removable QA data.
- Release 1 has no unchecked definition-of-done item. The pre-existing cold production event refresh can still take substantially longer than the friend listener and remains separate startup-performance debt; persisted map data renders first and friend-activity changes do not trigger an event refetch.

### 2026-08-29 — Production backend and iOS OTA release

- Production deployment was performed only after explicit user authorization and targeted the mobile app's Firebase project `gathr-m1`. The parser project and `gathr-functions` codebase were not selected or changed.
- Backed up the pre-deploy Firestore rules and indexes under `C:\Users\craig\Dev\gathr-production-backups\friends-social-20260829\gathr-m1-2026-08-29T11-05-28-548Z`. The reviewed production rules preserved all existing custom-claim admin, crowdsourcing, event, engagement, and page-submission behavior while adding the social protections.
- Deployed the isolated `gathr-social` codebase, production Firestore rules, and index addition after a clean dry run. The post-deploy backup is `C:\Users\craig\Dev\gathr-production-backups\friends-social-20260829\gathr-m1-2026-08-29T11-25-21-186Z`; its rules match the reviewed source exactly, the existing `pageSubmissions` composite remains present, and the new `blocks.blockedUid` collection-group index is present.
- Production initially had zero recognized venue documents even though the live event API exposed 650 active events across 151 canonical venue IDs. This would have made every production check-in fail correctly but unusably. Added `scheduledSocialVenueMirror`, which refreshes those recognized venue identities every six hours and marks them invalid after 24 hours so check-in validation fails closed if synchronization stops.
- Removed the social exports from the parser entrypoint and moved callable emulator discovery to the isolated social configuration. This prevents a future parser deployment from claiming or replacing the production social function names.
- Backed up the empty pre-mirror venue state at `C:\Users\craig\Dev\gathr-production-backups\friends-social-20260829\gathr-m1-venues-2026-08-29T11-39-30-596Z`, invoked the exact Cloud Scheduler job, and verified 151/151 mirrored venue documents with names and a common future expiry. The post-sync venue backup is `C:\Users\craig\Dev\gathr-production-backups\friends-social-20260829\gathr-m1-venues-2026-08-29T11-45-25-058Z`.
- Final backend state is 17/17 functions `ACTIVE` in codebase `gathr-social`: 13 authenticated callables, check-in cleanup, venue-mirror synchronization, profile projection synchronization, and Auth-deletion cleanup. A one-day Artifact Registry cleanup policy is set for the new `us-central1` build-artifact repository.
- Final backend gates passed: TypeScript build; 367/367 compiled tests; 11/11 merged production-rule tests; 16/16 social integration tests; 2/2 isolated callable/Auth tests; scoped TypeScript and script lint; rules/index compilation; and whitespace checks. The guarded live production smoke exercised all 13 callables, both check-in audience modes, blocking, profile synchronization, Auth deletion, and record cleanup, then verified that every temporary profile, handle, check-in, report, and Auth account was removed.
- Enabled `EXPO_PUBLIC_SOCIAL_FEATURE_ENABLED=true` only in the Production EAS profile; Firebase emulators remain disabled and the default Firebase target remains `gathr-m1`. Mobile gates passed again: TypeScript; Jest 51/51 suites, 300/300 tests, and 1/1 snapshot; lint with 0 errors and 222 existing warnings; Mapbox verification; whitespace checks; and the OTA preflight against live commit `54d2c9944d09fbb627b459f60aaa027b7d92234e`.
- Published the iOS-only Production OTA group `4707f394-6e5f-44c5-b49c-f2024fcfb946`, update `01a04d5b-c29c-7c65-83e8-d9381e2b62ec`, runtime `1.1.10`, commit `b2b26f499851b9c9772deaf4e92a5f1892d5ad56`. Dashboard: `https://expo.dev/accounts/craigb/projects/gathr/updates/4707f394-6e5f-44c5-b49c-f2024fcfb946`.
- EAS lists the new group first on the Production branch and reports only platform `ios`. Compared with the previously live commit, no package, lockfile, app config, native iOS/Android, or config-plugin file changed; the only fingerprint candidate is `eas.json` environment configuration. Therefore no new native iOS build is required for runtime `1.1.10`.
- Direct adoption on the user's production iPhone remains the final external observation. Force-close and reopen GathR twice; the Profile footer should show `Runtime 1.1.10 · OTA 01a04d5b`, and Friends/Check in should be available. Android Production and all app-store build/submission tracks were untouched.

## 25. Release 2 approved product decisions

The following decisions were approved on 2026-08-30 and supersede any Release 1 assumption that conflicts with them:

- Check-in is contextual. A signed-in user sees an enabled **Check in here** action only after remaining near a recognized GathR venue or exact event location long enough to reject ordinary drive-by and walk-by detections.
- Check in is removed as a permanent Profile feature row. An active check-in may appear as a compact status badge with venue and remaining time.
- Everything moved into the Profile **More** sheet returns to the main Profile surface: Daily Hotspot, Trending on launch, Suggest a Facebook page, Replay tutorial, Share GathR, and Account & privacy.
- The check-in experience retains its validated fields but receives a branded, visual redesign centered on the detected venue rather than a generic form.
- Signed-in users can create Facebook-like friend events. These are private social objects, never unreviewed public GathR events.
- Event visibility labels are **All friends** and **Invited friends only**. Neither mode means internet- or platform-public.
- Friend events support recognized GathR venues, online/TBD locations, and custom private addresses in the first release.
- A host may create an event at any valid custom location; a location does not need to be a recognized GathR venue. The additional privacy controls govern who receives an exact residential address and when, not whether the host may use that address.
- Hosts can choose whether only the host may invite people or invited guests may invite additional people.
- Every friend event requires one canonical GathR category so existing category, date, and interest filters can apply.
- Friend events visible to the current user appear on the map through an initial **Friends** layer/filter. The layer is enabled by default for signed-in users and is designed so the toggle can later be removed without changing the event contract.

## 26. Contextual check-in and dwell eligibility

### Experience contract

- [x] Remove generic check-in discovery from Profile and avoid showing an enabled check-in action merely because map venue data is loaded.
- [x] Detect only exact, single-location recognized venues/events; area, route, online, TBD, and ambiguous multi-ID locations remain ineligible.
- [x] Use an initial configurable dwell target of 90 continuous seconds. Tune only after real-device drive-by, walk-by, indoor-GPS, and parking-lot tests.
- [x] Use a 50-metre venue base radius plus reported accuracy capped at 75 metres; reject samples whose reported accuracy is worse than 75 metres.
- [x] Reject qualifying samples while reported speed exceeds 10 km/h. Dwell time, not speed alone, remains the primary drive-by protection.
- [x] Reset eligibility after the user remains outside the accepted radius for 30 seconds. Short GPS jitter may pause rather than immediately erase progress.
- [x] Keep sampling foreground-only and low frequency. Release 2 does not introduce continuous background location tracking.
- [x] If more than one recognized venue qualifies, show only those nearby candidates in a focused selector after dwell succeeds; do not reopen the full venue directory.
- [x] Show **Check in here** in the eligible map/venue callout. The form opens with the venue fixed and visually prominent.
- [x] Let an active check-in remain manageable even after the user leaves: View map, Change audience/note/duration where valid, and Check out.

### Server enforcement and data minimization

- [x] Add short-lived server-controlled eligibility sessions so this is not merely a cosmetic client restriction.
- [x] Each heartbeat sends current coordinates and accuracy for validation; the server computes distance and discards raw coordinates rather than storing a location trail.
- [x] Persist only venue ID, qualifying start/last-seen timestamps, accumulated qualifying duration, accuracy bucket, and session expiry.
- [x] Require a fresh completed eligibility session when creating or replacing a check-in at a different venue.
- [x] Expire completed eligibility after five minutes if the user does not finish checking in.
- [ ] Add Firebase App Check enforcement before Production rollout to raise the cost of forged eligibility calls. Document that consumer GPS cannot provide absolute anti-spoofing proof.
- [x] Preserve the existing rule that only the chosen venue identity—not raw coordinates—is stored in the active check-in or friend projections.

### Required eligibility tests

- [x] Fast drive-by never becomes eligible in deterministic eligibility tests.
- [x] Ordinary walk-by shorter than the dwell target never becomes eligible in deterministic eligibility tests.
- [x] A stationary user with accurate samples becomes eligible once and sees the correct venue.
- [x] Indoor GPS jitter does not repeatedly reset a valid dwell session.
- [x] Leaving and returning cannot reuse an expired or reset session.
- [x] Multiple nearby venues return only safe exact candidates.
- [x] Forged timestamps, venue IDs, accuracy, speed, and replayed session IDs fail.
- [x] Denied permission, approximate-only permission, offline state, and location-service failure have clear non-blocking explanations.

## 27. Restored Profile information architecture

- [x] Delete the **More** feature row and its general-purpose sheet.
- [x] Restore compact main-page controls for Daily Hotspot and Trending on launch.
- [x] Restore Suggest a Facebook page, Replay tutorial, Share GathR, and the Account & privacy entry to the main Profile page.
- [x] Keep Account & privacy as a focused secondary sheet for email, sign out, and destructive account controls; its entry point must be on the main page.
- [x] Add a Social section containing Friends, My Events, and Create Event.
- [x] Add incoming-request and upcoming-invitation badges without turning the page into an activity feed.
- [x] Replace the permanent Check in row with a compact active-check-in badge only while a check-in exists.
- [x] Use the currently unused lower viewport before allowing parent-page scroll. Small screens and accessibility text may scroll as a fallback.
- [ ] Preserve the one-screen target at standard text size and verify at 1.3x text size on Android and iOS layouts. Android standard-size acceptance is complete; iOS and 1.3x Release 2 device acceptance remain pending.

## 28. Check-in visual redesign

- [x] Replace the outlined administrative form aesthetic with a branded venue-first card.
- [x] Lead with **You're at [venue]**, a GathR canopy treatment, and a clear eligible-location indicator.
- [x] Remove the generic venue search from the normal eligible flow. Keep a compact nearby-venue switcher only when multiple candidates passed dwell validation.
- [x] Present 30 min, 1 hr, and 2 hr as polished segmented duration controls.
- [x] Present audience choices with friend avatars, selected count, and clear **All friends** / **Choose friends** language.
- [x] Keep the optional 120-character note visually secondary.
- [x] Show a privacy summary pill immediately above the primary action: who can see it and the exact expiry time.
- [x] Add restrained success haptics and a canopy-themed venue treatment before returning to the map.
- [x] Redesign the active state as a compact venue pass with remaining time plus View map, Change, and Check out.
- [x] Keep the complete composer in one standard phone viewport; variable friend lists remain inside a focused picker.

## 29. Friend-created event product contract

### Core host flow

- [x] Add Create Event and My Events entry points from Profile plus an appropriate map/feed entry point.
- [x] Support draft autosave, preview, publish, edit, cancel, and delete.
- [x] Required fields: title, start time, end time or duration, canonical GathR category, visibility, and location type.
- [x] Optional fields: description, dress/details note, external link, and guest-list visibility.
- [ ] Add private, managed cover-image upload after the Storage ownership/deletion contract is deployed; arbitrary cover URLs are rejected.
- [x] Location types: recognized GathR venue, any validated custom private address, online, and location to be announced.
- [x] Default new events to **Invited friends only**. Switching to **All friends** must be explicit.
- [x] Show a privacy preview before publishing with the exact number of authorized friends and invitations.
- [x] Support Going, Maybe, and Can't Go responses plus host-visible response totals.
- [x] Support Add to calendar and Directions where location permits.
- [x] Cancellation is a durable event state with an explanation and viewer projection update, not a silent deletion.
- [ ] Add remote cancellation delivery with the deferred push-notification system.

### Invitations and guest expansion

- [x] Add `guestInviteMode: host_only | guests_can_invite`, controlled only by the host.
- [x] **All friends** initially authorizes the host's current friends. **Invited friends only** initially authorizes explicit host selections.
- [x] Snapshot the **All friends** audience when the event is published. A friendship created later must not silently reveal an existing event or private address; the host may deliberately refresh or add to the audience. Unfriending or blocking still revokes access immediately.
- [x] When `guests_can_invite` is enabled, an invited user may explicitly add another signed-in GathR user. That person receives only this event projection; the event does not become searchable or visible to general friends-of-friends.
- [x] Record who invited each person and show that provenance to the host.
- [x] Warn the host that enabling guest invitations can reveal event details and a private address to people the host did not originally select.
- [x] Let the host remove any guest or disable further guest invitations. Removal revokes the event and private location projections immediately.
- [x] Blocking overrides invitations. A blocked user cannot be newly invited and loses existing event access in both directions where applicable.
- [x] Add invite and guest-count ceilings, rate limits, deterministic retries, and abuse reporting.

### Event lifecycle and ownership

- [x] States: draft, published, canceled, ended, and deleted/tombstoned where lifecycle delivery requires it.
- [x] Release 2.0 has one host. Co-host roles are deferred until their edit, invite, cancellation, and account-deletion authority is fully designed.
- [x] Host edits to time, location, visibility, or cancellation generate privacy-safe viewer updates.
- [x] Account deletion cancels hosted events and removes their private locations and viewer projections; it never leaves an ownerless private address accessible.
- [ ] Event cover media remains disabled until managed private Storage has explicit ownership, deletion, size/type limits, and no path into public parser media without a separate verified promotion flow.

## 30. Custom private address safeguards

An exact home address is supported in Release 2. It carries higher privacy impact because it can identify a residence, may be cached or screenshotted after viewing, and can be exposed to new people when guest invitations are enabled. Software can revoke future access but cannot make someone forget or delete a screenshot of an address they already saw.

- [x] Geocode custom addresses server-side and never send address text or coordinates to analytics, crash metadata, or ordinary logs.
- [x] Store exact private location separately from the general event document in a server-controlled private-location record.
- [x] Put exact address/coordinates only into currently authorized viewer projections; do not expose them through collection-group queries, public deep links, search, parser flows, or business analytics.
- [x] Use fresh server-authoritative reads for exact private location and fail closed against cached address/location projections after revocation or offline launch.
- [x] Delete each viewer's exact-location projection immediately on uninvite, block, visibility reduction, cancellation, or event deletion.
- [x] Offer host controls to reveal the exact address immediately, two hours before, or when the event starts. Before reveal, authorized viewers see **Address shared later** and receive no exact coordinates.
- [x] Make the guest-invite warning especially explicit for custom-address events.
- [x] Never show a private-address event to anyone outside its authorized projections, even if they possess an old app link or event ID.
- [x] Explain in the host UI that revocation prevents future access but cannot retract information already viewed or captured.

## 31. Friend-event map, feed, category, and filtering

- [x] Add a required category selector sourced from the same canonical category definitions used by public events.
- [x] Apply existing category, date/time, family, and interest filters where their semantics are valid for friend events.
- [x] Add a **Friends** map layer/filter for signed-in users. Start enabled by default and persist the user's choice.
- [x] Architect friend-event composition as an authorized event source, not a second map engine, so the Friends toggle can later be removed cleanly.
- [x] Show only events the current user hosts or is authorized to view.
- [x] Known-venue and authorized custom-address events may appear at their exact map location. Online and TBD events do not receive a physical marker.
- [x] Use a distinct purple planned-event treatment so it cannot be confused with teal live check-in presence.
- [x] Preserve the normal category icon and tree/event filtering; the social treatment annotates rather than replaces event identity.
- [x] Feed cards identify the host/friend context, visibility, RSVP state, category, and whether the address is still hidden.
- [x] Event edits, cancellations, uninvites, blocks, and expiry remove or update map/feed projections immediately.

## 32. Approved social polish backlog

- [x] Incoming friend-request badge on Profile and Friends.
- [x] Upcoming friend-event invitation badge on Profile and My Events.
- [x] HTTPS friend profile links and QR-code handle sharing.
- [x] Clear empty states that teach handles, friends, contextual check-in, invitations, and map reactions.
- [ ] Remember privacy-safe audience preferences while still showing and confirming the final audience every time.
- [x] Add **Join them** and Directions actions for an authorized friend check-in; the action does not notify the checked-in friend.
- [x] Distinct map reactions for one friend present, multiple friends present, and an upcoming friend event.
- [x] Host option to hide the guest list from guests while retaining host visibility.
- [x] Draft autosave and recovery after app termination or network loss.
- [x] Explicit cancel-event flow and event-update history sufficient for viewers to understand material changes.
- [ ] Push notifications for requests, invitations, important event edits, cancellations, and optional friend presence only after permission, quiet-hours, dedupe, and privacy controls are designed.
- [ ] A later verified-business event creator uses a separate public workflow, trust model, moderation path, and analytics contract. Private friend events never become public automatically.

### Future GathR for Business boundary

- The mobile app already has the native capabilities needed for a lightweight **Claim this venue** entry, claim-status view, authenticated business contact flow, media selection/upload, notifications, deep links, analytics, and the existing ad renderer. No speculative business-only native dependency is required in the Release 2 iOS binary.
- The primary business control surface should be a responsive web dashboard with its own dependency boundary. It should cover venue claims, organization and staff roles, venue profile branding, hours/contact details, asset management, ad/special/event drafts, campaign controls, moderation status, billing, and analytics.
- Canonical business records must separate `organizations`, organization memberships and roles, venue ownership claims, verified venue-profile overrides, creative assets, campaigns, approvals, billing state, and append-only audit history. A verified owner controls an approved presentation layer; they do not overwrite parser provenance or publish arbitrary ads directly into the consumer map.
- Venue claims require proof, review, revocation, conflict handling, and account-recovery rules before launch. Staff permissions must be least-privilege, and every profile/ad mutation must identify the acting member.
- Existing Firebase Auth, callable APIs, Storage, App Check, image picker, notifications, deep links, and analytics should be reused. Add Stripe or another payment package only after web-versus-native checkout and merchant geography are decided; add identity/document verification only after a provider and retention policy are selected; add camera scanning only when an approved QR-scanning workflow exists.
- Business-created public events use canonical GathR categories and a separate moderation/publishing path. Friend events remain private social objects and cannot be converted into public business events implicitly.

## 33. Release 2 server data boundary

Proposed server-controlled collections and projections:

- `friendEvents/{eventId}`: canonical host-owned metadata without directly readable private address fields.
- `friendEventPrivateLocations/{eventId}`: exact custom address and coordinates, Admin SDK only.
- `friendEventInvitations/{eventId_memberUid}` or equivalent canonical invitation records with inviter provenance.
- `friendEventResponses/{eventId_memberUid}`: canonical RSVP state.
- `users/{viewerUid}/friendEvents/{eventId}`: minimal authorized event/map/feed projection.
- `users/{viewerUid}/friendEventLocations/{eventId}`: exact or delayed location projection only while authorized.
- `checkInEligibilitySessions/{uid_sessionId}`: short-lived dwell state without stored raw coordinate history.

All canonical mutations use authenticated callable functions. Clients cannot directly create friendships, event authorization, RSVP authority, dwell completion, or private-location projections.

## 34. Release 2 implementation and verification order

1. Create fresh mobile and backend sibling worktrees from the exact accepted live baselines; preserve unrelated parser and release work.
2. Finalize UI mockups, category semantics, private-address reveal controls, and the host-deletion policy before schema deployment.
3. Implement and test contextual dwell eligibility behind a disabled-by-default Release 2 feature flag.
4. Restore Profile content and implement the venue-first check-in visual redesign.
5. Implement canonical friend-event, invitation, RSVP, private-location, projection, block, cancellation, and cleanup services against local emulators.
6. Add Firestore rules and adversarial privacy tests before connecting mobile UI.
7. Build Create Event, My Events, invitation, RSVP, and host-management screens with fixed-screen primary flows and bounded pickers.
8. Integrate authorized friend events into event normalization, feeds, map composition, category/time filters, and the default-enabled Friends layer.
9. Add QR/profile sharing, badges, empty states, drafts, cancellation presentation, directions, and opt-in notifications in separately testable slices.
10. Run deterministic scale, retry, offline/cache, revocation, block, guest-expansion, address-leakage, and account-deletion tests.
11. Run Android development-client QA, release-like Preview QA, large-text/accessibility review, and iOS-compatible OTA/native-boundary checks.
12. Deploy only to isolated staging first. Production Firebase, OTA, native builds, and app-store tracks require a fresh live-state check, backups, explicit target scope, and final acceptance evidence.

### Release 2 definition of done

- [x] Deterministic drive-by and walk-by cases cannot expose an enabled check-in action.
- [x] Legitimate stationary venue users can check in without searching the venue directory.
- [x] Profile restores every displaced feature while retaining the one-screen target at standard Android text size.
- [x] Check-in has a polished venue-first design and complete accessible states.
- [x] Every friend-event visibility, invitation, RSVP, block, removal, cancellation, and deletion transition is server-authoritative and retry-safe.
- [x] Custom-address events leak no address, coordinates, map pin, deep-link content, cache content, or notification text to unauthorized users.
- [x] Guest invitation expansion follows the host setting, records the inviter, and clearly warns about private-address disclosure.
- [x] Friend events obey canonical categories and current map/feed filters.
- [x] Friends layer behavior is verified enabled, disabled, and structurally removable.
- [x] Existing public events, specials, check-in presence, parser data, ads, routes/areas, shared-event ingestion, guest mode, and account deletion have no unresolved automated or Android Preview regression.

### 2026-08-30 — Release 2 planning checkpoint

- Approved contextual check-in with continuous dwell to prevent drive-by and walk-by activation.
- Approved custom private addresses in the first friend-event release with exact-location projections and explicit host disclosure controls.
- Approved host-controlled guest invitation expansion and inviter provenance.
- Approved required canonical categories and authorized friend-event map rendering through an initially default-enabled Friends filter/layer.
- Approved restoring every current More-sheet feature to the main Profile and replacing the permanent Check in row with contextual entry plus an active-state badge.
- Approved the venue-first check-in visual direction and the complete social polish backlog in Section 32.
- This checkpoint records product and implementation decisions only; no application code, Firebase state, OTA, native build, or production data was changed.

### 2026-08-30 — Release 2 implementation and Android Preview acceptance

- Mobile worktree: `C:\Windows\System32\GathR-Project\GathR-friend-events-20260830`; branch `codex/friend-events-20260830`; runtime code commit `b4709c59c7e9ad4ef16edbd80cc8b537ca464724`. Backend worktree: `C:\Users\craig\Dev\gathr-apps-script-friend-events-20260830`; branch `codex/friend-events-backend-20260830`; commit `205b787`.
- Implemented contextual check-in eligibility with a server-controlled 90-second dwell, distance/accuracy/speed validation, reset/expiry/replay rules, overlapping exact-venue candidates, no raw-location trail, foreground-only sampling, and a nearby-candidate selector.
- Restored the main Profile dashboard, removed the generic More/check-in rows, added Social/My Events/Create Event and badges, retained the active-check-in badge, and kept the standard Android layout within one `1080x2400` viewport.
- Rebuilt Check-in as a venue-first GathR card with canopy treatment, verified-location state, duration segments, audience picker, privacy summary, success haptic, and compact active pass.
- Implemented the private friend-event lifecycle: draft, publish, preview, edit, RSVP, invite/remove guest, cancel, delete, history, report, calendar, directions, deep links, QR/profile sharing, and private guest-list controls.
- Event hosts may choose any validated custom address, a recognized GathR venue, an online destination, or TBD. Exact custom addresses live in an Admin-only canonical record and only current authorized viewers receive a fail-closed exact-location projection at the host's selected reveal time.
- Implemented all-friends audience snapshots, selected-friend invitations, guest-invite authority, inviter provenance, friendship/block revocation, category requirements, map/feed filtering, default-enabled Friends layer, purple friend-event markers, teal live-presence reactions, and Join them/Directions actions.
- Backend gates passed: 374/374 compiled tests, Firestore rules 7/7, social integration 29/29, callable/Auth E2E 2/2, TypeScript build, scoped lint, and a 22-callable live staging lifecycle smoke. All 26 isolated-staging functions were active after deployment.
- Mobile gates passed: TypeScript, 54/54 Jest suites with 313/313 tests and 1 snapshot, lint with 0 errors and 224 existing warnings, Mapbox runtime verification, and whitespace checks. Authentication analytics were additionally hardened so email/password-contaminated input cannot enter diagnostic events.
- Android Preview build `b4f43601-e694-4a32-a043-fde4aff0dc72` produced `artifacts\android\gathr-friend-events-preview-b4f43601.apk`, 229,225,309 bytes, SHA-256 `DFCEBAFFC188451574089C7401A6165F30904279625299B71D94E02D8D2B3E23`. It was installed with `adb install -r`; the final package is version `1.1.10` (13), non-debuggable, and retained app data.
- Device QA created an arbitrary-address event, invited a selected friend, verified **Address shared later** and disabled Directions before reveal, exercised Going RSVP, and rendered both the purple Friends map layer and teal recognized-venue friend check-in without a crash or ANR.
- Final Android-only Preview OTA group `aeda0f47-7901-43e0-80c6-419452e610bd`, update `01a05399-4767-7687-a912-9a01c5a1cac0`, runtime `1.1.10`, commit `b4709c59c7e9ad4ef16edbd80cc8b537ca464724`. The Profile footer proved adoption with `Runtime 1.1.10 · OTA 01a05399`, and staging friendship/check-in data rendered after restart.
- Device acceptance caught and superseded group `7263bc6e-4102-47d7-a2d9-697e81faea99`, whose export omitted the Preview Firebase variables and fell back to production authentication. The corrected publish explicitly loaded every Preview value from `eas.json`; no production deployment or data mutation occurred.
- Remaining deliberate Release 2 follow-ups are Production App Check enforcement/validation, managed private cover-image Storage, privacy-aware push delivery, remembered audience preferences, iOS/1.3x physical-device acceptance, and later verified-business publishing. They are not represented as completed.

### 2026-08-30 — iOS Preview native build checkpoint

- Dependency alignment updated the SDK 54 packages to Expo's current compatible patch versions and pinned `babel-preset-expo` locally so Jest cannot resolve a stale parent-directory preset. No speculative payment, document-verification, image-manipulation, or QR-scanning dependency was added.
- Added a staging iOS Firebase app for `com.craigb.gathr`, `GoogleService-Info.staging.plist`, and an EAS Preview-only App Check debug token. The debug token is stored as a sensitive EAS environment variable and is not present in Git or Production configuration.
- Added `npm run verify:preview`, which fails when the internal Preview profile, staging Firebase files, App Check mode, OTA channel, or Production separation drifts. The iOS Preview build number now auto-increments.
- Candidate commit `716f9c371dcb9c741535663a4fc3c0cc75527c7c` passed Expo Doctor 18/18, Expo dependency alignment, TypeScript, lint with zero errors, 54/54 Jest suites with 313/313 tests, Mapbox verification, Preview configuration verification, whitespace checks, and a complete iOS export of 2,675 modules.
- EAS build `c60594c6-80bf-4e40-9270-327f525821d0` finished as iOS internal Preview build `1.1.10` (78), runtime `1.1.10`, channel `preview`, using active ad hoc profiles for both `com.craigb.gathr` and `com.craigb.gathr.share-extension`. Both profiles include the registered iPhone.
- Downloaded IPA: `C:\Users\craig\Downloads\GathR-1.1.10-build78-preview-c60594c6.ipa`, 60,345,559 bytes, SHA-256 `C85C3462F9907EEA10384D52097E5C4511B2DC47D751B6DE31B8D52A25ADF184`.
- Binary inspection verified bundle `com.craigb.gathr`, app `1.1.10` (78), staging Firebase project `gathr-social-staging`, staging iOS app ID `1:572784950053:ios:65bbf7aaa983e4c8e438cc`, share-extension inclusion, runtime `1.1.10`, Preview channel, OTA enabled, and check-on-launch `ALWAYS`.
- This checkpoint proves build integrity, not installation or end-user acceptance. Physical iPhone launch, login against staging, notification/App Check behavior, share-extension invocation, fixed-screen layouts, and 1.3x text-size review remain to be performed after installation. No App Store submission, Production build, or new Production OTA was made.
