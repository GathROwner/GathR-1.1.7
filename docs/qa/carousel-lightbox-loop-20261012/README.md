# Carousel lightbox looping — 2026-10-12

Carousel-opened lightboxes now wrap first to last and last to first using either arrow taps or horizontal swipes. The shared resolver returns original indices, preserving order, item count, viewed tracking, and carousel alignment. A single item has no navigation. Other lightbox callers retain bounded navigation unless they explicitly opt in.

Source baseline: `80f2ed6`, branch `codex/frontend-adjudicator-20261011`. Reversible baseline: `codex/carousel-lightbox-loop-baseline-20261012`. Live iOS Preview baseline: `8235a2b20551987a2eaf69e203802448338b7309`, group `c03d48df-b126-42e4-8d34-2c7c36e9c272`, runtime `1.1.10`.

## Native evidence

The real InterestsCarousel and EventImageLightbox were rendered through a temporary Events modal on the existing Android Preview debug client, s24 emulator, 1080 × 2400. No actual GathR map was mounted or manipulated. The fixture used four local synthetic IDs with numbered titles; no backend writes. The Events file was restored exactly before committing. `fixture.tsx.txt` is evidence only and is not imported by the app.

- `first-item.png`: first item has both navigation arrows.
- `arrow-wrap-last.png`: Previous on item 1 opens item 4; Next on item 4 returned to item 1.
- `swipe-wrap-last.png`: rightward swipe from item 1 opens item 4.
- `swipe-wrap-first.png`: leftward swipe from item 4 opens item 1.
- `close-on-last.png`: closing after wrapping to item 4 leaves the carousel on item 4 with the final logical dot selected.

The rendered screens were independently reviewed: header/address, hero, navigation arrows, actions, title, and bottom rows retained their hierarchy and spacing. Some immediate emulator captures showed delayed frames; those were excluded. The final settled captures and native hierarchy confirmed the selected items. This is Android native/shared-JavaScript evidence; iPhone adoption remains unverified.

## Checks

Four focused suites passed, 43 tests: lightbox wrap boundaries, repeated cycles, invalid indices, one/two-item cases, default bounded navigation, carousel geometry/order, and Family Friendly filtering. TypeScript passed after renaming an ignored historical source backup to `.tsx.txt` so it was no longer compiled. Expo lint exited zero with zero errors and 215 existing warnings.

Release candidate checks and publication metadata are recorded after assembly. No native dependency, runtime, backend, Android OTA, or Production release changes.
