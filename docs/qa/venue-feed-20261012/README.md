# Filtered venue feed paging — 2026-10-12

Source baseline: `87097381764dcbb0599c25cc48a3a36093bb73e3` on `codex/frontend-adjudicator-20261011`.
Release must retain the live iOS Preview baseline `3240740295f224a73eaedd901e63271923b8f940` (group `8ef99c71-f044-4b42-b914-b4755d91e16c`) and cherry-pick only this change.

## Native evidence

These are unedited 1080 × 2400 Android framebuffer captures from the existing s24 / emulator-5554 debug client (`com.craigb.gathr`, native 1.1.10), running Metro from this source worktree against staging. This proves shared JS/native Android rendering, not iOS OTA adoption. No map interaction, native install, backend edit, or fixture injection was used.

- `04-soul-results.png`: one Soul Fit row, three currently matching Today records, event counter and dots. Staging contains two distinct 6 PM Rebound Fit records plus a 7 PM dancing record; no data repair was attempted.
- `05-mid-drag.png`: real held horizontal gesture; adjacent full event card moves into view while the venue header remains fixed.
- `06-second-event.png`, `08-third-event.png`: chronological settled pages, independent photos, title, time, description and actions.
- `09-vertical-check.png`: vertical feed scroll, existing chrome hides, complete card footer remains reachable, final horizontal page has disabled forward control.
- `13-after-back.png`, `14-lightbox-previous.png`: selected 7 PM lightbox, then previous 6 PM event. Photo galleries remain available inside each event. Fullscreen photo zoom was also opened and dismissed.
- `15-return-selection.png`, `16-header-return.png`: closing returns to the same selected 6 PM event and vertical position; scrolling back reveals the shared header at 2 of 3.
- `17-category-single.png`: selecting Gatherings & Parties narrows Today to one record and restores the existing single-card treatment.
- `24-specials-settled.png`: Merchantman has eight Today specials in one row, original Specials filter panel intact.
- `26-specials-second.png`: native horizontal swipe settles on 2 of 8, replacing the oysters event with the beer special and retaining the shared venue header.

Reviewed hierarchy, alignment, spacing, pagination, real adjacent-card motion and action placement. Long venue names wrap to two lines and truncate only as necessary. Existing native font scaling is retained.

## Scope and checks

Only already-filtered records are grouped, using physical location identity and separate event/special types. Venue order retains existing ranking; pages use resolved occurrence start times. Private friend and broad-location events stay independent. End pages do not loop. Selection persists by event ID, including lightbox return. Only current and adjacent heavy event cards mount. Ads retain their existing components and appear between vertical venue rows.

Both filter-panel JSX blocks were compared against the source baseline and are identical. No filter styles, count semantics or filter behavior changed.

TypeScript passed. Six focused suites passed: 45 tests covering grouping, paging, retained callout navigation, lightbox boundaries and reading modes. Expo lint has zero errors and existing repository warnings. Release validation and iOS OTA metadata are recorded separately after assembly.

iPhone visual behavior/adoption still requires Craig's compatible Preview build. Android debug screenshots are not evidence of that adoption.
