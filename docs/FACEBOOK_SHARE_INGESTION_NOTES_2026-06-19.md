# Facebook Share Ingestion Notes - 2026-06-19

Branch: `codex/facebook-shared-event-intent`

## Checkpoint - 2026-06-19 19:57 Atlantic

This is the current checkpoint for the mobile preview branch, not a production
release checkpoint.

Repo/worktree:
- `C:\Windows\System32\GathR-Project\GathR-upgrade-sdk54`

Branch:
- `codex/facebook-shared-event-intent`

Current feature-code checkpoint commit:
- `430afd4 Allow map pan with zero search results`

Remote:
- Pushed to `origin/codex/facebook-shared-event-intent`

Preview OTA updates:
- iOS preview update group: `15966d30-36ca-4d61-95b9-f8b5eca11473`
- Android preview update group: `ba01ee77-7fc7-42a2-9b45-788441880e7e`
- The all-platform EAS update command failed because the existing web export
  cannot resolve `react-native-image-viewing`. Native-only iOS and Android
  updates published successfully.

Local working tree caveat:
- `.claude/settings.local.json` is locally modified and unrelated.
- `.codex-devserver.*`, `.codex-tsc.log`, and the untracked SDK54 handoff doc
  are local artifacts and were not included in this checkpoint.

## Working Workflows At This Checkpoint

Facebook share into GathR:
- Facebook shares route to `app/shared-event.tsx`.
- The app shows branded `Opening GathR` / `Sent to GathR` screens.
- The receipt gives a fast confirmation first, then updates when the parser
  returns initial candidate events.
- Repeated shares no longer get stuck on stale dismissed share intents.
- Cold-start share routing now reaches the shared-event screen instead of only
  opening the app shell.

Facebook event/post parsing:
- Shared text, source URL, Open Graph/Facebook metadata where available, and
  attached/preview images are sent through the `submitSharedEvent` Cloud
  Function endpoint.
- The app distinguishes Facebook Event vs Facebook Post in the receipt copy.
- Public-looking Facebook shares can be routed as public candidates for review.
- Restricted/private/user-only sources remain private/user-scoped unless later
  promoted.
- The initial receipt uses "initial matches" language because a public Facebook
  post scrape may add or update events later after review.

Photo/image share:
- Direct image shares from Photos are supported.
- Up to 6 local shared images are uploaded through `uploadSharedEventImage`,
  then submitted through `submitSharedEvent`.
- Image shares are treated as private/user-owned by default.
- Calendar/flyer images can extract multiple event candidates and show them in
  a compact detail carousel.

Map/list integration:
- Private shared events are read from
  `users/{uid}/privateSharedEvents` for the current user only.
- Private shared events are normalized into the same app `Event` model as
  public events.
- Public Firestore events can show current-user shared provenance when backend
  metadata contains `sharedEventOwnerUid` for the signed-in user.
- Events, Specials, and map callouts can show a `Shared by you` badge through
  `sharedEventProvenance.sharedByCurrentUser`.
- Shared events now appear in normal map/list surfaces instead of a separate
  isolated share-only UI.

Venue grouping and identity:
- Public/private event merge keys use normalized title, venue, and time.
- Map venue grouping prefers normalized venue-name + normalized address when
  safe, then falls back to raw `venueId`.
- `utils/venueIdentity.ts` normalizes common parser variations such as:
  `Peake's Quay`, `Peake s Quay`, `Peake's Quay Restaurant & Bar`, and
  `Peake's Quay - Peake's Quay added a new photo.`
- Real subvenues such as `Founders' Food Hall and Market - Group Stage` are
  preserved as separate display locations unless aliased upstream.

Map return stability:
- Returning from the shared-event receipt no longer closes newly opened
  callouts through stale map blur cleanup.
- The shared-event return guard prevents immediate overlay/map-press cleanup
  from consuming the next user interaction.
- Android emulator testing confirmed callouts remain open after returning from
  a share flow.

Zero-result search behavior:
- A search/filter state that yields zero filtered events is now treated as a
  ready empty state.
- The map no longer renders the transparent "clusters not ready" touch blocker
  when there are no filtered results.
- Android emulator testing confirmed a zero-result search could still pan the
  map and generated non-programmatic camera-change logs.

## Known Limits / Follow-Ups

Full Facebook multi-image posts:
- iOS/Android share payloads only include what the OS/share extension provides.
- If Facebook does not pass all post images to the share extension, the app-side
  initial scan cannot OCR images it never received.
- Public Facebook post URLs can still be passed onward for backend/full-post
  review, so the user-facing receipt intentionally says the full post may add
  or update more events later.

Unknown venues and subvenues:
- Shared private events use venue matching against the venue directory before
  they appear on the map.
- Subvenue naming is currently preserved in the app. If the backend should
  collapse a subvenue to a parent venue, that should be handled by venue alias
  or unknown-venue resolution upstream, not by blindly stripping suffixes in the
  mobile app.

Public promotion/review:
- The app can submit public candidates and render public events with shared
  provenance when backend metadata is present.
- This checkpoint does not claim that every shared candidate is automatically
  promoted to public Firestore without backend validation.
- The public review/promotion path should remain separate from private
  user-owned shared events.

Existing public duplicate data:
- The Peake's Quay mobile mitigation groups duplicate venue identities for
  display, but does not delete or rewrite existing public Firestore venue/event
  documents.
- Cleaner backend follow-up remains: alias or merge
  `slug_peakesquaycharlottetown` into `fb_100063789511997`.

## Test Cases Used

Facebook share examples:
- Hunter's Ale House schedule post: multiple music events extracted and shown
  in a carousel.
- Darcy's Trivia post: relative "Thursday" parsing and expired-event handling.
- Baba's Lounge monthly calendar: large image calendar extraction with expired
  and future/current event handling.
- Founders' Food Hall posts/images: multi-event image extraction, image shares,
  private map/list display, and shared provenance badge.
- Peake's Quay posts: venue normalization and `Shared by you` badge behavior.
- Island Tides image share: multiple private photo-share events extracted and
  later visible on the map.

Automated/local verification:
- `npx tsc --noEmit --pretty false`
- Android emulator with adb/logcat for share return, callout stability, venue
  grouping, and zero-result map pan behavior.

## Current Share Flow

- Facebook/photo shares land on the shared-event confirmation route.
- The confirmation screen saves the share quickly, then shows a branded "Sent to GathR" result screen.
- Public Facebook posts/events are submitted for public review.
- Private or direct photo shares are saved as user-private shared events unless later promoted.
- Parsed private/user-share events are shaped into the same app `Event` model used by public parsed events so the map/list cards can render them normally.

## Callout Flash Fix

Problem:
- After a user tapped `Done` from the share confirmation screen, map callouts could open and immediately close.
- This was especially visible after returning from Facebook share flows.

Cause:
- The map blur cleanup effect was running after route state changed back to the map.
- Its dependency list included live selection/filter state, so delayed cleanup could clear a newly opened callout even though the user was back on the map.

Fix:
- Track whether the map was actually focused before allowing the delayed blur cleanup to run.
- Read the latest map state inside the delayed cleanup instead of using stale effect dependencies.
- Only clear selected venues/filter panels on a real focused-to-blurred transition.

Verification:
- Android emulator with logcat.
- Reproduced share-return navigation.
- Tapped filtered clusters after returning to the map.
- Confirmed no stale `[MapFocusCleanup] clearing map-only UI after blur` log fired for active map interactions.
- Confirmed callout stayed open.

Committed as:
- `77ebe22 Fix map callout cleanup after share return`

## Peake's Quay Duplicate Venue Investigation

User symptom:
- Searching/tapping Peake's Quay showed two venue cards both named Peake's Quay.

Backend data found:
- The public backend currently exposes two venue records for the same physical place:
  - `fb_100063789511997`
  - `slug_peakesquaycharlottetown`
- Both records have the same real-world location and Facebook URL, but differ by ID and apostrophe style in display text.
- Public event docs also existed under both venue IDs for the same events, for example Brothers MacPhee and Kim Albert.

Important conclusion:
- The split was not just caused by two share types.
- Shared events exposed a real public-data duplication issue because the map grouped venues by raw `venueId`.

App-side fix:
- Event merge keys now normalize title, venue, and time using the existing merge-normalization helpers.
- Map venue grouping now prefers a normalized venue-name + normalized address signature before falling back to raw `venueId`.
- Scoped city/area/route events still avoid venue-signature grouping and keep their existing behavior.

Why this is safe:
- It only collapses same physical venue signatures when there is an address.
- If there is no usable address, the existing `venueId` fallback is preserved.
- City/area/route display-location behavior is not changed.

Verification:
- Android emulator, current Expo dev client.
- With search `Peake`, the map filtered to one Peake cluster.
- Logcat on cluster tap:
  - `clusterId: venue-signature:peakes quay_11 great george st charlottetown pe c1a 4j7 canada`
  - `venue_count: 1`
  - `selectedVenueCount: 1`
  - rendered venue name: `Peake's Quay`
- Screenshot showed one Peake venue card with `4 Events | 1 Specials`, not two Peake venue cards.

Second-pass parser-name normalization:
- The Peake duplicate could still reappear when a parser path produced a venue label like:
  - `Peake's Quay - Peake's Quay added a new photo.`
  - `Peake's Quay Restaurant & Bar`
  - `Peake s Quay` / malformed apostrophe variants
- Added `utils/venueIdentity.ts` as the shared venue identity normalizer for:
  - public/private event dedupe keys
  - loose public/private event merge comparisons
  - private shared-event venue directory matching
  - map venue grouping
- The helper strips city pipe suffixes, apostrophe variants, social-action tails, and generic restaurant/bar suffixes.
- It also preserves real subvenues such as `Founders' Food Hall and Market - Group Stage`; those should remain separate venue identities unless explicitly aliased upstream.

Second-pass verification:
- TypeScript check: `npx tsc --noEmit --pretty false`
- Local helper harness confirmed these all normalize to `peakes quay`:
  - `Peake's Quay`
  - `Peake s Quay`
  - `Peake's Quay | Charlottetown PE`
  - `Peake's Quay Restaurant & Bar`
  - `Peake's Quay - Peake's Quay added a new photo.`
- Android emulator/logcat after clean load showed one `Peake's Quay` venue bucket.
- Android emulator/logcat after search `Kim` showed `filteredEvents: 1`, `venues: 1`, `clusters: 1`.

## Backend Follow-Up

The app-side fix handles display and dedupe, but the cleaner upstream fix is still to merge or alias:

- `slug_peakesquaycharlottetown` -> `fb_100063789511997`

That would prevent future duplicate writes from entering public Firestore in the first place.

## Current Caveat

This note documents the app-side mitigation. It does not delete or rewrite existing Firestore public venue/event docs.
