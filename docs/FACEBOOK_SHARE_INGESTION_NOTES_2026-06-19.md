# Facebook Share Ingestion Notes - 2026-06-19

Branch: `codex/facebook-shared-event-intent`

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

## Backend Follow-Up

The app-side fix handles display and dedupe, but the cleaner upstream fix is still to merge or alias:

- `slug_peakesquaycharlottetown` -> `fb_100063789511997`

That would prevent future duplicate writes from entering public Firestore in the first place.

## Current Caveat

This note documents the app-side mitigation. It does not delete or rewrite existing Firestore public venue/event docs.
